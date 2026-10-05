--
-- Name: set_admin_email_preference(public.admin_email_kind, boolean); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: FUNCTION set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) IS 'Turn one kind of staff email on (p_enabled true) or off (false) for the calling admin. Admin-only, guard-first on assert_admin. The admin is auth.uid() and never a parameter, so an admin answers only for themselves. Setting the answer already on file changes nothing, updated_at included. SECURITY DEFINER because admin_email_preferences carries no write grant for any Data API role: this is its only writer. Called from the admin''s settings page through their own session, which is why authenticated is the only role granted EXECUTE.';


--
-- Name: FUNCTION set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_admin_email_preference(p_kind public.admin_email_kind, p_enabled boolean) TO authenticated;


