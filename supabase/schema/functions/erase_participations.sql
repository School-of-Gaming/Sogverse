--
-- Name: erase_participations(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.erase_participations(p_participation_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('sogverse.erasure', 'on', true);
  DELETE FROM public.participations WHERE id = ANY (p_participation_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('sogverse.erasure', 'off', true);
  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION erase_participations(p_participation_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.erase_participations(p_participation_ids uuid[]) IS 'Deletes the named participations whatever their status, past trg_participations_guard_delete, and returns how many went; their family_subscriptions rows cascade with them. This is erasure, not an ending: a seat leaving a club goes through end_participation and is kept. For the GDPR erasure procedure and for test teardown. The erasure setting is switched on only around its own DELETE. service_role only.';


--
-- Name: FUNCTION erase_participations(p_participation_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.erase_participations(p_participation_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.erase_participations(p_participation_ids uuid[]) TO service_role;


