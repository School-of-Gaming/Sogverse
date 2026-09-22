--
-- Name: set_group_member_minecraft(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  -- Guard-first, in the shape the authorization spine reads: the role half
  -- admits an admin or a gedu and refuses everyone else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
  -- teach and for nobody else.
  --
  -- An admin passes this outright (00205). The admin group details page renders
  -- the gedu workspace's roster body — this editor included — for any group of
  -- any product, and an admin already holds the same edit on /admin/users/[id],
  -- so the group question was never a statement about them.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  )
  -- The substitution branch: the participant sits in a group the caller holds a live
  -- substitution on. Group-wide within the window, exactly as the assignment arm is
  -- product-wide within the assignment — a sub who is running the session is
  -- the person who has the child in front of them and can read the handle off
  -- their screen.
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

  -- Target must be a GAMER (00177). A Minecraft link is a child's; an adult
  -- seat carries no game account and the roster renders that slot empty by
  -- design, so a row keyed to a customer would be an orphan the admin twin
  -- already refuses to write. The scope check above does not care about the
  -- target's role, so this stands on its own — and it binds an admin too, being
  -- about the integrity of the row rather than about who is looking.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_minecraft_username, '')), '');
  -- Clearing the username clears the uuid with it: a uuid without a name is a
  -- verified link to nothing.
  v_uuid := CASE WHEN v_username IS NULL
                 THEN NULL
                 ELSE NULLIF(btrim(COALESCE(p_minecraft_uuid, '')), '')
            END;

  INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
  VALUES (p_participant_id, v_username, v_uuid)
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_username = EXCLUDED.minecraft_username,
        minecraft_uuid     = EXCLUDED.minecraft_uuid;

  RETURN jsonb_build_object(
    'participant_id',     p_participant_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;


--
-- Name: FUNCTION set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) IS 'Set a group member''s Minecraft username + resolved UUID, scoped to participants actively enrolled in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified. In practice this is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open since 00205 to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the group question as a second 42501 — the same shape the session writers took in 00200 and the group feed in 00204. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s roster body unchanged, inline editor included; an admin already holds this exact edit on /admin/users/[id], so the widening aligns two surfaces on one action rather than granting a power. An admin passes the group half outright and is exempt from nothing else: the target must still be a gamer (23514), and a customer or a gamer is still refused on the first statement. Since 00272 the group half also admits a LIVE SUBSTITUTION: the participant sits in a group the caller holds a substitution on, window open and certification intact. A sub running the session is the person with the child in front of them and is exactly who can read a handle off their screen.';


--
-- Name: FUNCTION set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) TO authenticated;
GRANT ALL ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) TO service_role;


