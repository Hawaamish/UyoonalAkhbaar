# Tracker image optimization

New page images, pasted or attached comment images, and images in legacy
imports are optimized automatically before upload. Supported static raster
images are limited to 1,000 pixels on their longest side without upscaling.
The tracker uses WebP at quality 0.68 when supported, falling back to PNG; smaller originals
already within the limit are kept. Transparency is retained.

Animated GIF, PNG, WebP, and AVIF files remain unchanged to preserve their
animation. SVG, HEIC, HEIF, and JPEG XL are also kept unchanged because they
may contain animation. Existing uploaded images are not modified. If an image
cannot be read or processed, the save or send fails with an error so the user
can retry.

Page-list and comment images load lazily, so the browser can defer off-screen
downloads. Voice notes are not preloaded before playback. Browsers decide when
to load lazy media, and signed URLs still expire and need renewing; these
changes do not impose an egress limit or modify existing files.

New uploads have a one-year cache-control lifetime and use unique file paths.
Files already downloaded may remain in a browser cache after access is revoked
or the object is removed. Existing uploads keep their original cache settings.
