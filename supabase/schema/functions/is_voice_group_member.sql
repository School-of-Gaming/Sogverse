--
-- Name: is_voice_group_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_voice_group_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.participations p
      where p.group_id = p_group_id
        and p.participant_id = (select auth.uid())
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    )
    -- The substitution branch, and the one place on this surface where it is DATE-
    -- SCOPED: a sub reaches the room on the dates they are substituting and on no
    -- other date of the group. It ADDS to the assignment arm above rather than
    -- narrowing it — a gedu assigned to the product keeps the product-wide
    -- mobility they already had.
    --
    -- "The session in question" is TODAY OR YESTERDAY in the PRODUCT's
    -- timezone, evaluated at call time because the predicate is handed a group
    -- and nothing else. Yesterday is not slack, it is the calendar: a session
    -- dated Monday that runs to 00:30 is still Monday's session at 00:10 on
    -- Tuesday, and asking only about today ejected its substitute from the room and
    -- from the chat at local midnight — while a session starting at 00:10
    -- refused them for its whole pre-window, which falls on the day before.
    -- The cost is a few hours in which a substitute could rejoin the PREVIOUS day's
    -- room, and the voice window itself is only open around a session, so there
    -- is nothing there to rejoin. gedu_substitutes_session still applies the access
    -- window and the certification test to whichever date matches.
    or exists (
      select 1
      from public.product_groups g2
      join public.products p2 on p2.id = g2.product_id
      where g2.id = p_group_id
        and (
          public.gedu_substitutes_session(
            p_group_id, (now() at time zone p2.timezone)::date
          )
          or public.gedu_substitutes_session(
               p_group_id, ((now() at time zone p2.timezone)::date - 1)
             )
        )
    );
$$;


--
-- Name: FUNCTION is_voice_group_member(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_voice_group_member(p_group_id uuid) IS 'Who may be in this group''s voice room, and therefore — through is_chat_channel_member — in its in-call chat: an admin, an active seat-holder of the group, a gedu assigned to ANY group of the group''s product, or a live substitution dated TODAY OR YESTERDAY in the product''s timezone. The substitution arm is the one thing on this surface that is date-scoped rather than group-wide, and it is the narrower of the two deliberate exceptions to "a sub sees everything the main gedu sees": a sub belongs in the room on the date they are substituting and on no other date of the group. "The session in question" is evaluated at CALL TIME because the predicate is handed a group and nothing else. The substitution arm ADDS to the assignment arm and narrows nothing — a gedu assigned to the product keeps the product-wide mobility they already had. Total boolean; consumed by the voice_zones and chat policies, which is why it is granted to `authenticated` despite being a predicate. YESTERDAY counts beside today because a session dated Monday that runs past local midnight is still Monday''s session at 00:30 on Tuesday, and a session starting at 00:10 has its whole pre-window on the day before; asking about today alone ejects the substitute from the room and the chat at midnight, and refuses them before a small-hours start. The access window inside gedu_substitutes_session applies to whichever date matches.';


--
-- Name: FUNCTION is_voice_group_member(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_voice_group_member(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_voice_group_member(p_group_id uuid) TO authenticated;


