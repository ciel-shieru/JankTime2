# Dependency versions and integrity

JankTime2 is expected to build from the same declared versions and package bytes rather than silently accepting a new transitive dependency or mutable release artifact.

## Source-controlled pins

- GitHub Actions are referenced by full commit SHA, not a mutable version tag.
- npm packages are locked in `package-lock.json`, with registry integrity hashes; use `npm ci`, not `npm install`, in CI.
- Python build tools are installed from a hash-enforced requirements lock. Every direct and transitive requirement must use an exact version and SHA-256 hash.
- Gradle's generated dependency lockfile and full `verification-metadata.xml` are each pinned by their exact SHA-256 in `tooling/gradle-dependency-pins.sha256`. This compact integrity manifest pins the complete generated files without checking a large verbose XML file into source. CI regenerates the candidates with an exact, pinned plugin/dependency graph, checks both full-file digests, and fails on any drift before doing a separate build. That second invocation consumes the generated verification metadata; `verify-metadata` is enabled and Gradle validates artifact and metadata checksums strictly. A lock update requires review of the complete metadata diff and intentional update of the committed digests.
- Gradle wrapper distributions use an exact URL/version plus `distributionSha256Sum`. The wrapper JAR itself is a checked-in binary input and must be verified when upgraded.
- The Pebble SDK version is exact and its installed files are checked against a source-controlled SHA-256 manifest. Rebaseline the manifest only during an intentional SDK upgrade after inspecting the upstream release and diff.
- Linux emulator runtime packages are pinned to exact Debian versions and a fixed Ubuntu archive snapshot in `tooling/ubuntu-24.04-emulator-deps.json`. APT validates downloaded package SHA-256 hashes against `Packages` indexes authenticated by the Ubuntu archive signing key, and the installer asserts the exact installed versions. The snapshot also fixes transitive archive resolution for these emulator libraries.
- Node.js, Python, and the JDK are selected by exact patch/build version through setup actions pinned by commit SHA. The setup actions validate downloaded toolchain archives against their published checksums.
- Android SDK packages must use a specific SDK package revision where the SDK manager supports it, and their downloaded package integrity must be checked by the SDK repository metadata.

## Update procedure

1. Change the direct dependency/toolchain version intentionally.
2. Regenerate the relevant lock/checksum data from the intended upstream source.
3. Review the complete diff, compare publisher checksums/signatures where available, and remove stale lock entries.
4. Run all repository CI checks with verification enabled before merging.
5. Document any dependency outside AndroidX/Google's Android libraries in `companion/README.md`, including why an equivalent maintained Android/JDK API would be more complex or less safe.

Never use floating versions, dependency ranges, `latest` labels, unpinned Git references, or unverified transitive resolution. The Gradle candidate-generation step is allowed only because both full output files must exactly match committed SHA-256 pins and the actual build/test run is repeated with verification enabled. Never change those expected digests just to make CI green; inspect why resolution changed first.

## Trust boundary

Checksums establish byte-for-byte integrity relative to the reviewed source-controlled manifest; they do not prove the original artifact was benign. Prefer publisher signatures and independent official checksums during updates. GitHub-hosted runner images and their preinstalled base utilities remain a provider-managed infrastructure trust boundary, not a declared application dependency. Emulator libraries installed by this repository are pinned to a fixed snapshot and exact versions; APT verifies per-package SHA-256 against signed package-repository metadata. The runner VM image and hypervisor are not claimed to be pinned.
