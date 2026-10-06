-- Notification preferences: each person chooses which notifications reach them,
-- and through which channel.
--
-- WHAT THIS ADDS
--
-- A person turns each kind of notification on or off for themselves, per
-- channel, from their own settings page. Every (kind, channel) is OFF until
-- they turn it on: no row means off, so nobody, existing or future, receives a
-- notification they have not asked for, and nothing is backfilled.
--
-- 1. `notification_kind` — what the notification is about. One value today,
--    `session_report_copy`: the copy of a session report that is mailed to its
--    sender when a gedu or an admin emails it to the group's families, which an
--    opted-in admin receives in CC.
-- 2. `notification_channel` — how it reaches the person. One value today,
--    `email`.
-- 3. `notification_preferences` — one row per (profile, kind, channel) the
--    person has answered, holding their answer. Latest state only. A person
--    reads their own rows; the senders read through the service role.
-- 4. `set_notification_preference(notification_kind, notification_channel,
--    boolean)` — the one writer: the signed-in person sets one kind on one
--    channel for themselves. Admin-only for now, because the only kind is an
--    admin's.

-- ---------------------------------------------------------------------------
-- 1. The kinds
-- ---------------------------------------------------------------------------

CREATE TYPE public.notification_kind AS ENUM ('session_report_copy');

COMMENT ON TYPE public.notification_kind IS 'What a notification a person can opt into is about. session_report_copy: the copy of a session report mailed to its sender when a gedu or an admin emails the report to the group''s families; an admin who opted in on the email channel is in its CC. Every kind is off on every channel until the person turns it on. The app lists them in the order declared here, so a new value goes where it should appear.';

-- ---------------------------------------------------------------------------
-- 2. The channels
-- ---------------------------------------------------------------------------

CREATE TYPE public.notification_channel AS ENUM ('email');

COMMENT ON TYPE public.notification_channel IS 'How a notification reaches a person. email: a mail to the address on their profile. The settings page groups its toggles by channel, in the order declared here.';

-- ---------------------------------------------------------------------------
-- 3. Who receives which kind, on which channel
-- ---------------------------------------------------------------------------

CREATE TABLE public.notification_preferences (
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind public.notification_kind NOT NULL,
    channel public.notification_channel NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, kind, channel)
);

COMMENT ON TABLE public.notification_preferences IS 'Which notifications each person receives, per kind and channel. A row is a person''s explicit answer for one kind on one channel; NO ROW MEANS OFF, so every kind is off on every channel until they turn it on. A sender reads the rows with enabled = true for its kind and channel. Written only by set_notification_preference, which today only an admin may call; authenticated holds SELECT alone, and a person reads only their own rows.';
COMMENT ON COLUMN public.notification_preferences.channel IS 'How this kind reaches the person. The same kind may be answered differently on each channel.';
COMMENT ON COLUMN public.notification_preferences.enabled IS 'True: the person receives this kind on this channel. False: they turned it off. NOT NULL with no third state, because "never answered" is the absence of the row, and it means off.';
COMMENT ON COLUMN public.notification_preferences.updated_at IS 'When the answer last changed, stamped server-side. Setting the answer already on file leaves it alone.';

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_owner_read ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Setting a preference
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_kind IS NULL OR p_channel IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'a notification preference needs a kind, a channel and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.notification_preferences (profile_id, kind, channel, enabled, updated_at)
  VALUES ((SELECT auth.uid()), p_kind, p_channel, p_enabled, now())
  ON CONFLICT (profile_id, kind, channel) DO UPDATE
     SET enabled = EXCLUDED.enabled,
         updated_at = EXCLUDED.updated_at
   WHERE public.notification_preferences.enabled IS DISTINCT FROM EXCLUDED.enabled;
END;
$$;

COMMENT ON FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) IS 'Turn one kind of notification on (p_enabled true) or off (false) on one channel for the caller. Admin-only, guard-first on assert_admin, because every kind today is one only an admin receives; a kind for another role widens the guard. The person is auth.uid() and never a parameter, so a caller answers only for themselves. Setting the answer already on file changes nothing, updated_at included. SECURITY DEFINER because notification_preferences carries no write grant for any Data API role: this is its only writer. Called from the settings page through the caller''s own session, which is why authenticated is the only role granted EXECUTE.';

REVOKE ALL ON FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) TO authenticated;
