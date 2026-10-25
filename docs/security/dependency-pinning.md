# Dependency versions and integrity

JankTime2 is expected to build from the same declared versions and package bytes rather than silently accepting a new transitive dependency or mutable release artifact.

## Source-controlled pins

- GitHub Actions are referenced by full commit SHA, not a mutable version tag.
- npm packages are locked in `package-lock.json`, with registry integrity hashes; use `npm ci`, not `npm install`, in CI.
- Python build tools are installed from a hash-enforced requirements lock. Every direct and transitive requirement must use an exact version and SHA-256 hash.
- Gradle dependencies and plugin artifacts are locked with Gradle dependency lockfiles and checked against `companion/android/gradle/verification-metadata.xml`. Artifact checksums cover jars, AARs, POMs, Gradle module metadata, and plugin artifacts. Do not commit a dependency upgrade without reviewing the version and its checksum changes.
- Gradle wrapper distributions use an exact URL/version plus `distributionSha256Sum`. The wrapper JAR itself is a checked-in binary input and must be verified when upgraded.
- The Pebble SDK version is exact and its installed files are checked against a source-controlled SHA-256 manifest. Rebaseline the manifest only during an intentional SDK upgrade after inspecting the upstream release and diff.
- Node.js, Python, and the JDK are selected by exact patch/build version through setup actions pinned by commit SHA. The setup actions validate downloaded toolchain archives against their published checksums.
- Android SDK packages must use a specific SDK package revision where the SDK manager supports it, and their downloaded package integrity must be checked by the SDK repository metadata.

## Update procedure

1. Change the direct dependency/toolchain version intentionally.
2. Regenerate the relevant lock/checksum data from the intended upstream source.
3. Review the complete diff, compare publisher checksums/signatures where available, and remove stale lock entries.
4. Run all repository CI checks with verification enabled before merging.
5. Document any dependency outside AndroidX/Google's Android libraries in `companion/README.md`, including why an equivalent maintained Android/JDK API would be more complex or less safe.

Never use floating versions, dependency ranges, `latest` labels, unpinned Git references, or install commands that resolve transitive packages without a lock. Any bootstrap procedure used to create lockfiles is temporary maintenance tooling; normal CI must consume committed lockfiles and fail on missing or changed digests.

## Trust boundary

Checksums establish byte-for-byte integrity relative to the reviewed source-controlled manifest; they do not prove the original artifact was benign. Prefer publisher signatures and independent official checksums during updates. GitHub-hosted runner images and distribution-managed operating-system libraries remain part of the hosted build environment; system package installs must use the signed package-repository metadata, and that environment limitation must not be confused with the source-level dependency locks above.
