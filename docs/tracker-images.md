# Tracker image optimization

All tracker media is stored in the Supabase Storage bucket `tracker-files`.
Uploads, signed downloads, and deletions use Supabase Storage.

New page images, pasted or attached comment images, and images in legacy
imports are optimized automatically before upload. Supported static raster
images are limited to 1,000 pixels on their longest side without upscaling.
The tracker uses WebP at quality 0.68 when supported, falling back to PNG;
smaller originals already within the limit are kept. Transparency is retained.

Animated GIF, PNG, WebP, and AVIF files remain unchanged to preserve their
animation. SVG, HEIC, HEIF, and JPEG XL are also kept unchanged because they
may contain animation. If an image cannot be read or processed, the save or
send fails with an error so the user can retry.

The optional admin maintenance script
[`tracker-optimize-media.js`](../scripts/tracker-optimize-media.js) can create
smaller, full-resolution copies of existing page and comment images. It
downloads the originals once, retains them in Storage, and updates a reference
only if it still matches the value read before processing. Images that do not
become smaller are left alone. The copies use lossy WebP at quality 0.68 when
available. Page copy filenames start with `optimized-v1-` followed by the
original filename encoded as unpadded base64url, a dot, and a unique suffix.
Comment attachments keep their previous path in `original_path`. These records
let an admin identify and restore originals if needed. If a database update
fails after upload, an unused optimized copy may remain in Storage; the
original is not deleted. Retaining originals increases storage use, and
one-time processing uses additional egress. This script does not convert voice
notes. To run it again, load its contents in an authenticated tracker admin
browser session and call `optimizeTrackerMedia({sb, bucket:B, shrink, uuid,
imageExtension, allRows, isAdmin})`. It requires the existing database and
Storage write permissions and stops on an error or concurrent edit.

Page-list and gallery previews use derived 240-pixel thumbnails; the full-size
image remains on the page detail and print views. New page images upload a
thumbnail alongside the original. Existing thumbnails are created the first
time a preview is loaded: that browser downloads the original to create and
upload a small WebP copy, and other members can then use that copy. If several
members open the same ungenerated preview at once, they may briefly create it
concurrently. Unsupported image types fall back to their original preview.

Downloaded images are also cached in IndexedDB on the device, scoped to the
signed-in Supabase user, with a 64 MB total device cache limit. This lets images
already viewed on that device be reused after a reload without another storage
download. Signed URLs remain in session storage for up to 50 minutes; signing
out clears the URLs and in-memory object URLs. Browsers decide when to load
off-screen images. Voice notes use `preload="none"` and documents use links, so
their content is requested only on playback or opening. Printing all pages
still downloads their full-size images. These changes do not impose an egress
limit.

New uploads have a one-year cache-control lifetime and use unique file paths.
Files already downloaded may remain in a browser cache after access is revoked
or the object is removed. Existing uploads keep their original cache settings.
