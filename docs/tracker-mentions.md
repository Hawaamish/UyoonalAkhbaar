# Tracker mentions and notifications

## Database setup

Run [tracker-mentions.sql](../supabase/tracker-mentions.sql) in the Supabase SQL
editor for the Page Review Tracker project **before** deploying the updated
page. Run it again when upgrading from mentions alone: it adds reply tracking
and reply notifications. It creates a notifications table, recipient-only
access policies, and triggers on `public.notes`, and adds notifications to the
Realtime publication.
The tracker requires its existing `members`, `notes`, `pages`, and `items`
tables and their existing permissions. The notes table must populate `author`
with the signed-in member's email.

The script runs in a transaction and can be rerun. If it fails, do not deploy
the feature until the database error is resolved. Tagging and tagged replies
are disabled when notifications cannot be loaded.

## Using mentions

Each point's conversation displays members in different colors, with your
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
when it reconnects and through its existing fallback polling.

The recipient can choose **Enable browser alerts** in Notifications and grant
permission. These alerts work only while the tracker is open, on a supported
secure origin (HTTPS or localhost). They are not email or background push
notifications and will not alert a user while the site is closed.
