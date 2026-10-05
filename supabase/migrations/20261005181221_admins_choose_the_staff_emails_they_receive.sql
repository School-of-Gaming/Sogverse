-- Admins choose the staff emails they receive.
--
-- WHAT THIS ADDS
--
-- An admin turns each kind of staff email on or off for themselves, from their
-- own settings page. Every kind is OFF until the admin turns it on: no row
-- means off, so no admin, existing or future, receives a kind they have not
-- asked for, and nothing is backfilled.
--
-- 1. `admin_email_kind` — the enum of staff emails an admin can opt into. One
--    value today, `session_report_copy`: the copy of a session report that is
--    mailed to its sender when a gedu or an admin emails it to the group's
--    families, which an opted-in admin receives in CC. A new kind is a new
--    value plus its toggle in the app.
-- 2. `admin_email_preferences` — one row per (admin, kind) the admin has
--    answered, holding their answer. Latest state only. An admin reads their
--    own rows; the mailing routes read through the service role.
-- 3. `set_admin_email_preference(admin_email_kind, boolean)` — the one writer:
--    the signed-in admin sets one kind for themselves.

-- ---------------------------------------------------------------------------
-- 1. The kinds
-- ---------------------------------------------------------------------------

CREATE TYPE public.admin_email_kind AS ENUM ('session_report_copy');

COMMENT ON TYPE public.admin_email_kind IS 'A kind of staff email an admin can opt into. session_report_copy: the copy of a session report mailed to its sender when a gedu or an admin emails the report to the group''s families; an admin who opted in is in its CC. Every kind is off for an admin until they turn it on. The app lists them in the order declared here, so a new value goes where it should appear.';

-- ---------------------------------------------------------------------------
-- 2. Who receives which kind
-- ---------------------------------------------------------------------------

CREATE TABLE public.admin_email_preferences (
    admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind public.admin_email_kind NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (admin_id, kind)
);

COMMENT ON TABLE public.admin_email_preferences IS 'Which kinds of staff email each admin receives. A row is an admin''s explicit answer for one kind; NO ROW MEANS OFF, so every kind is off for every admin until they turn it on. A sender reads the rows with enabled = true for its kind. Only an admin can hold a row, because the setter is admin-only. Written only by set_admin_email_preference; authenticated holds SELECT alone, and an admin reads only their own rows.';
COMMENT ON COLUMN public.admin_email_preferences.enabled IS 'True: the admin receives this kind. False: they turned it off. NOT NULL with no third state, because "never answered" is the absence of the row, and it means off.';
COMMENT ON COLUMN public.admin_email_preferences.updated_at IS 'When the answer last changed, stamped server-side. Setting the answer already on file leaves it alone.';

ALTER TABLE public.admin_email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_email_preferences_owner_read ON public.admin_email_preferences
  FOR SELECT TO authenticated
  USING (admin_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.admin_email_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_email_preferences TO authenticated;
GRANT ALL ON TABLE public.admin_email_preferences TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Setting a preference
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_kind IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'an admin email preference needs both a kind and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.admin_email_preferences (admin_id, kind, enabled, updated_at)
  VALUES ((SELECT auth.uid()), p_kind, p_enabled, now())
  ON CONFLICT (admin_id, kind) DO UPDATE
     SET enabled = EXCLUDED.enabled,
         updated_at = EXCLUDED.updated_at
   WHERE public.admin_email_preferences.enabled IS DISTINCT FROM EXCLUDED.enabled;
END;
$$;

COMMENT ON FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) IS 'Turn one kind of staff email on (p_enabled true) or off (false) for the calling admin. Admin-only, guard-first on assert_admin. The admin is auth.uid() and never a parameter, so an admin answers only for themselves. Setting the answer already on file changes nothing, updated_at included. SECURITY DEFINER because admin_email_preferences carries no write grant for any Data API role: this is its only writer. Called from the admin''s settings page through their own session, which is why authenticated is the only role granted EXECUTE.';

REVOKE ALL ON FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) TO authenticated;
