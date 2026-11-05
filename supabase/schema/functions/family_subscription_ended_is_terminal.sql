--
-- Name: family_subscription_ended_is_terminal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.family_subscription_ended_is_terminal() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.ended_at IS NOT NULL
     AND (NEW.status IS DISTINCT FROM 'cancelled'
          OR NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'family subscription % ended with its seat at % and cannot change status',
      OLD.id, OLD.ended_at
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION family_subscription_ended_is_terminal(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.family_subscription_ended_is_terminal() IS 'BEFORE UPDATE trigger on family_subscriptions: a row whose ended_at is set stays cancelled with that stamp, and an update trying otherwise raises object_not_in_prerequisite_state rather than being silently kept, so a writer learns it tried to revive an ended subscription. Other columns stay writable. Granted to nobody.';


--
-- Name: FUNCTION family_subscription_ended_is_terminal(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.family_subscription_ended_is_terminal() FROM PUBLIC;


