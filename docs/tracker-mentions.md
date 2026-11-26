# Tracker mentions and notifications

## Database setup

Run [tracker-mentions.sql](../supabase/tracker-mentions.sql) in the Supabase SQL
editor for the Page Review Tracker project **before** deploying the updated
page. It creates a notifications table, recipient-only access policies, and
triggers on `public.notes`, and adds notifications to the Realtime publication.
The tracker requires its existing `members`, `notes`, `pages`, and `items`
tables and their existing permissions. The notes table must populate `author`
with the signed-in member's email.

The script runs in a transaction and can be rerun. If it fails, do not deploy
the feature until the database error is resolved. Tagging is disabled when the
notification table cannot be loaded.

## Using mentions

Open a point's comments, select **@ Tag a member**, search for a member, and
select them. Send the response to create their notification. A member can be
tagged more than once in a comment but receives only one notification for it.
Self-mentions do not send a notification. Deleting a response removes its
notifications.

The recipient sees an unread badge and can open the notification to jump to
the comment. Notifications are saved in Supabase, so mentions received while
away appear on the next sign-in and read status follows the account across
devices. If Realtime is interrupted, the tracker also refreshes notifications
when it reconnects and through its existing fallback polling.

The recipient can choose **Enable browser alerts** in Notifications and grant
permission. These alerts work only while the tracker is open, on a supported
secure origin (HTTPS or localhost). They are not email or background push
notifications and will not alert a user while the site is closed.
