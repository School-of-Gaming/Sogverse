--
-- Name: get_chat_channel_roster(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chat_channel_roster(p_channel_id uuid) RETURNS TABLE(id uuid, first_name text, role public.user_role)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.role
    FROM public.profiles pr
   WHERE pr.id IN (
     SELECT roster.account_id
       FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
   )
   ORDER BY pr.id;
END;
$$;


--
-- Name: FUNCTION get_chat_channel_roster(p_channel_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) IS 'The accounts a channel can name: the group''s active seat-holders, the product''s assigned gedus, and everyone who has a message in the channel — that last clause is what keeps a departed member''s name on the words they left behind, and how a covering gedu or an admin becomes mentionable the moment they send. First name and role only; nothing else about anybody. Membership-scoped on is_chat_channel_member. Exists because `profiles` RLS correctly refuses cross-participant reads and persisted history cannot resolve names from a live call the way the old ephemeral chat did. ORDERED BY PROFILE ID and that is a contract: mention resolution settles two accounts sharing a name by list position, and the composer and the in-place editor must be handed the same array in the same order or one typed name would mean two different people.';


--
-- Name: FUNCTION get_chat_channel_roster(p_channel_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) TO service_role;


