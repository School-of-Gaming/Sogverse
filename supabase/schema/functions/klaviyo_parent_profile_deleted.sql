--
-- Name: klaviyo_parent_profile_deleted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_parent_profile_deleted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.file_klaviyo_profiles(ARRAY[OLD.id]);

  DELETE FROM public.klaviyo_event_outbox e WHERE e.customer_id = OLD.id;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_parent_profile_deleted(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_parent_profile_deleted() IS 'Trigger on profiles, after a parent row is deleted: files the parent in the Klaviyo profile outbox, where the snapshot''s silence about them tells the sync to delete their Klaviyo profile, and deletes their waiting events, which nobody will be told. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_parent_profile_deleted(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_parent_profile_deleted() FROM PUBLIC;


