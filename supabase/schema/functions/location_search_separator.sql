--
-- Name: location_search_separator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.location_search_separator() RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT chr(31);
$$;


--
-- Name: FUNCTION location_search_separator(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.location_search_separator() IS 'The term delimiter inside locations.search_blob: U+001F UNIT SEPARATOR. A term-prefix match is "contains separator || needle"; an exact term match is "contains separator || needle || separator".';


--
-- Name: FUNCTION location_search_separator(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.location_search_separator() FROM PUBLIC;
GRANT ALL ON FUNCTION public.location_search_separator() TO anon;
GRANT ALL ON FUNCTION public.location_search_separator() TO authenticated;
GRANT ALL ON FUNCTION public.location_search_separator() TO service_role;


