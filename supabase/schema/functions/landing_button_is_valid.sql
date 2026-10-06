--
-- Name: landing_button_is_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_button_is_valid(p_button jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT COALESCE(
    jsonb_typeof(p_button) = 'object'
    -- The kind and its one field, and nothing else.
    AND (SELECT count(*) FROM jsonb_object_keys(p_button)) = 2
    AND (
      (p_button->>'kind' = 'internal'
        AND jsonb_typeof(p_button->'path') = 'string'
        AND p_button->>'path' LIKE '/%'
        AND p_button->>'path' NOT LIKE '//%')
      OR
      (p_button->>'kind' = 'external'
        AND jsonb_typeof(p_button->'url') = 'string'
        AND p_button->>'url' ~ '^https?://')
      OR
      (p_button->>'kind' = 'email'
        AND jsonb_typeof(p_button->'to') = 'string'
        AND p_button->>'to' ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+$')
    ),
    false);
$_$;


--
-- Name: FUNCTION landing_button_is_valid(p_button jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_button_is_valid(p_button jsonb) IS 'Whether a landing section''s button target has its shape, with no other field: {kind: ''internal'', path} with a path that starts with one slash (a locale-less route of this site), {kind: ''external'', url} with an http(s) URL, or {kind: ''email'', to} with one email address. An email''s subject line is a word of each language version (emailSubject), not part of the target. The registry''s buttonTarget in src/lib/landing-pages/sections/ is the other half, and a DB test holds the two equal.';


--
-- Name: FUNCTION landing_button_is_valid(p_button jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_button_is_valid(p_button jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_button_is_valid(p_button jsonb) TO service_role;


