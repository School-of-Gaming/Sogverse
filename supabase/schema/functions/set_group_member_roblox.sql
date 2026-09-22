--
-- Name: set_group_member_roblox(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_user_id  bigint;
BEGIN
  -- Guard-first, in the shape the authorization spine reads: the role half
  -- admits an admin or a gedu and refuses everyone else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
  -- teach and for nobody else. An admin passes it outright (00205) — see the
  -- Minecraft twin above for why.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  )
  -- The substitution branch, byte for byte the Minecraft twin's — one roster editor
  -- serves both platforms, so widening one alone would ship a control that
  -- saves on a Minecraft group and refuses on a Roblox one.
  AND NOT EXISTS (
    SELECT 1
      FROM public.participations part2
     WHERE part2.participant_id = p_participant_id
       AND part2.status = 'active'::public.participation_status
       AND part2.group_id IS NOT NULL
       AND public.gedu_substitutes_group(part2.group_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Target must be a GAMER (00177). A game account is a child's; an adult seat
  -- carries none and the roster renders that slot empty by design, so a row
  -- keyed to a customer would be an orphan the admin twin already refuses to
  -- write. The scope check above does not care about the target's role, so this
  -- stands on its own — and it binds an admin too.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_roblox_username, '')), '');
  -- Clearing the username clears the account id with it: an id without a name
  -- is a verified link to nothing. An omitted (or NULL) id alongside a name is
  -- the UNVERIFIED save — the calling route stores the name it was sent and
  -- takes the id only from its own server-side lookup, so a name Roblox could
  -- not resolve lands here with nothing beside it.
  v_user_id := CASE WHEN v_username IS NULL
                    THEN NULL
                    ELSE p_roblox_user_id
               END;

  INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
  VALUES (p_participant_id, v_username, v_user_id)
  ON CONFLICT (user_id) DO UPDATE
    SET roblox_username = EXCLUDED.roblox_username,
        roblox_user_id  = EXCLUDED.roblox_user_id;

  RETURN jsonb_build_object(
    'participant_id',  p_participant_id,
    'roblox_username', v_username,
    'roblox_user_id',  v_user_id
  );
END;
$$;


--
-- Name: FUNCTION set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) IS 'Set a group member''s Roblox username + resolved account id, scoped to participants actively enrolled in a group the calling gedu teaches. The Roblox twin of set_group_member_minecraft, and identical to it in every respect but the key''s type: Roblox''s id is an int64, so the account-id parameter is a DEFAULTed bigint rather than a text column carrying an '''' sentinel, and omitting it is how an unverified save is expressed. The Roblox lookup happens in the calling route (neither Roblox API is reachable from a browser), so an id arriving here was resolved server-side and its presence is the whole of "verified". Clearing the username clears the id with it. In practice the target is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open since 00205 to an ADMIN as well as to the assigned gedu, in the same change and the same shape as its Minecraft twin — the admin group details page renders one roster editor serving both platforms, so widening one alone would have shipped a control that works on a Minecraft group and refuses on a Roblox one. An admin passes the group half outright and is exempt from nothing else. Since 00272 the group half also admits a LIVE SUBSTITUTION, in the same change and the same shape as its Minecraft twin — one roster editor serves both platforms, so widening one alone would ship a control that saves on a Minecraft group and refuses on a Roblox one.';


--
-- Name: FUNCTION set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) TO service_role;


