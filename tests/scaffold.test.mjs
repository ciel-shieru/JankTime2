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
    assert.match(bridge, /function restoreDisplayState/);
    assert.match(bridge, /function persistDisplayState/);
    assert.match(bridge, /janktime2\.display\.snapshot\.v1/);
    assert.match(bridge, /heartRateHistoryMinutes/);
    assert.match(bridge, /alarmStale/);
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
    assert.match(renderer, /const statusFont = systemFont\(14\);/);
    assert.match(renderer, /const valueFont = systemFont\(14, true\);/, "Metric values must use the bold font variant.");
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
    assert.match(renderer, /"battery-outline", width, height/);
    assert.ok(renderer.includes('render.getTextWidth("100", statusFont)'), "Battery dimensions must fit a three-digit value at statusFont size.");
    assert.match(renderer, /const batteryWidth = Math\.ceil\(\(batteryTextWidth \+ 2\) \* 16 \/ 8\)/);
    assert.match(renderer, /const batteryHeight = Math\.ceil\(\(statusFont\.height \+ 2\) \* 16 \/ 6\)/);
    assert.match(renderer, /centeredAtY\(safe === null \? "--" : String\(safe\), statusFont, black/);
    assert.ok(renderer.includes('drawMdiGlyph(cx, cy, color, "bluetooth", 8 * 1.25, 10 * 1.25)'), "Bluetooth glyph must be scaled by exactly 25%.");
    assert.ok(renderer.includes('PREVIEW_MODE ? (displayState.weatherCondition ?? "partlycloudy")'), "Preview should use a real MDI weather condition.");
    assert.ok(renderer.includes('case "focusCount": icon = "check-circle-outline"'));
    assert.ok(renderer.includes('drawMdiGlyph(11, 141, heartColor, "heart", 14, 14)'));
    assert.ok(renderer.includes('drawMdiGlyph(cx, cy, color, icon, 16, 16)'));
    assert.ok(renderer.includes("const rightBatteryCx = Math.floor(render.width - 1 - batteryWidth * 7 / 16)"));
    assert.ok(renderer.includes("const leftBatteryCx = rightBatteryCx - batteryWidth - 2"));
    assert.ok(renderer.includes("drawBattery(leftBatteryCx, statusCenterY, batteryWidth, batteryHeight"));
    assert.ok(renderer.includes("drawBattery(rightBatteryCx, statusCenterY, batteryWidth, batteryHeight"));
    assert.ok(renderer.includes("const timeRight = alarmCenterX - 6"));
    assert.ok(renderer.includes("drawAlarm(alarmCenterX, statusCenterY, alarmColor)"), "Alarm glyph must sit immediately before Bluetooth in the right-justified status cluster.");
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
    assert.ok(backupSource.includes("heartRateHistoryMinutes"));
    assert.ok(backupSource.includes("Image backup must be a 30×30 one-bit map."));
    assert.ok(backupSource.includes("validateHttpsUrl"));
    assert.ok(backupSource.includes("secrets: Map<String, String>?"));
    assert.ok(companionScreen.includes("Export without secrets"));
    assert.ok(companionScreen.includes("Danger: plaintext secrets"));
    assert.ok(companionScreen.includes("Restore included secrets"));
    assert.ok(companionScreen.includes("refreshAndSend(forceRefresh = true)"));
    assert.ok(companionScreen.includes("Import from file"));
    assert.ok(companionScreen.includes("ActivityResultContracts.OpenDocument()"));
    assert.ok(companionScreen.includes('imagePicker.launch(arrayOf("image/*"))'));
    assert.ok(companionScreen.includes("HeartRateHistory.fromHoursAndMinutes"));
    assert.ok(companionScreen.includes("remember(config.heartRateHistoryMinutes)"));
    assert.ok(companionScreen.includes("Heart-rate graph"));
    assert.ok(companionScreen.includes("heartRateHistoryMinutes"));
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
    const imageStore = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/data/PixelImageStore.kt");
    assert.match(imageStore, /openTypedAssetFileDescriptor/);
    assert.match(imageStore, /AssetFileDescriptor\.AutoCloseInputStream/);
    assert.doesNotMatch(read("../companion/android/app/src/main/AndroidManifest.xml"), /READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/);
    const wakeyClient = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/network/WakeyExportClient.kt");
    assert.match(wakeyClient, /has no upcoming alarm or bedtime/);
    assert.match(wakeyClient, /fun read\(token: String\): WakeyAlarmStatus/);
    assert.match(companionBridge, /heartHistoryMinutes/);
    assert.match(companionBridge, /alarmStale/);
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
    assert.match(read("../src/c/health_ffi.c"), /health_service_peek_current_value\(HealthMetricHeartRateBPM\)/);
    assert.match(read("../src/c/health_ffi.c"), /health_refresh\(int32_t history_minutes\)/);
    assert.match(read("../src/c/health_ffi.c"), /MAX_HEALTH_HISTORY_MINUTES \(24 \* 60\)/);
    assert.match(read("../src/ts/watch/health.ts"), /Natives\.health_refresh\(historyMinutes\)/);
    assert.match(read("../src/ts/watch/main.ts"), /readHealthSnapshot\(historyMinutes\)/);
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
        "../docs/adr/ADR-0018-heart-rate-history-and-watch-state-persistence.md",
    ]) {
        assert.ok(existsSync(new URL(path, import.meta.url)), "Missing ADR: " + path);
    }
});

test("native companion is selected instead of PebbleKit JS", () => {
    assert.equal(existsSync(new URL("../src/pkjs/index.js", import.meta.url)), false);
});
