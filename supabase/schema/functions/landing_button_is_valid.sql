--
-- Name: landing_button_is_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_button_is_valid(p_button jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    jsonb_typeof(p_button) = 'object'
    AND (
      (p_button->>'kind' = 'internal'
        AND jsonb_typeof(p_button->'path') = 'string'
        AND p_button->>'path' LIKE '/%'
        AND p_button->>'path' NOT LIKE '//%')
      OR
      (p_button->>'kind' = 'external'
        AND jsonb_typeof(p_button->'url') = 'string'
        AND p_button->>'url' ~ '^https?://')
    ),
    false);
$$;


--
-- Name: FUNCTION landing_button_is_valid(p_button jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_button_is_valid(p_button jsonb) IS 'Whether a landing section''s button target has its shape: {kind: ''internal'', path} with a path that starts with one slash (a locale-less route of this site), or {kind: ''external'', url} with an http(s) URL.';


--
-- Name: FUNCTION landing_button_is_valid(p_button jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_button_is_valid(p_button jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_button_is_valid(p_button jsonb) TO service_role;


