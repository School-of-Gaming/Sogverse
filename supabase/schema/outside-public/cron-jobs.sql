-- Scheduled pg_cron jobs. Rows in cron.job rather than DDL, rendered as the calls that schedule them.
-- Generated from the database by `npm run db -- generate`; never hand-edited.

SELECT cron.schedule('substitution-notifications-close-out', '15 0 * * *', $$SELECT public.enqueue_passed_substitution_notifications()$$);
SELECT cron.schedule('substitution-notifications-retry', '* * * * *', $$SELECT public.kick_substitution_notification_sync_if_due()$$);
