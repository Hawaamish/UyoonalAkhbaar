# Tracker image optimization

New page images, pasted or attached comment images, and images in legacy
imports are optimized automatically before upload. Supported static raster
images are limited to 1,600 pixels on their longest side without upscaling.
The tracker uses WebP when supported, falling back to PNG; smaller originals
already within the limit are kept. Transparency is retained.

Animated GIF, PNG, WebP, and AVIF files remain unchanged to preserve their
animation. SVG, HEIC, HEIF, and JPEG XL are also kept unchanged because they
may contain animation. Existing uploaded images are not modified. If an image
cannot be read or processed, the save or send fails with an error so the user
can retry.
