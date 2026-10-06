--
-- Name: set_notification_preference(public.notification_kind, public.notification_channel, boolean); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: FUNCTION set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) IS 'Turn one kind of notification on (p_enabled true) or off (false) on one channel for the caller. Admin-only, guard-first on assert_admin, because every kind today is one only an admin receives; a kind for another role widens the guard. The person is auth.uid() and never a parameter, so a caller answers only for themselves. Setting the answer already on file changes nothing, updated_at included. SECURITY DEFINER because notification_preferences carries no write grant for any Data API role: this is its only writer. Called from the settings page through the caller''s own session, which is why authenticated is the only role granted EXECUTE.';


--
-- Name: FUNCTION set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_notification_preference(p_kind public.notification_kind, p_channel public.notification_channel, p_enabled boolean) TO authenticated;


