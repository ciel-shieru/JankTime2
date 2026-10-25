import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Pebble package targets an Alloy watchface on emery", () => {
    const pkg = JSON.parse(read("../package.json"));
    assert.equal(pkg.pebble.projectType, "moddable");
    assert.deepEqual(pkg.pebble.targetPlatforms, ["emery"]);
    assert.equal(pkg.pebble.watchapp.watchface, true);
    assert.match(pkg.pebble.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test("design contract describes eleven metric slots and reserved image cell", () => {
    const layout = read("../docs/design/layout.md");
    assert.match(layout, /eleven configurable metric slots/i);
    assert.match(layout, /grid\.bottom\.3/);
    assert.match(layout, /ellipsis/i);
    assert.match(layout, /HH:mm/);
    const model = read("../src/ts/watch/model.ts");
    for (const slot of [
        "grid.top.1", "grid.top.2", "grid.top.3", "grid.top.4", "grid.top.5",
        "grid.bottom.1", "grid.bottom.2", "grid.bottom.4", "grid.bottom.5",
        "clock.left", "clock.right",
    ]) {
        assert.ok(model.includes('"' + slot + '"'), "Missing configurable slot " + slot);
    }
    assert.match(model, /function validateSlotConfiguration/);
    const bridge = read("../src/ts/watch/bridge.ts");
    assert.match(bridge, /pieces.length > 56/);
    assert.match(bridge, /function validTime/);
    assert.match(bridge, /function validSlot/);
    assert.match(bridge, /function validMetric/);
    assert.match(bridge, /phoneBattery/);
    assert.match(bridge, /heartSamples/);
    const pkg = JSON.parse(read("../package.json"));
    assert.deepEqual(pkg.pebble.messageKeys, ["TYPE", "ID", "VALUE", "FLAGS", "EXTRA"]);
    assert.match(bridge, /input: 124/);
    assert.match(bridge, /output: 124/);
    const alloyTypes = read("../src/ts/watch/alloy.d.ts");
    assert.match(alloyTypes, /input\?: number/);
    assert.match(alloyTypes, /output\?: number/);
    assert.match(model, /function selectAlarmOrBedtime/);
    assert.match(model, /function clipByWidth/);
    const workflow = read("../.github/workflows/ci.yml");
    assert.match(workflow, /check_screenshot\.py/);
    const manifest = JSON.parse(read("../src/embeddedjs/manifest.json"));
    assert.deepEqual(manifest.resources, {});
    const renderer = read("../src/ts/watch/main.ts");
    assert.match(renderer, /new render\.Font\(bold \? "Gothic-Bold" : "Gothic-Regular", size\)/);
    assert.match(renderer, /systemFont\(14\)/);
    assert.match(renderer, /systemFont\(9\)/);
    assert.ok(renderer.includes('new render.Font("Leco-Bold", 36)'), "Clock must use the 36px Leco bold-numbers system font");
    assert.match(renderer, /centered\(formatTime24\(lastDate\), clockFont, black, 100, 124\)/);
    assert.match(renderer, /drawBaseline\(String\(minimum\) \+ "\/" \+ String\(maximum\), smallFont, black, 168, 147\)/);
    assert.match(renderer, /const mdiLightAlarm = \[/);
    assert.match(renderer, /const mdiLightBluetooth = \[/);
    assert.match(renderer, /drawMdiLightGlyph/);
    assert.match(renderer, /MaterialDesignLight-SVG/);
    assert.match(renderer, /fillRectangle\(color, left \+ start, top \+ y, x - start, 1\)/);
    assert.match(renderer, /centered\(safe === null \? "--" : String\(safe\)/);
    const refreshSource = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/data/RefreshIntervals.kt");
    assert.match(refreshSource, /config\.genericSensorEntity/);
    assert.match(refreshSource, /updateHaMetric\("haSensor"\)/);
    assert.match(refreshSource, /Failure of one entity must not prevent independent HA metrics updating/);
    assert.match(refreshSource, /A bad query only marks its own metric stale/);
    const companionScreen = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/MainActivity.kt");
    assert.match(companionScreen, /Generic Home Assistant sensor entity/);
    const companionBridge = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/pebble/PebbleBridge.kt");
    assert.match(companionBridge, /senderDelegate = lazy/);
    assert.match(companionBridge, /Service not registered/);
    assert.match(companionBridge, /FailedDifferentAppOpen/);
    assert.match(companionBridge, /Open the JankTime2 watchface on the Pebble before refreshing/);
    assert.match(companionBridge, /FailedNoPermissions/);
    assert.doesNotMatch(renderer, /String\(safe\) \+ "%"/);
    assert.match(renderer, /const bluetoothConnected = watch\.connected\.app/);
    assert.match(renderer, /baselineY - font\.height/);
    const configSource = read("../src/ts/watch/config.ts");
    assert.match(configSource, /PREVIEW_MODE = false/);
    const previewScript = read("../scripts/enable-preview.mjs");
    assert.match(previewScript, /Refusing to enable preview mode/);
    const boot = read("../src/c/mdbl.c");
    assert.match(boot, /ModdableCreationRecord/);
    assert.match(boot, /\.slot = 31744/);
    assert.match(boot, /\.chunk = 19456/);
    assert.match(boot, /\.fxBuildFFI = fxBuildFFI/);
    assert.deepEqual(pkg.pebble.capabilities, ["health"]);
    const ffi = manifest.ffi;
    assert.deepEqual(ffi.sources, ["../c/health_ffi.c"]);
    assert.deepEqual(Object.keys(ffi.functions).sort(), [
        "health_metric", "health_refresh", "health_sample", "health_sample_count",
    ].sort());
    assert.match(read("../src/c/health_ffi.c"), /health_service_sum_today\(HealthMetricStepCount\)/);
    assert.match(read("../src/c/health_ffi.c"), /health_service_get_minute_history/);
    assert.match(read("../src/ts/watch/health.ts"), /function formatSleepMinutes/);
    assert.match(read("../src/ts/watch/health.ts"), /localStorage\.getItem/);
    assert.match(read("../src/ts/watch/health.ts"), /stepsStale: freshSteps === null/);
    assert.match(read("../src/ts/watch/health.ts"), /MAX_SAMPLES = 16/);
    assert.ok(model.includes('focusCount: { value: "4 / 7"'), "Focus-count formatting must match the approved layout");
    const companionConfig = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/config/CompanionConfig.kt");
    assert.ok(!companionConfig.includes("or vector(0)"), "Missing Alertmanager series must not silently become zero");
    const worker = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/data/RefreshWorker.kt");
    assert.match(worker, /scheduleNext\(\)/);
    assert.doesNotMatch(worker, /finally/);



});

test("all accepted architecture decisions are present", () => {
    for (const path of [
        "../docs/adr/ADR-0001-typescript-alloy.md",
        "../docs/adr/ADR-0002-layout-and-slots.md",
        "../docs/adr/ADR-0003-native-phone-bridge.md",
        "../docs/adr/ADR-0004-network-security-and-cache.md",
        "../docs/adr/ADR-0005-wakey-export.md",
        "../docs/adr/ADR-0006-pebble-health-ffi.md",
        "../docs/adr/ADR-0007-mindwtr-server.md",
        "../docs/adr/ADR-0008-ci-and-screenshot.md",
        "../docs/adr/ADR-0009-pixel-font-and-layout-renderer.md",
        "../docs/adr/ADR-0010-appmessage-protocol.md",
        "../docs/adr/ADR-0011-alloy-memory-budget.md",
        "../docs/adr/ADR-0012-home-assistant-provider.md",
        "../docs/adr/ADR-0013-prometheus-alertmanager-provider.md",
        "../docs/adr/ADR-0014-android-calendar-provider.md",
        "../docs/adr/ADR-0015-image-and-epaper-rendering.md",
        "../docs/adr/ADR-0016-font-resource-and-blank-screen-regression.md",
    ]) {
        assert.ok(existsSync(new URL(path, import.meta.url)), "Missing ADR: " + path);
    }
});

test("native companion is selected instead of PebbleKit JS", () => {
    assert.equal(existsSync(new URL("../src/pkjs/index.js", import.meta.url)), false);
});
