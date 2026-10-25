import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(pkg.pebble.projectType, "moddable", "Alloy projectType must be moddable");
assert.deepEqual(pkg.pebble.targetPlatforms, ["emery"], "JankTime2 targets emery only");
assert.equal(pkg.pebble.watchapp.watchface, true, "Project must be a watchface");

const sourceFiles = [];
function walk(path) {
    for (const entry of readdirSync(path)) {
        const fullPath = join(path, entry);
        if (statSync(fullPath).isDirectory()) walk(fullPath);
        else if (fullPath.endsWith(".ts")) sourceFiles.push(fullPath);
    }
}
walk(join(root, "src/ts/watch"));

assert.ok(sourceFiles.length > 0, "Expected TypeScript source files");
const forbidden = [
    { pattern: /\beval\s*\(/, label: "eval" },
    { pattern: /\bnew\s+Function\s*\(/, label: "dynamic Function constructor" },
    { pattern: /\btrustAllCerts\b/i, label: "trust-all TLS helper" },
    { pattern: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/, label: "embedded private key" },
];
for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    for (const rule of forbidden) {
        assert.doesNotMatch(source, rule.pattern, file + ": forbidden " + rule.label);
    }
}
console.log("Lint passed for " + sourceFiles.length + " TypeScript source/declaration files.");
