#!/usr/bin/env python3
"""Convert a pip --report JSON file to a SHA-256-enforced requirements lock."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


def canonicalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} REPORT.json OUTPUT.lock", file=sys.stderr)
        return 2

    report_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    report: dict[str, Any] = json.loads(report_path.read_text(encoding="utf-8"))
    installs = report.get("install")
    if not isinstance(installs, list) or not installs:
        raise SystemExit("pip report contains no resolved packages")

    packages: dict[str, tuple[str, str]] = {}
    for item in installs:
        metadata = item.get("metadata") or {}
        name = metadata.get("name")
        version = metadata.get("version")
        hashes = (item.get("download_info") or {}).get("archive_info", {}).get("hashes") or {}
        sha256 = hashes.get("sha256")
        if not isinstance(name, str) or not isinstance(version, str):
            raise SystemExit("pip report has a package with missing name/version")
        if not isinstance(sha256, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", sha256):
            raise SystemExit(f"pip report has no usable SHA-256 for {name}=={version}")
        key = canonicalize(name)
        entry = (version, sha256.lower())
        if key in packages and packages[key] != entry:
            raise SystemExit(f"pip report resolved multiple versions of {name}")
        packages[key] = entry

    lines = [
        "# Generated from pip --report; each resolved wheel/sdist is SHA-256 pinned.",
        "# Review the version and upstream artifact before committing this file.",
    ]
    for name, (version, sha256) in sorted(packages.items()):
        lines.append(f"{name}=={version} --hash=sha256:{sha256}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(packages)} SHA-256-pinned packages to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
