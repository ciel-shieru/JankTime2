#!/usr/bin/env python3
"""Create or verify a deterministic SHA-256 manifest for an installed Pebble SDK."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any


FORMAT = "janktime2-sdk-manifest-v1"


def inventory(root: Path) -> dict[str, Any]:
    files: dict[str, str] = {}
    symlinks: dict[str, str] = {}
    for current, dirs, names in os.walk(root, followlinks=False):
        current_path = Path(current)
        # Directory symlinks are input data too; record them, but do not traverse them.
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
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            files[relative] = digest

    if not files:
        raise ValueError(f"SDK root contains no regular files: {root}")
    return {"format": FORMAT, "files": dict(sorted(files.items())), "symlinks": dict(sorted(symlinks.items()))}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="SDK directory to inventory")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", type=Path, help="write a new manifest (bootstrap only)")
    mode.add_argument("--verify", type=Path, help="verify the SDK against a committed manifest")
    args = parser.parse_args()

    root = args.root.resolve(strict=True)
    current = inventory(root)
    if args.write:
        args.write.parent.mkdir(parents=True, exist_ok=True)
        args.write.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Wrote SHA-256 manifest for {len(current['files'])} SDK files")
        return 0

    expected: dict[str, Any] = json.loads(args.verify.read_text(encoding="utf-8"))
    if expected.get("format") != FORMAT:
        raise SystemExit("SDK manifest format is missing or unsupported")
    if current != expected:
        expected_files = expected.get("files", {})
        current_files = current.get("files", {})
        missing = sorted(set(expected_files) - set(current_files))
        unexpected = sorted(set(current_files) - set(expected_files))
        changed = sorted(path for path in set(expected_files) & set(current_files)
                         if expected_files[path] != current_files[path])
        expected_links = expected.get("symlinks", {})
        current_links = current.get("symlinks", {})
        link_diff = sorted(path for path in set(expected_links) | set(current_links)
                           if expected_links.get(path) != current_links.get(path))
        print(f"SDK digest verification failed: missing={missing[:10]}, "
              f"unexpected={unexpected[:10]}, changed={changed[:10]}, "
              f"symlink_changes={link_diff[:10]}", file=sys.stderr)
        return 1

    print(f"Verified SHA-256 manifest for {len(current['files'])} SDK files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
