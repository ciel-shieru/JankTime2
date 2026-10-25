#!/usr/bin/env python3
"""Install exact emulator libraries from a fixed, signed Ubuntu archive snapshot."""
import json
import re
import subprocess
import sys
from pathlib import Path

LOCK_PATH = Path("tooling/ubuntu-24.04-emulator-deps.json")

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
    subprocess.run(["sudo", "apt-get", "update", "--snapshot", snapshot], check=True)
    subprocess.run([
        "sudo", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install",
        "--yes", "--no-install-recommends", "--reinstall", "--snapshot", snapshot, *pins
    ], check=True)
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
