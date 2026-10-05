--
-- Name: sweep_expired_discord_link_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sweep_expired_discord_link_tokens() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM public.discord_link_tokens WHERE expires_at <= now();
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION sweep_expired_discord_link_tokens(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sweep_expired_discord_link_tokens() IS 'Statement trigger on discord_link_tokens: deletes every expired token before rows are inserted, which keeps the table small without a scheduled job.';


--
-- Name: FUNCTION sweep_expired_discord_link_tokens(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sweep_expired_discord_link_tokens() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sweep_expired_discord_link_tokens() TO service_role;


