--
-- Name: get_my_participation_subscription_states(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_participation_subscription_states() RETURNS TABLE(participation_id uuid, status text, current_period_end timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT fs.participation_id, fs.status, fs.current_period_end
  FROM public.family_subscriptions fs
  JOIN public.participations p ON p.id = fs.participation_id
  WHERE fs.status IN ('past_due', 'canceling')
    AND (
      p.customer_id = (SELECT auth.uid())
      OR p.participant_id = (SELECT auth.uid())
    );
$$;


--
-- Name: FUNCTION get_my_participation_subscription_states(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_participation_subscription_states() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_participation_subscription_states() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_participation_subscription_states() TO service_role;


