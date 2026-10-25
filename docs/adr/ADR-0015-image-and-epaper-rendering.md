# ADR-0015: Downscale user images on the phone and clear the Poco frame to paper white

- Status: Accepted
- Date: 2026-10-25

## Context

The middle cell of the second metric row is reserved for a user-provided image. The device has limited RAM and a small 200×228 display, and the watchface must be friendly to its e-paper-style display/backlight. The image must not displace metrics or change layout geometry.

## Options considered

1. Transfer the original image to the watch and resize there. This wastes Bluetooth bandwidth and increases decode memory on the watch.
2. Upload the original image to the watch's storage and crop it on each draw. This repeats work and retains a larger payload than the display needs.
3. Decode, crop, and downscale on the phone configurator to the measured native image-slot dimensions, convert to a bounded supported raster, then transfer the compact image to the watch. This uses the phone's memory for image processing and bounds the watch payload.
4. Render the image area as a provider-selected URL/bitmap at draw time. The watch must not fetch arbitrary image URLs, and the runtime must not treat untrusted provider data as executable or unrestricted resources.

## Decision

Choose option 3. During implementation, define one authoritative image-slot bounds constant from the final Poco layout. The native companion must reject unreasonable source dimensions/files before decoding, resize/crop to those exact pixel bounds on the phone, convert to a limited palette suited to the display, then transfer in bounded/acknowledged chunks. The watch must not decode a full-resolution camera image.

Poco must clear the previous frame before drawing the updated screen to avoid artifacts from old values. Use the display's default white/paper pixel color and black foreground; do not paint a black full-screen background or simulate the screenshot's dark background. The chosen blue/yellow accents remain reserved for the semantic icons and battery indicators. Physical backlight tint remains a device setting; do not hard-code an alternate tint.

## Consequences

- Image uploads do not increase the watch image decoder's peak memory by source-image dimensions.
- Image transfer needs bounded chunks, acknowledgements, and an abort/retry path.
- Upload sizing cannot be finalized until the layout's actual native image-cell bounds are fixed and tested in the emulator.
- Each full-screen draw first restores the paper-white background and then draws all current foreground data to prevent stale pixels.

## References

- https://developer.repebble.com/guides/alloy/poco-guide/
- https://developer.repebble.com/guides/alloy/reference/
- https://github.com/coredevices/pebble-watchface-agent-skill
