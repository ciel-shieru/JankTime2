#!/usr/bin/env python3
"""Create or verify a compact SHA-256 fingerprint for a complete SDK tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any


FORMAT = "janktime2-sdk-manifest-v2"


def inventory(root: Path) -> dict[str, Any]:
    files: dict[str, str] = {}
    symlinks: dict[str, str] = {}
    for current, dirs, names in os.walk(root, followlinks=False):
        current_path = Path(current)
        kept_dirs: list[str] = []
        for name in sorted(dirs):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                symlinks[relative] = os.readlink(path)
            else:
                kept_dirs.append(name)
        dirs[:] = kept_dirs

        for name in sorted(names):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                symlinks[relative] = os.readlink(path)
                continue
            if not path.is_file():
                continue
            files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()

    if not files:
        raise ValueError(f"SDK root contains no regular files: {root}")

    # Hash the sorted path->digest map and symlink map as one deterministic tree
    # commitment. This still binds every file byte and relative path without
    # checking in a multi-megabyte manifest listing tens of thousands of files.
    canonical = json.dumps(
        {"files": dict(sorted(files.items())), "symlinks": dict(sorted(symlinks.items()))},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "format": FORMAT,
        "rootSha256": hashlib.sha256(canonical).hexdigest(),
        "fileCount": len(files),
        "symlinkCount": len(symlinks),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="SDK or platform-package directory")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", type=Path, help="write a reviewed fingerprint (maintenance only)")
    mode.add_argument("--verify", type=Path, help="verify against a committed fingerprint")
    args = parser.parse_args()

    root = args.root.resolve(strict=True)
    actual = inventory(root)
    if args.write:
        args.write.parent.mkdir(parents=True, exist_ok=True)
        args.write.write_text(json.dumps(actual, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(
            f"Wrote tree fingerprint {actual['rootSha256']} "
            f"for {actual['fileCount']} files and {actual['symlinkCount']} symlinks"
        )
        return 0

    expected: dict[str, Any] = json.loads(args.verify.read_text(encoding="utf-8"))
    if expected != actual:
        print(
            f"SDK tree fingerprint mismatch: expected={expected}, actual={actual}",
            file=sys.stderr,
        )
        return 1

    print(
        f"Verified tree fingerprint {actual['rootSha256']} "
        f"({actual['fileCount']} files, {actual['symlinkCount']} symlinks)"
    )
    return 0


if __import__("os").environ.get("JANKTIME2_RUN_SELF_TESTS") == "1":
    # Exercise determinism and detection without any external package.
    import tempfile

    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        (root / "file.txt").write_text("pinned bytes", encoding="utf-8")
        before = inventory(root)
        assert inventory(root) == before
        (root / "file.txt").write_text("changed bytes", encoding="utf-8")
        assert inventory(root) != before
