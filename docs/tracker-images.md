# Tracker image optimization

New page images, pasted or attached comment images, and images in legacy
imports are optimized automatically before upload. Supported static raster
images are limited to 1,000 pixels on their longest side without upscaling.
The tracker uses WebP at quality 0.68 when supported, falling back to PNG; smaller originals
already within the limit are kept. Transparency is retained.

Animated GIF, PNG, WebP, and AVIF files remain unchanged to preserve their
animation. SVG, HEIC, HEIF, and JPEG XL are also kept unchanged because they
may contain animation. If an image
cannot be read or processed, the save or send fails with an error so the user
can retry.

The optional admin maintenance script
[`tracker-optimize-media.js`](../scripts/tracker-optimize-media.js) can create
smaller, full-resolution copies of existing page and comment images. It
downloads the originals once, retains them in Storage, and updates a reference
only if it still matches the value read before processing. Images that do not
become smaller are left alone. The copies use lossy WebP at quality 0.68 when
available. Page copy filenames start with `optimized-v1-` followed by the
original filename encoded as unpadded base64url, a dot, and a unique suffix. Comment
attachments keep their previous path in `original_path`. These records let an
admin identify and restore originals if needed. If a database update fails after
upload, an unused optimized copy may remain in Storage; the original is not
deleted. Retaining originals increases storage use, and one-time processing
uses additional egress. This script does not convert voice notes.
To run it again, load its contents in an authenticated tracker admin browser
session and call `optimizeTrackerMedia({sb, bucket:B, shrink, uuid,
imageExtension, allRows, isAdmin})`. It requires the existing database and
Storage write permissions and stops on an error or concurrent edit.

Page-list and comment images load lazily, so the browser can defer off-screen
downloads. Voice notes are not preloaded before playback. Browsers decide when
to load lazy media. Already displayed images keep their URL during background
redraws rather than being downloaded again when a URL is renewed. Temporary
signed URLs are also reused after a reload in the same browser tab, until their
50-minute local cache expires. Signing out clears this tab's cached URLs;
session storage normally ends when the tab closes, though browsers may restore
closed sessions. The URLs are scoped to the signed-in user and grant access to
the file until they expire; they are stored in the browser's session storage.
Printing all pages still downloads their images. These changes do not impose
an egress limit or modify existing files.

New uploads have a one-year cache-control lifetime and use unique file paths.
Files already downloaded may remain in a browser cache after access is revoked
or the object is removed. Existing uploads keep their original cache settings.

## Backblaze B2 media storage

The tracker can keep Supabase Auth, Postgres and Realtime while storing media
privately in Backblaze B2. Media paths switched by the migration are prefixed
with `b2:` in the existing `pages` and `notes` records. The browser asks the
`tracker-media` Supabase Edge Function for short-lived URLs; B2 application
keys stay in Edge Function secrets and are never placed in the HTML. New page
images, comment attachments and voice notes upload directly to B2.

Before deploying this integration:

1. Create a **private** B2 bucket and a standard application key restricted to
   that bucket with read, write and delete access. Do not use the account master
   key.
2. Configure the bucket's S3 CORS rule to allow `GET`, `HEAD` and `PUT` from
   `https://hawaamish.github.io`, `http://127.0.0.1:5500`, and
   `http://localhost:5500`. Allow the `Content-Type`, `Cache-Control` and
   `Range`, and `x-amz-meta-sourcesha256` headers. Add the actual local
   origin/port used for development if it differs.
3. Store `B2_BUCKET`, `B2_ENDPOINT`, `B2_REGION`, `B2_KEY_ID`, and
   `B2_APPLICATION_KEY` as Supabase Edge Function secrets using the Supabase
   dashboard. Never put the application key in this repository or browser.
   The endpoint is the S3 endpoint shown for the bucket, typically
   `https://s3.<region>.backblazeb2.com`.
4. Deploy `supabase/functions/tracker-media` with `supabase functions deploy
   tracker-media`, then deploy the updated tracker page.
5. Sign in as an admin and choose **Move media to Backblaze**. The migration
   copies every listed object in the Supabase `tracker-files` bucket, including
   unreferenced files, then conditionally updates active database references.
   It can be retried after an interruption. Supabase originals are intentionally
   retained for rollback; this means the old objects continue to use Supabase
   storage until they are explicitly cleaned up later.

The migration requires members to have list and download access to the existing
Supabase bucket. It stops before changing references if any active media path
is missing from the bucket. Objects are copied before references change, and
the app verifies that an object is not referenced before deleting a B2 object.
Do not delete the old Supabase objects until the B2-backed tracker has been
verified on all member devices.

Direct B2 delivery currently uses signed object URLs. Backblaze's published
pricing includes free monthly egress up to three times average stored data;
additional direct egress may be billable. A CDN/compute partner is a separate
configuration and is not included in this integration. Check the current
[Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) and
usage dashboard after migration. B2 also needs the listed CORS rule for browser
uploads and media playback.
