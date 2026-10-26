#!/usr/bin/env python3
"""Install exact emulator libraries from a fixed, signed Ubuntu archive snapshot."""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

LOCK_PATH = Path("tooling/ubuntu-24.04-emulator-deps.json")
APT_ATTEMPTS = 4

def run_with_retries(command: list[str]) -> None:
    """Retry transient snapshot-server failures without relaxing package verification."""
    for attempt in range(APT_ATTEMPTS):
        try:
            subprocess.run(command, check=True)
            return
        except subprocess.CalledProcessError:
            if attempt + 1 >= APT_ATTEMPTS:
                raise
            delay = min(2 ** (attempt + 1), 16)
            print(
                f"APT snapshot operation failed (attempt {attempt + 1}/{APT_ATTEMPTS}); "
                f"retrying in {delay}s.",
                file=sys.stderr,
            )
            time.sleep(delay)

def main() -> int:
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    if (lock.get("schemaVersion") != 1 or lock.get("distribution") != "ubuntu-24.04"
            or lock.get("suite") != "noble" or lock.get("architecture") != "amd64"):
        raise SystemExit("Emulator dependency lock targets an unsupported environment")
    snapshot = lock.get("snapshot", "")
    if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", snapshot):
        raise SystemExit("Invalid pinned Ubuntu snapshot timestamp")
    packages = lock.get("packages")
    if not isinstance(packages, dict) or not packages:
        raise SystemExit("Emulator dependency lock is empty")
    pins = []
    for name, version in sorted(packages.items()):
        if not re.fullmatch(r"[a-z0-9][a-z0-9+.-]*", name):
            raise SystemExit("Invalid Debian package name: " + str(name))
        if not isinstance(version, str) or not version or any(ch.isspace() for ch in version):
            raise SystemExit("Invalid exact package version for " + name)
        pins.append(name + "=" + version)
    # Ubuntu 24.04's APT supports archive snapshots. The signed Release/Packages
    # metadata authenticates the SHA-256 digests used to verify downloaded .deb files.
    run_with_retries(["sudo", "apt-get", "update", "--snapshot", snapshot])
    run_with_retries([
        "sudo", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install",
        "--yes", "--no-install-recommends", "--reinstall", "--snapshot", snapshot, *pins
    ])
    for pin in pins:
        name, expected = pin.split("=", 1)
        installed = subprocess.check_output([
            "dpkg-query", "-W", "-f=${Version}", name
        ], text=True).strip()
        if installed != expected:
            raise SystemExit(f"Version mismatch for {name}: expected {expected}; got {installed}")
    print("Installed emulator runtime packages from Ubuntu snapshot " + snapshot)
    return 0

if __name__ == "__main__":
    sys.exit(main())
