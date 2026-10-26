--
-- Name: klaviyo_parent_profile_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_parent_profile_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.role = 'customer'::public.user_role THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.id]);
  ELSE
    PERFORM public.file_klaviyo_profiles(ARRAY[NEW.id]);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_parent_profile_changed(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_parent_profile_changed() IS 'Trigger on profiles, after an update of a row that is or was a customer and that changes a column the Klaviyo snapshot reads or decides on (role and registration_completed_at among them): files it in the Klaviyo profile outbox — through file_klaviyo_profiles when its role has just left customer, since enqueue_klaviyo_profiles files customers only. A profile''s insert files nothing: a password parent is filed when their registration records the terms (klaviyo_account_consent_accepted), a Google parent when the completion route stamps registration_completed_at. Whether the row reaches Klaviyo is the snapshot''s to say, and only a registered customer has one. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_parent_profile_changed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_parent_profile_changed() FROM PUBLIC;


