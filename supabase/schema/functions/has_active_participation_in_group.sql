--
-- Name: has_active_participation_in_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_active_participation_in_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.group_id = p_group_id
       AND (p.customer_id = (SELECT auth.uid()) OR p.participant_id = (SELECT auth.uid()))
       AND p.status = 'active'
  );
$$;


--
-- Name: FUNCTION has_active_participation_in_group(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) TO authenticated;


