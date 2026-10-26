--
-- Name: klaviyo_gamer_profile_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_gamer_profile_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_klaviyo_parents_of_gamer(NEW.id);
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_gamer_profile_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_gamer_profile_changed() IS 'Trigger on profiles, after a gamer''s first name changes: files each of the gamer''s parents in the Klaviyo profile outbox. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_gamer_profile_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_gamer_profile_changed() FROM PUBLIC;


