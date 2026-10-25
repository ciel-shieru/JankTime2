#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch (error) {
    failures.push("Cannot read required policy input " + path + ": " + String(error));
    return "";
  }
};
const walk = (dir) => {
  const result = [];
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
};
const exactNumericVersion = /^[0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9A-Za-z.-]+)?$/;
const sha256 = /^[0-9a-f]{64}$/i;
const ciPath = ".github/workflows/ci.yml";
const ci = read(ciPath);
const policy = read("docs/security/dependency-pinning.md");

const requiredDebugSigningSecrets = [
  "ANDROID_DEBUG_KEYSTORE_BASE64",
  "ANDROID_DEBUG_KEYSTORE_STORE_PASSWORD",
  "ANDROID_DEBUG_KEYSTORE_KEY_PASSWORD",
  "ANDROID_DEBUG_KEYSTORE_KEY_ALIAS",
];
for (const secret of requiredDebugSigningSecrets) {
  check(ci.includes(secret), "CI must consume the required debug-signing secret: " + secret);
}
check(ci.includes('printf \'%s\' "$ANDROID_DEBUG_KEYSTORE_BASE64" | base64 --decode') &&
  ci.includes('"$HOME/.android/debug.keystore"') && ci.includes('ANDROID_DEBUG_KEYSTORE_PATH=$HOME/.android/debug.keystore'),
  "CI must decode the configured debug keystore into ~/.android/debug.keystore without logging its contents.");
check(!/echo\s+["']?\$ANDROID_DEBUG_KEYSTORE_(?:BASE64|STORE_PASSWORD|KEY_PASSWORD|KEY_ALIAS)\b/.test(ci),
  "CI must never echo debug keystore secrets.");
check(!/^\s*path:\s+artifacts\/\s*$/m.test(ci),
  "CI must upload screenshot and diagnostic files individually, not as a directory bundle.");
check(ci.includes("name: screenshot_emery.png") && ci.includes("path: artifacts/screenshot_emery.png") &&
  ci.includes("name: app-debug.apk") &&
  ci.includes("name: janktime2-emery-production.pbw") &&
  ci.includes("path: release/janktime2-emery-production.pbw"),
  "CI must upload individual output files using their real filenames as artifact names.");
check(ci.includes("actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9") && (ci.match(/archive: false/g) || []).length === 7,
  "CI must use the pinned v7 upload-artifact action with archive:false for every single-file output.");

check(ci.includes("npm ci --ignore-scripts"), "CI must install npm dependencies using npm ci with lifecycle scripts disabled.");
check(ci.includes("--require-hashes"), "CI must install Python dependencies using pip --require-hashes.");
check(ci.includes("--write-verification-metadata sha256") && ci.includes("--write-locks"),
  "CI must generate Gradle checksum metadata and dependency locks before validating their reviewed digests.");
check(ci.includes("sha256sum --check tooling/gradle-dependency-pins.sha256"),
  "CI must compare generated Gradle dependency pins against the reviewed SHA-256 manifest.");
check(ci.includes("sdk install 4.33.1") && ci.includes("build-tools;36.0.0") && ci.includes("platforms;android-36"),
  "CI must select exact Pebble and Android SDK package revisions.");
check(policy.includes("GitHub-hosted runner images") && policy.includes("signed package-repository metadata"),
  "The non-source-controlled hosted runner / OS-package trust boundary must remain explicitly documented.");

for (const [index, line] of ci.split(/\r?\n/).entries()) {
  const match = line.match(/^\s*uses:\s*([^\s#]+)/);
  if (!match) continue;
  check(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/i.test(match[1]),
    ciPath + ":" + (index + 1) + " uses a mutable GitHub Action ref: " + match[1]);
}
for (const field of ["node-version", "python-version", "java-version"]) {
  const match = ci.match(new RegExp("^\\s*" + field + ":\\s*[\\\"']?([^\\\"'\\s]+)", "m"));
  check(Boolean(match && exactNumericVersion.test(match[1])),
    "CI must set " + field + " to an exact patch/build version.");
}
const nodeVersion = (ci.match(/node-version:\s*["']?([0-9.]+)["']?/m) || [])[1];
check(Boolean(nodeVersion && read(".nvmrc").trim() === nodeVersion),
  ".nvmrc and the CI Node.js version must match exactly.");

let packageJson = {};
let packageLock = {};
try { packageJson = JSON.parse(read("package.json")); } catch {}
try { packageLock = JSON.parse(read("package-lock.json")); } catch {}
for (const [name, version] of Object.entries({
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {})
})) {
  check(exactNumericVersion.test(String(version)),
    "npm dependency " + name + " must use an exact numeric version, not a range or floating reference.");
}
for (const [path, entry] of Object.entries(packageLock.packages || {})) {
  if (path === "" || entry.link) continue;
  check(exactNumericVersion.test(String(entry.version || "")),
    "package-lock.json entry " + path + " must pin an exact package version.");
  if (entry.resolved && /^https?:/i.test(entry.resolved)) {
    check(typeof entry.integrity === "string" && /^(sha256|sha384|sha512)-/i.test(entry.integrity),
      "package-lock.json entry " + path + " must include a registry artifact integrity digest.");
  }
}

const pythonLock = read("requirements/pebble-tool.lock");
for (const [index, line] of pythonLock.split(/\r?\n/).entries()) {
  const value = line.trim();
  if (!value || value.startsWith("#")) continue;
  check(/^[A-Za-z0-9_.-]+==[^;\s]+(?:\s+--hash=sha256:[0-9a-f]{64})+$/i.test(value),
    "requirements/pebble-tool.lock:" + (index + 1) + " must have an exact version and at least one SHA-256 hash.");
}

const aptLockPath = "tooling/ubuntu-24.04-emulator-deps.json";
let aptLock = {};
try { aptLock = JSON.parse(read(aptLockPath)); } catch {}
check(aptLock.schemaVersion === 1 && aptLock.distribution === "ubuntu-24.04" &&
  aptLock.suite === "noble" && aptLock.architecture === "amd64" &&
  /^\d{8}T\d{6}Z$/.test(String(aptLock.snapshot || "")),
  aptLockPath + " must pin a fixed Ubuntu 24.04 amd64 archive snapshot.");
check(aptLock.packages && typeof aptLock.packages === "object" &&
  Object.keys(aptLock.packages).length >= 6 &&
  Object.entries(aptLock.packages).every(([name, version]) =>
    /^[a-z0-9][a-z0-9+.-]*$/.test(name) && typeof version === "string" && version.length > 0 && !/\s/.test(version)),
  aptLockPath + " must pin exact versions for all direct emulator runtime packages.");
const aptInstaller = read("scripts/install-emulator-deps.py");
check(aptInstaller.includes("apt-get") && aptInstaller.includes("--snapshot") &&
  aptInstaller.includes("--reinstall") && aptInstaller.includes("dpkg-query") &&
  aptInstaller.includes("SHA-256") && aptInstaller.includes("Release/Packages"),
  "Emulator runtime install must use the locked snapshot, reinstall pinned package versions, and document APT digest verification.");
check(ci.includes("python3 scripts/install-emulator-deps.py"),
  "CI must use the checked-in, snapshot-pinned emulator dependency installer.");
const gradleProperties = read("companion/android/gradle/wrapper/gradle-wrapper.properties");
check(/distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-[0-9]+\.[0-9]+\.[0-9]+-bin\.zip/.test(gradleProperties),
  "Gradle distribution URL must include an exact distribution version.");
check(/^distributionSha256Sum=[0-9a-f]{64}$/m.test(gradleProperties),
  "Gradle distribution must be SHA-256 pinned.");
const wrapperDigest = read("companion/android/gradle/wrapper/gradle-wrapper.jar.sha256");
check(/^[0-9a-f]{64}\s+gradle-wrapper\.jar\s*$/im.test(wrapperDigest),
  "The checked-in Gradle wrapper JAR must have a valid SHA-256 sidecar.");

const gradlePins = read("tooling/gradle-dependency-pins.sha256");
const pinLines = gradlePins.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const requiredGradlePinPaths = new Set([
  "companion/android/gradle/verification-metadata.xml",
  "companion/android/app/gradle.lockfile"
]);
for (const line of pinLines) {
  const match = line.match(/^([0-9a-f]{64})\s+(.+)$/i);
  check(Boolean(match), "Malformed entry in tooling/gradle-dependency-pins.sha256: " + line);
  if (match) requiredGradlePinPaths.delete(match[2]);
}
check(pinLines.length === 2 && requiredGradlePinPaths.size === 0,
  "Gradle integrity manifest must pin both the generated verification metadata and app dependency lockfile.");
for (const path of [
  "tooling/pebble-sdk-4.33.1.json",
  "tooling/android-platform-36.json",
  "tooling/android-build-tools-36.0.0.json"
]) {
  let manifest = {};
  try { manifest = JSON.parse(read(path)); } catch {}
  check(manifest.format === "janktime2-sdk-manifest-v2" &&
    sha256.test(String(manifest.rootSha256 || "")) &&
    Number.isInteger(manifest.fileCount) && manifest.fileCount > 0 &&
    Number.isInteger(manifest.symlinkCount) && manifest.symlinkCount >= 0,
    path + " must pin an SDK tree fingerprint and its reviewed file/symlink counts.");
}

const catalogPath = "companion/android/gradle/libs.versions.toml";
const catalog = read(catalogPath);
const versionsBlock = (catalog.match(/\[versions\]([\s\S]*?)(?=\n\[|$)/) || [,""])[1];
const librariesBlock = (catalog.match(/\[libraries\]([\s\S]*?)(?=\n\[|$)/) || [,""])[1];
const pluginsBlock = (catalog.match(/\[plugins\]([\s\S]*?)(?=\n\[|$)/) || [,""])[1];
const versions = new Map();
for (const [index, line] of versionsBlock.split(/\r?\n/).entries()) {
  const value = line.trim();
  if (!value || value.startsWith("#")) continue;
  const match = value.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"$/);
  check(Boolean(match && exactNumericVersion.test(match[2])),
    catalogPath + " [versions] line " + (index + 1) + " must be an exact version.");
  if (match) versions.set(match[1], match[2]);
}
const companionReadme = read("companion/README.md").toLowerCase();
const forbiddenUiGroups = [
  "com.google.android.material",
  "androidx.compose.material",
  "io.flutter",
  "com.facebook.react",
  "org.apache.cordova"
];
for (const [index, line] of librariesBlock.split(/\r?\n/).entries()) {
  const value = line.trim();
  if (!value || value.startsWith("#")) continue;
  const match = value.match(/^([A-Za-z0-9_.-]+)\s*=\s*\{(.*)\}$/);
  check(Boolean(match), catalogPath + " [libraries] line " + (index + 1) + " must use a reviewable inline dependency declaration.");
  if (!match) continue;
  const alias = match[1];
  const definition = match[2];
  const moduleMatch = definition.match(/module\s*=\s*"([^"]+)"/);
  const groupMatch = definition.match(/group\s*=\s*"([^"]+)"/);
  const nameMatch = definition.match(/name\s*=\s*"([^"]+)"/);
  const module = moduleMatch ? moduleMatch[1] : (groupMatch && nameMatch ? groupMatch[1] + ":" + nameMatch[1] : "");
  const parts = module.split(":");
  const group = parts.length > 1 ? parts[0] : "";
  const artifact = parts.length > 1 ? parts[1] : "";
  const versionRefMatch = definition.match(/version\.ref\s*=\s*"([^"]+)"/);
  const literalVersionMatch = definition.match(/version\s*=\s*"([^"]+)"/);
  if (versionRefMatch) {
    check(versions.has(versionRefMatch[1]), catalogPath + " dependency " + alias + " references an undefined version.");
  } else if (literalVersionMatch) {
    check(exactNumericVersion.test(literalVersionMatch[1]), catalogPath + " dependency " + alias + " uses a non-exact version.");
  } else {
    check(group.startsWith("androidx.compose."),
      catalogPath + " dependency " + alias + " has no explicit version and is not managed by the Compose BOM.");
  }
  for (const forbidden of forbiddenUiGroups) {
    check(!(group === forbidden || group.startsWith(forbidden + ".")),
      "Forbidden UI framework/library dependency found: " + module);
  }
  if (group && !group.startsWith("androidx.")) {
    let justification = alias.toLowerCase();
    if (group === "io.rebble.pebblekit2") justification = "pebblekit";
    else if (group === "com.squareup.okhttp3") justification = "okhttp";
    else if (group === "org.jetbrains.kotlinx") justification = "coroutines";
    else if (group === "junit") justification = "junit";
    check(companionReadme.includes(justification),
      "Non-AndroidX dependency " + module + " must have a justification in companion/README.md.");
  }
}
for (const [index, line] of pluginsBlock.split(/\r?\n/).entries()) {
  const value = line.trim();
  if (!value || value.startsWith("#")) continue;
  const match = value.match(/^([A-Za-z0-9_.-]+)\s*=\s*\{(.*)\}$/);
  check(Boolean(match), catalogPath + " [plugins] line " + (index + 1) + " must use a reviewable inline declaration.");
  if (!match) continue;
  const ref = (match[2].match(/version\.ref\s*=\s*"([^"]+)"/) || [])[1];
  const literal = (match[2].match(/version\s*=\s*"([^"]+)"/) || [])[1];
  check(Boolean((ref && versions.has(ref)) || (literal && exactNumericVersion.test(literal))),
    catalogPath + " plugin " + match[1] + " must reference a pinned exact version.");
}

const appSourceRoot = join(root, "companion/android/app/src");
const appFiles = walk(appSourceRoot);
const kotlinFiles = appFiles.filter(path => path.endsWith(".kt"));
check(kotlinFiles.length > 0, "Android app and tests must be implemented in Kotlin.");
for (const path of appFiles) {
  const rel = relative(root, path).replaceAll("\\", "/");
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  check(![".java", ".groovy", ".scala", ".dart", ".js", ".jsx", ".tsx", ".html"].includes(extension),
    "Android application source may only use Kotlin (plus Android platform metadata/resources): " + rel);
  check(!/\/res\/layout(?:-[^/]+)?\//i.test("/" + rel),
    "XML/View-based layouts are prohibited: " + rel);
}
const kotlinSource = kotlinFiles.map(path => readFileSync(path, "utf8")).join("\n");
const forbiddenImports = [
  [/^\s*import\s+android\.view(?:\.|\s|$)/m, "Android View UI"],
  [/^\s*import\s+android\.widget(?:\.|\s|$)/m, "Android widget UI"],
  [/^\s*import\s+androidx\.appcompat(?:\.|\s|$)/m, "AppCompat UI"],
  [/^\s*import\s+com\.google\.android\.material(?:\.|\s|$)/m, "Material Components (non-Compose) UI"],
  [/^\s*import\s+androidx\.compose\.material\./m, "Compose Material 2 UI"],
  [/^\s*import\s+(?:io\.flutter|com\.facebook\.react|org\.apache\.cordova)(?:\.|\s|$)/m, "alternate UI framework"]
];
for (const [pattern, description] of forbiddenImports) {
  check(!pattern.test(kotlinSource), "Android source imports prohibited " + description + ".");
}
check(/^\s*import\s+androidx\.compose\.material3\./m.test(kotlinSource),
  "Android UI must use Jetpack Compose Material 3 components.");
check(/@Composable\b/.test(kotlinSource), "Android UI must be implemented with Jetpack Compose.");

const companionBuildReadme = read("companion/android/README.md");
check(/Android SDK platform 36\b/.test(companionBuildReadme),
  "companion/android/README.md must document the same pinned Android SDK level used by CI and Gradle (36).");

if (failures.length > 0) {
  console.error("Repository policy check failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exitCode = 1;
} else {
  console.log("Repository policy check passed: immutable action refs, exact tool/dependency versions, integrity pins, Android Kotlin/Compose/Material 3 policy, and documented dependency justifications.");
}
