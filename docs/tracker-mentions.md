# Tracker mentions and notifications

## Database setup

Run [tracker-mentions.sql](../supabase/tracker-mentions.sql) in the Supabase SQL
editor for the Page Review Tracker project **before** deploying the updated
page. Run it again when upgrading to page discussions: it permits comments
and notifications without an item and updates the reply trigger. It creates a notifications table, recipient-only
access policies, and triggers on `public.notes`, and adds notifications to the
Realtime publication.
The tracker requires its existing `members`, `notes`, `pages`, and `items`
tables and their existing permissions. The notes table must populate `author`
with the signed-in member's email. Existing notes row-level security policies
must allow members to read and insert page comments with a null `item_id` as
well as point comments. Verify those policies in the target project before
deploying; this script does not replace them.

The script runs in a transaction and can be rerun. If it fails, do not deploy
the feature until the database error is resolved. Tagging and tagged replies
are disabled when notifications cannot be loaded.

## Using mentions

Use the comment icon beside a page in the page list for its general discussion;
the icon is highlighted when the page has comments. Open a point's comment
button for a point-specific discussion. Both support the same tagging,
replies, attachments and voice notes. Notifications label page comments
separately from point comments and open the relevant conversation.

Each conversation displays members in different colors, with your
messages on the right. Use the composer below the chat to attach files, record
voice notes, and tag members. Microphone selection and input level are under
**Microphone settings**.

Open a point's comments and type **@** followed by a name, or select
**@ Tag** to search. Choose a member from the suggestions and send the
response to create their notification. A member can be tagged more than once
in a comment but receives only one notification for it.
Self-mentions do not send a notification. Deleting a response removes its
notifications.

When someone tags you, choose **Reply** on that comment and send your response.
The person who tagged you receives a reply notification, even if your response
only contains an attachment or voice note. A reply is linked to that specific
comment; an ordinary response without selecting **Reply** does not notify its
author automatically. If you also tag the author in the reply, they receive
one notification, not two. Deleting the original comment leaves the reply
visible, labeled as a reply to a deleted comment.

The recipient sees an unread badge and can open the notification to jump to
the comment. Notifications are saved in Supabase, so notifications received while
away appear on the next sign-in and read status follows the account across
devices. If Realtime is interrupted, the tracker also refreshes notifications
when it reconnects and through fallback polling. Visible tabs reconcile after
five minutes without a successful sync, checked every 30 seconds; returning to
an older tab also triggers a refresh. This reduces repeated full-data downloads,
but a silently stalled connection can delay updates until the fallback runs.
If a tagged comment arrives but its notification event does not, the recipient
checks for that comment's notification directly. A missing notification for an
explicit mention is reported so an admin can check the database setup.

Live changes preserve the reader's position and unsaved checklist text where
possible. If two members edit the same point, the latest saved text wins;
coordinate those edits to avoid overwriting one another.

The recipient can choose **Enable browser alerts** in Notifications and grant
permission. These alerts work only while the tracker is open, on a supported
secure origin (HTTPS or localhost). They are not email or background push
notifications and will not alert a user while the site is closed.
New notifications play the supplied default tone while the tracker is open.
Browser autoplay policies can block the tone until the user interacts with the
tracker; **Test sound** in Notifications can be used to retry. Muted tabs,
device audio settings, notification permissions, and operating-system settings
also affect alerts. The operating system controls where desktop alerts appear.

## Tracker menu

The right-hand menu contains print and account actions for members. Backup,
old-backup import and member management appear there only for admins. This
interface restriction does not replace Supabase row-level security: configure
database policies separately to enforce administrator-only writes. Members
must retain access to tracker data to use the tracker, so hiding the backup
button does not prevent them from copying data they can already read.

## Admin refresh

Run [tracker-refresh.sql](../supabase/tracker-refresh.sql) in the Supabase SQL
editor before deploying this feature. It creates a single Realtime-published
revision row, readable by members, and an admin-checked function for requesting
a refresh. Its authorization depends on the existing `members` table and its
policies; members must not be able to grant themselves the admin role.

After deploying, everyone must reload once to receive the new refresh
listener. An admin can then choose **Refresh members** in the menu and confirm.
Connected trackers reload using a fresh URL when it is safe; the initiating
admin is included. Tabs with drafts, edits, recordings, playing audio, open
dialogs, or ongoing saves wait until the work is finished or cleared. Page
selection, filter, search, and scroll positions are restored where possible.
If the browser cannot save the workspace, it asks the member to reload manually.

Tabs that temporarily disconnect check the revision on reconnect. A tab that
was not open, or that has not yet loaded this feature, cannot receive the
request; it needs to open or reload the updated page itself. This is a reload
request, not confirmation that every member reloaded. Reloads download tracker
data and may increase egress.
