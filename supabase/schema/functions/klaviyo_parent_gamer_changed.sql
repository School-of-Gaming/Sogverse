--
-- Name: klaviyo_parent_gamer_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_parent_gamer_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.parent_id]);
  ELSE
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.parent_id]);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_parent_gamer_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_parent_gamer_changed() IS 'Trigger on parent_gamer, after every insert and delete: files the parent in the Klaviyo profile outbox, because their gamers are on their Klaviyo profile. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_parent_gamer_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_parent_gamer_changed() FROM PUBLIC;


