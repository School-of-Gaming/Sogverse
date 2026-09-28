--
-- Name: chat_channel_roster_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT part.participant_id
    FROM public.chat_channels c
    JOIN public.participations part ON part.group_id = c.group_id
   WHERE c.id = p_channel_id
     AND part.status = 'active'::public.participation_status
  UNION
  SELECT ga.gedu_id
    FROM public.chat_channels c
    JOIN public.product_groups g ON g.id = c.group_id
    JOIN public.gedu_group_assignments ga ON ga.product_id = g.product_id
   WHERE c.id = p_channel_id
  UNION
  SELECT m.sender_id
    FROM public.chat_messages m
   WHERE m.channel_id = p_channel_id;
$$;


--
-- Name: FUNCTION chat_channel_roster_ids(p_channel_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) IS 'Internal: the account ids a channel''s roster names — the group''s active seat-holders, the product''s assigned gedus, and everyone who has a message in the channel. The single definition behind both get_chat_channel_roster and the send/edit mention validation, so the picker can never offer a name the send would refuse. Not exposed to `authenticated`: it is called from inside the SECURITY DEFINER chat RPCs.';


--
-- Name: FUNCTION chat_channel_roster_ids(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) TO service_role;


