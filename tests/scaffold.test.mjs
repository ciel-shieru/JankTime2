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
    assert.match(model, /function selectAlarmOrBedtime/);
    assert.match(model, /function clipByWidth/);
    const workflow = read("../.github/workflows/ci.yml");
    assert.match(workflow, /check_screenshot\.py/);
    const boot = read("../src/c/mdbl.c");
    assert.match(boot, /ModdableCreationRecord/);
    assert.match(boot, /\.slot = 36864/);
    assert.match(boot, /\.chunk = 28672/);
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
    ]) {
        assert.ok(existsSync(new URL(path, import.meta.url)), "Missing ADR: " + path);
    }
});

test("native companion is selected instead of PebbleKit JS", () => {
    assert.equal(existsSync(new URL("../src/pkjs/index.js", import.meta.url)), false);
});
