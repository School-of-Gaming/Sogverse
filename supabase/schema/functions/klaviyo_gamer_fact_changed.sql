--
-- Name: klaviyo_gamer_fact_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_gamer_fact_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_parents_of_gamer(OLD.user_id);
  ELSE
    PERFORM public.enqueue_klaviyo_parents_of_gamer(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_gamer_fact_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_gamer_fact_changed() IS 'Trigger on gamer_profiles (gender and birth year), minecraft_accounts and roblox_accounts (a game linked or unlinked): files each of the gamer''s parents in the Klaviyo profile outbox. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_gamer_fact_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_gamer_fact_changed() FROM PUBLIC;


