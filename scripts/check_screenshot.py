#!/usr/bin/env python3
"""Validate an emery screenshot and reject Alloy's full-screen fatal dialog.

Uses only the Python standard library so CI does not need another dependency.
Pebble screenshots are expected to be 200x228, non-interlaced 8-bit RGB/RGBA PNGs.
"""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def decode_png(path: Path) -> tuple[int, int, list[tuple[int, int, int]]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("screenshot is not a PNG")

    offset = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = interlace = None
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4 : offset + 8]
        start = offset + 8
        end = start + length
        if end + 4 > len(data):
            raise ValueError("truncated PNG chunk")
        chunk = data[start:end]
        if kind == b"IHDR":
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
            if compression != 0 or filtering != 0:
                raise ValueError("unsupported PNG compression/filter method")
        elif kind == b"IDAT":
            compressed.extend(chunk)
        elif kind == b"IEND":
            break
        offset = end + 4

    if width is None or height is None:
        raise ValueError("PNG is missing IHDR")
    if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
        raise ValueError(
            f"unsupported screenshot PNG: bit_depth={bit_depth}, "
            f"color_type={color_type}, interlace={interlace}"
        )

    bpp = 3 if color_type == 2 else 4
    row_bytes = width * bpp
    raw = zlib.decompress(compressed)
    expected_size = height * (row_bytes + 1)
    if len(raw) != expected_size:
        raise ValueError(f"unexpected PNG data length: {len(raw)} != {expected_size}")

    pixels: list[tuple[int, int, int]] = []
    previous = bytearray(row_bytes)
    pos = 0
    for _y in range(height):
        filter_type = raw[pos]
        pos += 1
        scan = bytearray(raw[pos : pos + row_bytes])
        pos += row_bytes
        if filter_type > 4:
            raise ValueError(f"invalid PNG filter: {filter_type}")

        for i in range(row_bytes):
            left = scan[i - bpp] if i >= bpp else 0
            above = previous[i]
            upper_left = previous[i - bpp] if i >= bpp else 0
            if filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = paeth(left, above, upper_left)
            else:
                predictor = 0
            scan[i] = (scan[i] + predictor) & 0xFF

        for i in range(0, row_bytes, bpp):
            pixels.append((scan[i], scan[i + 1], scan[i + 2]))
        previous = scan

    return width, height, pixels


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_screenshot.py <screenshot.png>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"screenshot missing: {path}", file=sys.stderr)
        return 1

    try:
        width, height, pixels = decode_png(path)
    except (OSError, ValueError, zlib.error, struct.error) as exc:
        print(f"invalid screenshot: {exc}", file=sys.stderr)
        return 1

    if (width, height) != (200, 228):
        print(f"unexpected emery screenshot size: {width}x{height}; expected 200x228", file=sys.stderr)
        return 1

    # The current Alloy fatal dialog uses a nearly uniform mid-gray background.
    # A healthy JankTime2 frame uses the approved white e-paper background with
    # black text plus blue/yellow accents. Catch the fatal screen even when the
    # Pebble CLI itself exits successfully after taking the screenshot.
    mid_gray = sum(
        1 for r, g, b in pixels
        if r == g == b and 128 <= r <= 220
    )
    ratio = mid_gray / len(pixels)
    print(f"Screenshot {width}x{height}; mid-gray pixels: {ratio:.1%}")
    if ratio > 0.80:
        print(
            "fatal-screen smoke check failed: screenshot is dominated by flat mid-gray; "
            "inspect for Alloy: Fatal Error / memory full",
            file=sys.stderr,
        )
        return 1

    # A blank white screenshot can mean that the Alloy VM exited at launch,
    # e.g. because a requested custom-font resource is missing. Require the
    # foreground and accents expected in this watchface, not just a non-gray image.
    dark_pixels = sum(1 for r, g, b in pixels if max(r, g, b) < 160)
    blue_pixels = sum(1 for r, g, b in pixels if b >= 100 and b >= r + 60 and b >= g + 20)
    yellow_pixels = sum(1 for r, g, b in pixels if r >= 160 and g >= 110 and r >= g + 25 and g >= b + 35)
    accent_pixels = blue_pixels + yellow_pixels
    print(
        f"Foreground pixels: {dark_pixels}; blue pixels: {blue_pixels}; "
        f"yellow pixels: {yellow_pixels}"
    )
    if dark_pixels < 40 or accent_pixels < 10:
        print(
            "blank-screen smoke check failed: expected foreground text and blue/yellow accents; "
            "inspect Alloy launch logs and generated font resources",
            file=sys.stderr,
        )
        return 1

    print("Emery screenshot smoke check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
