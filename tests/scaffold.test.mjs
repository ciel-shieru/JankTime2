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
    assert.match(layout, /without ellipses/i);
    assert.match(layout, /HH:mm/);
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
    ]) {
        assert.ok(existsSync(new URL(path, import.meta.url)), "Missing ADR: " + path);
    }
});

test("native companion is selected instead of PebbleKit JS", () => {
    assert.equal(existsSync(new URL("../src/pkjs/index.js", import.meta.url)), false);
});
