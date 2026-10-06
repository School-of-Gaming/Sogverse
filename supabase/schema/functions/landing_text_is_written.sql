--
-- Name: landing_text_is_written(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_text_is_written(p_value jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_typeof(p_value) = 'string' AND (p_value #>> '{}') ~ '\S', false);
$$;


--
-- Name: FUNCTION landing_text_is_written(p_value jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_text_is_written(p_value jsonb) IS 'Whether a landing page text field is written: a JSON string holding something other than whitespace. Absent, null, a non-string or a blank string is unwritten. The TypeScript half of the required-text rule tests the same thing.';


--
-- Name: FUNCTION landing_text_is_written(p_value jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_text_is_written(p_value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_text_is_written(p_value jsonb) TO service_role;


