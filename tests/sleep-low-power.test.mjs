import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("sleep state is watch-local and activity API is availability-guarded", () => {
    const ffi = read("../src/c/health_ffi.c");
    assert.match(ffi, /METRIC_IS_SLEEPING = 4/);
    assert.match(ffi, /health_service_any_activity_accessible\(sleep_activities, activity_start, now\)/);
    assert.match(ffi, /health_service_peek_current_activities\(\)/);
    assert.match(ffi, /HealthActivitySleep\s*\|\s*HealthActivityRestfulSleep/);
    assert.match(ffi, /active_activities\s*&\s*sleep_activities/);
    assert.match(ffi, /s_metric_values\[METRIC_IS_SLEEPING\]\s*=\s*-1/);
    assert.match(ffi, /if \(s_metric_values\[METRIC_IS_SLEEPING\] != 1\)/);
    assert.match(ffi, /metric > METRIC_IS_SLEEPING/);
});

test("initial native health state treats sleep status as unknown", () => {
    const main = read("../src/ts/watch/main.ts");
    const initializerStart = main.indexOf("let nativeHealth: NativeHealthSnapshot = {");
    const initializerEnd = main.indexOf("\n};", initializerStart);
    assert.ok(initializerStart >= 0 && initializerEnd > initializerStart, "Expected the native health initializer");
    const initializer = main.slice(initializerStart, initializerEnd);
    assert.match(initializer, /isSleeping: false/);
    assert.match(initializer, /sleepStateStale: true/);
});

test("sleep-state snapshot fails open and avoids flash writes during sleep", () => {
    const health = read("../src/ts/watch/health.ts");
    assert.match(health, /Natives\.health_metric\(4\)/);
    assert.match(health, /isSleeping: freshSleepState === true/);
    assert.match(health, /sleepStateStale: freshSleepState === null/);
    assert.match(health, /if \(freshSleepState !== true\)/);
    assert.match(health, /let memoryCache: HealthCache \| null = null/);
});

test("low power renders local data only and preserves clock/graph geometry", () => {
    const main = read("../src/ts/watch/main.ts");
    const drawStart = main.indexOf("function draw(event?: AlloyWatchMinuteEvent): void {");
    const branchStart = main.indexOf("if (lowPowerMode) {", drawStart);
    const branchEnd = main.indexOf("\n    const rowOne = [", branchStart);
    assert.ok(drawStart >= 0 && branchStart >= 0 && branchEnd > branchStart, "Expected an early low-power render branch");
    const branch = main.slice(branchStart, branchEnd);
    assert.match(branch, /centered\(formatTime24\(lastDate\), clockFont, black, 100, 135\)/);
    assert.match(branch, /drawLocalSleepMetric\("totalSleep", 20, 108, 134, 36\)/);
    assert.match(branch, /drawLocalSleepMetric\("restfulSleep", 180, 108, 134, 36\)/);
    assert.match(branch, /drawHeartRate\(\)/);
    assert.match(branch, /render\.end\(\);\s*return;/);
    assert.doesNotMatch(branch, /drawMetric\(|drawPlanet\(|drawRows\(|phoneBattery|alarmTime|phoneBluetooth/);
    const statusStart = main.indexOf("function drawStatus(date: Date, sleeping: boolean): void {");
    const statusEnd = main.indexOf("\nfunction draw(event?: AlloyWatchMinuteEvent): void {", statusStart);
    const status = main.slice(statusStart, statusEnd);
    const sleepStatus = status.slice(status.indexOf("if (sleeping) {"), status.indexOf("const previewAlarm"));
    assert.match(sleepStatus, /drawBattery\(rightBatteryCx, statusCenterY, batteryWidth, batteryHeight, watchBatteryPercent, blue\)/);
    assert.doesNotMatch(sleepStatus, /displayState|watch\.connected|phoneBattery|alarmTime/);
});

test("sleep mode ignores phone messages and defers persistence until wake", () => {
    const bridge = read("../src/ts/watch/bridge.ts");
    assert.match(bridge, /let lowPowerMode = false/);
    assert.match(bridge, /if \(lowPowerMode\) return;\s*try \{/);
    assert.match(bridge, /export function setBridgeLowPowerMode\(active: boolean\)/);
    assert.match(bridge, /if \(!lowPowerMode\) persistDisplayState\(\)/);
    assert.match(bridge, /function changed\(\): boolean \{\s*if \(lowPowerMode\) return false/);
});

test("documentation excludes wrist detection and records the local-only layout", () => {
    const readme = read("../README.md");
    const layout = read("../docs/design/layout.md");
    const adr = read("../docs/adr/ADR-0019-sleep-triggered-low-power-mode.md");
    assert.match(readme, /Sleep-triggered low-power mode/);
    assert.match(layout, /Sleep-triggered low-power mode/);
    assert.match(adr, /No wrist detection/);
    assert.match(adr, /HealthActivitySleep/);
});
