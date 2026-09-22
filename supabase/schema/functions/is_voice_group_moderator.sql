--
-- Name: is_voice_group_moderator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_voice_group_moderator(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    )
    -- Date-scoped, exactly as the membership predicate beside it is and for the
    -- same reason: a sub moderates the room on the dates they are substituting, not
    -- on the group's other dates. The two move together — the chat channel is
    -- gated by this pair, so a substitute is in the channel on their own date only,
    -- and a cross-midnight session that dropped one predicate at 00:00 would
    -- drop the other with it. Today OR yesterday in the product's timezone; the
    -- membership predicate above carries the whole reasoning.
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
-- Name: FUNCTION is_voice_group_moderator(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) IS 'Who MODERATES this group''s voice room and its chat: an admin, a gedu assigned to any group of the group''s product, or a live substitution on today''s date in the product''s timezone. A POSITIVE allow-list, never an exclusion — the room learned that the expensive way, a "not a gamer" test having been one parent-seat release away from handing moderation to parents. Date-scoped on its substitution arm exactly as is_voice_group_member is, and for the same reason: the two move together, because the chat channel is gated by the pair and a substitute must be in the channel on their own date only. Since 00276 its substitution arm accepts today OR yesterday in the product''s timezone, moving with is_voice_group_member as it always must: the chat channel is gated by the pair, so a cross-midnight session that dropped one would keep a substitute in the room with no moderation, or in the chat with none.';


--
-- Name: FUNCTION is_voice_group_moderator(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) TO authenticated;


