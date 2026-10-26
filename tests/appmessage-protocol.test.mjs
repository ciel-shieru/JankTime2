import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("Android sender and Alloy watch receiver share generated AppMessage key IDs", () => {
    const packageJson = JSON.parse(read("../package.json"));
    const expectedNames = ["TYPE", "ID", "VALUE", "FLAGS", "EXTRA"];
    const baseId = 10000;

    assert.deepEqual(packageJson.pebble.messageKeys, expectedNames);

    const watchBridge = read("../src/ts/watch/bridge.ts");
    assert.ok(watchBridge.includes("keys: new Map<string, number>(["), "Watch receiver should pin numeric IDs explicitly");
    assert.ok(!watchBridge.includes('keys: ["TYPE"'), "Array shorthand remaps IDs and must not be used for this native bridge");

    for (const [index, name] of expectedNames.entries()) {
        assert.ok(
            watchBridge.includes(`["${name}", ${baseId + index}]`),
            `Watch receiver key ${name} must use wire ID ${baseId + index}`,
        );

        const androidSource = read("../companion/android/app/src/main/java/com/cielshieru/janktime2/pebble/PebbleBridge.kt");
        const declaration = androidSource.split("\n").find((line) => line.includes(`const val ${name}_KEY =`));
        assert.ok(declaration, `Missing Android AppMessage key constant: ${name}_KEY`);
        const literal = declaration.slice(declaration.indexOf("=") + 1).trim().replace(/u$/, "");
        assert.equal(
            Number(literal),
            baseId + index,
            `${name}_KEY must match package.json messageKeys order and Alloy's generated ID`,
        );
    }
});
