--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_unaccent(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, p_value);
$$;


--
-- Name: FUNCTION immutable_unaccent(p_value text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.immutable_unaccent(p_value text) IS 'Diacritic-stripping fold, declared IMMUTABLE so it may be used in a generated column. unaccent() itself is STABLE because it resolves a dictionary by name; pinning the dictionary makes the result depend on nothing but the input. If the extensions.unaccent dictionary is ever redefined, locations.search_blob must be recomputed and its index rebuilt.';


--
-- Name: FUNCTION immutable_unaccent(p_value text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.immutable_unaccent(p_value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.immutable_unaccent(p_value text) TO anon;
GRANT ALL ON FUNCTION public.immutable_unaccent(p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.immutable_unaccent(p_value text) TO service_role;


