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
    const emulatorInstaller = read("../scripts/install-emulator-deps.py");
    assert.match(emulatorInstaller, /def run_with_retries/);
    assert.match(emulatorInstaller, /APT_ATTEMPTS = 4/);
    assert.match(emulatorInstaller, /time\.sleep\(delay\)/);
    assert.match(emulatorInstaller, /"--snapshot", snapshot, \*pins/);
    const manifest = JSON.parse(read("../src/embeddedjs/manifest.json"));
    assert.deepEqual(manifest.resources, {});
    assert.ok(manifest.modules["*"].includes("./mdi-icons"), "The MDI mask module must be included in the embedded watch build.");
    const renderer = read("../src/ts/watch/main.ts");
    assert.match(renderer, /new render\.Font\(bold \? "Gothic-Bold" : "Gothic-Regular", size\)/);
    assert.match(renderer, /systemFont\(14\)/);
    assert.match(renderer, /systemFont\(9\)/);
    assert.ok(renderer.includes('new render.Font("Leco-Bold", 36)'), "Clock must use the 36px Leco bold-numbers system font");
    assert.match(renderer, /centered\(formatTime24\(lastDate\), clockFont, black, 100, 135\)/);
    assert.match(renderer, /drawBaseline\(String\(minimum\) \+ "\/" \+ String\(maximum\), smallFont, black, 168, 147\)/);
    const mdi = read("../src/ts/watch/mdi-icons.ts");
    assert.ok(mdi.includes("export const MDI_ICON_MASKS"));
    assert.ok(existsSync(new URL("../third-party-notices/MaterialDesign-SVG-LICENSE.txt", import.meta.url)), "The MDI license notice must ship with the raster masks.");
    const iconLines = mdi.split("\n").filter((line) => line.trim().startsWith('"'));
    assert.equal(iconLines.length, 25);
    assert.ok(iconLines.every((line) => line.split('"')[3]?.length === 64), "Each MDI glyph must be a bounded 16×16 mask");
    assert.ok(renderer.includes("function drawMdiGlyph"));
    assert.ok(renderer.includes("function weatherIcon"));
    assert.ok(renderer.includes('"battery-outline", width, height'), "Battery glyph must use the horizontal MDI outline mask.");
    assert.ok(renderer.includes('PREVIEW_MODE ? (displayState.weatherCondition ?? "partlycloudy")'), "Preview should use a real MDI weather condition.");
    assert.ok(renderer.includes('case "focusCount": icon = "check-circle-outline"'));
    assert.ok(renderer.includes('drawMdiGlyph(11, 141, heartColor, "heart", 14, 14)'));
    assert.ok(renderer.includes('drawMdiGlyph(cx, cy, color, icon, 16, 16)'));
    assert.ok(renderer.includes("drawBattery(143, 4, 26"));
    assert.ok(renderer.includes("drawBattery(172, 4, 26"));
    assert.ok(renderer.includes("drawBluetooth(136, statusCenterY"));
    assert.ok(renderer.includes("const timeRight = 116"));
    assert.ok(renderer.includes("drawAlarm(timeRight + 8, statusCenterY, alarmColor)"), "Alarm glyph must sit immediately before Bluetooth in the right-justified status cluster.");
    assert.ok(renderer.includes("const statusCenterY = 10"));
    assert.ok(renderer.includes("planetTop = 62"));
    assert.ok(renderer.includes('rows.some((row) => row.includes("1"))'), "An empty image should keep the framed image cell instead of clearing the frame.");
    assert.ok(renderer.includes('drawMetric("grid.bottom.1", 20, 72, 98, 36)'));
    assert.ok(renderer.includes('centered(formatTime24(lastDate), clockFont, black, 100, 135)'));
    assert.ok(renderer.includes('drawMetric("clock.left", 20, 108, 134, 36)'));
    assert.match(renderer, /centeredAtY\(safe === null \? "--" : String\(safe\)/);
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
    const backupSource = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/config/ConfigBackup.kt");
    assert.ok(backupSource.includes("schemaVersion"));
    assert.ok(backupSource.includes("MAX_IMPORT_BYTES"));
    assert.ok(backupSource.includes("Metric slots must be a JSON object."));
    assert.ok(backupSource.includes("Selected calendar IDs must be a JSON array."));
    assert.ok(backupSource.includes("Calendar blocklist must be a JSON array."));
    assert.ok(backupSource.includes("imageRows"));
    assert.ok(backupSource.includes("Image backup must be a 30×30 one-bit map."));
    assert.ok(backupSource.includes("validateHttpsUrl"));
    assert.ok(backupSource.includes("secrets: Map<String, String>?"));
    assert.ok(companionScreen.includes("Export without secrets"));
    assert.ok(companionScreen.includes("Danger: plaintext secrets"));
    assert.ok(companionScreen.includes("Restore included secrets"));
    assert.ok(companionScreen.includes("refreshAndSend(forceRefresh = true)"));
    assert.ok(companionScreen.includes("Import from file"));
    assert.ok(workflow.includes("ANDROID_DEBUG_KEYSTORE_BASE64"));
    assert.ok(workflow.includes("ANDROID_DEBUG_KEYSTORE_STORE_PASSWORD"));
    assert.ok(workflow.includes("ANDROID_DEBUG_KEYSTORE_KEY_PASSWORD"));
    assert.ok(workflow.includes("ANDROID_DEBUG_KEYSTORE_KEY_ALIAS"));
    assert.ok(workflow.includes("JANKTIME2_PRIVATE_DEBUG_SIGNING=false"));
    assert.ok(workflow.includes("JANKTIME2_PRIVATE_DEBUG_SIGNING=true"));
    assert.ok(workflow.includes("env.JANKTIME2_PRIVATE_DEBUG_SIGNING == 'true'"));
    assert.ok(workflow.includes("android_tasks=(:app:testDebugUnitTest :app:lintDebug)"));

    assert.ok(workflow.includes("base64 --decode"));
    assert.ok(workflow.includes("name: screenshot_emery.png"));
    assert.ok(workflow.includes("name: app-debug.apk"));
    assert.equal((workflow.match(/archive: false/g) || []).length, 7, "Every single-file CI output must be uploaded without a ZIP archive");
    assert.ok(workflow.includes("actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"));
    assert.ok(workflow.includes("path: artifacts/screenshot_emery.png"));
    assert.ok(workflow.includes("path: release/janktime2-emery-production.pbw"));
    assert.doesNotMatch(workflow, /echo\s+["']?\$ANDROID_DEBUG_KEYSTORE_(?:BASE64|STORE_PASSWORD|KEY_PASSWORD|KEY_ALIAS)\b/);
    assert.doesNotMatch(workflow, /path: artifacts\/\s*$/m);
    assert.doesNotMatch(workflow, /name: janktime2-emery-screenshot-and-logs/);
    const gradleSigning = read("../companion/android/app/build.gradle.kts");
    assert.ok(gradleSigning.includes('create("ciDebug")'));
    assert.ok(gradleSigning.includes('signingConfigs.getByName("ciDebug")'));
    assert.doesNotMatch(renderer, /String\(safe\) \+ "%"/);
    assert.match(renderer, /watch\.connected\.app \? blue : red/);
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
        "../docs/adr/ADR-0017-configuration-backup-and-secret-disclosure.md",
    ]) {
        assert.ok(existsSync(new URL(path, import.meta.url)), "Missing ADR: " + path);
    }
});

test("native companion is selected instead of PebbleKit JS", () => {
    assert.equal(existsSync(new URL("../src/pkjs/index.js", import.meta.url)), false);
});

test("temporary diagnostic branch renders privacy-safe watch receiver status", () => {
    const config = read("../src/ts/watch/config.ts");
    const bridge = read("../src/ts/watch/bridge.ts");
    const renderer = read("../src/ts/watch/main.ts");
    const guide = read("../docs/debugging/temporary-diagnostic-build.md");
    assert.match(config, /DIAGNOSTIC_MODE = true/);
    assert.match(bridge, /export const receiverDiagnostics/);
    assert.match(bridge, /safeDiagnosticMessageId/);
    assert.match(renderer, /JANKTIME2 RX DEBUG/);
    assert.match(renderer, /Current mapping:/);
    assert.match(renderer, /Slots applied:/);
    assert.match(guide, /Do not uninstall, clear its storage/);
    assert.match(guide, /grid\.top\.1/);
    assert.match(guide, /must not be cherry-picked into the normal branch/);
    assert.match(bridge, /onWritable\(\)/);
    assert.match(bridge, /\["TYPE", "diagnostic"\]/);
    assert.match(bridge, /queueDiagnosticSnapshot\(\)/);
    const manifest = read("../companion/android/app/src/main/AndroidManifest.xml");
    assert.match(manifest, /WatchDiagnosticListenerService/);
    assert.match(manifest, /io\.rebble\.pebblekit2\.RECEIVE_DATA_FROM_WATCH/);
    const listener = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/pebble/WatchDiagnosticListenerService.kt");
    assert.match(listener, /BasePebbleListenerService/);
    assert.match(listener, /watch_receiver_diagnostic/);
    assert.match(listener, /safeDiagnosticSummary/);
    assert.doesNotMatch(listener, /Log\.[diwe]\(.*data/);
});
