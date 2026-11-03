--
-- Name: guard_participation_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_participation_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.status <> 'waitlisted'
     AND current_setting('sogverse.erasure', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'participation % held a seat and is ended, not deleted (end_participation); only an erasure deletes it',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION guard_participation_delete(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_participation_delete() IS 'BEFORE DELETE trigger on participations: a row that is not waitlisted is history, so deleting it is refused (restrict_violation) unless the transaction set sogverse.erasure to on. The guard sees cascades as well, so deleting a profile or a product that still has seats needs the setting too: the GDPR erasure sets it (SET LOCAL sogverse.erasure = on, or erase_participations first), and a product is only ever deleted by hand. Waitlisted rows go freely: leaving the line, declining an offer and turning a waitlist off all delete them. Granted to nobody.';


--
-- Name: FUNCTION guard_participation_delete(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_participation_delete() FROM PUBLIC;


