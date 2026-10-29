import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/embeddedjs/config.js");
const source = readFileSync(path, "utf8");
const disabled = "export const PREVIEW_MODE = false;";
const enabled = "export const PREVIEW_MODE = true;";

if (!source.includes(disabled) || source.includes(enabled)) {
    throw new Error("Refusing to enable preview mode: unexpected generated config.js content");
}
writeFileSync(path, source.replace(disabled, enabled), "utf8");
console.log("Enabled preview fixtures in generated JavaScript for screenshot CI only.");
