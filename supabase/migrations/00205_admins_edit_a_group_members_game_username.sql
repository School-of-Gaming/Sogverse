-- Admins edit a group member's game username, because it is the same editor.
--
-- WHY
--
-- The admin product page's per-group GROUP DETAILS page (00204) renders the
-- gedu group workspace's page body unchanged — roster included, and the roster
-- carries an inline game-username editor. A surface that draws the control has
-- to serve the action behind it: as it stands an admin sees the pencil, presses
-- save, and is refused by `assert_role('gedu')` on the first statement of these
-- two functions. That is a control that lies about what it does, which is worse
-- than no control at all.
--
-- **This grants an admin nothing they did not already hold.** The same edit is
-- theirs on `/admin/users/[id]`, through the admin twin writers, on any user in
-- the system and with no group involved at all. So the widening aligns two
-- surfaces on one action rather than opening a new one — the narrow reading of
-- "the admins see what the Gedus see", which is what the owner ruled.
--
-- THE SHAPE OF THE WIDENED GATE
--
-- Identical to 00200's five session writers, 00203's two member-flair RPCs and
-- 00204's group feed, and for the same mechanical reason: the authorization
-- spine requires the FIRST executable statement of every plpgsql function
-- reachable by `authenticated` to be a schema-qualified guard call, and it greps
-- the stored source for exactly that. So the branch moves inside the guard's
-- argument rather than around the guard:
--
--     PERFORM public.assert_role(
--       CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
--     );
--
-- A caller who is neither role is refused with the same 42501, on the same first
-- statement, as before. The SECOND question — "and is this child in a group you
-- are assigned to" — is then skipped for an admin and unchanged for a gedu, and
-- that is the whole of the privilege being granted.
--
-- WHAT AN ADMIN IS DELIBERATELY NOT EXEMPT FROM
--
-- The target-role check (00177). A game account belongs to a CHILD: an adult
-- seat carries none and the roster renders that slot empty by design, so a row
-- keyed to a customer would be an orphan that the admin twin writers already
-- refuse. That rule is about the integrity of the row, not about who is looking,
-- so it binds an admin exactly as it binds a gedu and still answers 23514.
--
-- Nor is anything relaxed on the family half: a customer and a gamer are refused
-- on the first statement, as they always were.
--
-- WHY THE BODIES ARE COPIED FROM `supabase/schema.sql`
--
-- The standing rule, and here it applies straightforwardly. Neither function has
-- been touched since `00195`, which is merged, so `schema.sql` is the current
-- truth for both — unlike `get_gedu_group_feed` in 00204, whose body had to be
-- retyped from this branch's own unmerged 00203. Everything else is carried
-- forward verbatim: the `SET search_path TO ''` headers, both EXECUTE grants
-- each, the REVOKE FROM PUBLIC, and the comments, which gain a sentence about
-- the widened audience and lose nothing.

-- ---------------------------------------------------------------------------
-- Minecraft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
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

COMMENT ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) IS 'Set a group member''s Minecraft username + resolved UUID, scoped to participants actively enrolled in a group the calling gedu teaches. The Mojang lookup happens in the calling route, so a successful edit lands verified. In practice this is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open since 00205 to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the group question as a second 42501 — the same shape the session writers took in 00200 and the group feed in 00204. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s roster body unchanged, inline editor included; an admin already holds this exact edit on /admin/users/[id], so the widening aligns two surfaces on one action rather than granting a power. An admin passes the group half outright and is exempt from nothing else: the target must still be a gamer (23514), and a customer or a gamer is still refused on the first statement.';

-- Carried forward and re-asserted below. The REVOKE is load-bearing on a
-- recreate: a replaced function comes back PUBLIC-executable.
REVOKE EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Roblox
-- ---------------------------------------------------------------------------
--
-- The twin (00195). Same guard, same scope check, same target-role check, and
-- widened in the same change on purpose: the editor the admin page renders is
-- one component serving both platforms, so widening one alone would ship a
-- control that saves on a Minecraft group and 403s on a Roblox one.

CREATE OR REPLACE FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint DEFAULT NULL::bigint) RETURNS jsonb
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

COMMENT ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) IS 'Set a group member''s Roblox username + resolved account id, scoped to participants actively enrolled in a group the calling gedu teaches. The Roblox twin of set_group_member_minecraft, and identical to it in every respect but the key''s type: Roblox''s id is an int64, so the account-id parameter is a DEFAULTed bigint rather than a text column carrying an '''' sentinel, and omitting it is how an unverified save is expressed. The Roblox lookup happens in the calling route (neither Roblox API is reachable from a browser), so an id arriving here was resolved server-side and its presence is the whole of "verified". Clearing the username clears the id with it. In practice the target is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open since 00205 to an ADMIN as well as to the assigned gedu, in the same change and the same shape as its Minecraft twin — the admin group details page renders one roster editor serving both platforms, so widening one alone would have shipped a control that works on a Minecraft group and refuses on a Roblox one. An admin passes the group half outright and is exempt from nothing else.';

REVOKE EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so
-- a silent no-op — an already-claimed version number, a grant that did not take,
-- a section lost while retyping a body — fails here rather than three weeks
-- later as a save button that refuses one role. Apply-time protection: it says
-- what was true when this migration ran, and nothing about later ones.

DO $assert$
DECLARE
  v_src  text;
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['set_group_member_minecraft', 'set_group_member_roblox']
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% does not exist', v_name;
    END IF;

    -- --- (a) The role guard is the widened CASE, and the old one is gone. ---
    --
    -- Both halves are asserted. The presence check alone would pass on a body
    -- that grew the CASE somewhere below an unchanged assert_role('gedu') first
    -- statement — which would refuse every admin while looking, to a grep, like
    -- this migration had landed.
    IF position('CASE WHEN public.is_admin() THEN ''admin'' ELSE ''gedu'' END' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not guard on the gedu-or-admin CASE — the admin group details page renders this editor and its save would be refused', v_name;
    END IF;

    IF position('PERFORM public.assert_role(''gedu'')' IN v_src) <> 0 THEN
      RAISE EXCEPTION '% still carries the gedu-only assert_role guard — the widened CASE has to REPLACE it, not sit beside it', v_name;
    END IF;

    -- --- (b) The ownership half survived, and an admin is let through it. ---
    --
    -- `NOT public.is_admin()` appears in exactly one place in each body: the
    -- ownership check. The CASE above spells it without the NOT, so this
    -- position is unambiguous and can be ordered against the guard.
    IF position('NOT public.is_admin()' IN v_src) = 0
       OR position('public.gedu_group_assignments' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost its group-assignment check, or does not compose it under NOT public.is_admin() — the role guard alone admits every gedu on the platform', v_name;
    END IF;

    -- Guard-first, in the shape the authorization spine reads.
    IF position('PERFORM public.assert_role(' IN v_src)
       > position('NOT public.is_admin()' IN v_src) THEN
      RAISE EXCEPTION '% checks the group before its role guard — the guard must be the first statement', v_name;
    END IF;

    -- --- (c) The target-role check is NOT relaxed for an admin. ------------
    --
    -- It sits outside the `NOT public.is_admin()` branch on purpose: a game
    -- account belongs to a child, and that is a rule about the row rather than
    -- about the caller. Asserting its 23514 spelling is what catches it being
    -- folded into the admin exemption while retyping.
    IF position('check_violation' IN v_src) = 0
       OR position('is not a gamer' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost its target-must-be-a-gamer check — an adult seat would take a game-account row the admin twin writers refuse', v_name;
    END IF;

    -- --- (d) The body was retyped in full and lost nothing. ----------------
    IF position('ON CONFLICT (user_id) DO UPDATE' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost its upsert while being retyped', v_name;
    END IF;
  END LOOP;

  -- --- (e) The grants came back exactly as they went in. -------------------
  IF NOT has_function_privilege('authenticated', 'public.set_group_member_minecraft(uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.set_group_member_minecraft(uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_group_member_roblox(uuid, text, bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.set_group_member_roblox(uuid, text, bigint)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a widened game-username writer lost an EXECUTE grant during recreation';
  END IF;

  IF has_function_privilege('anon', 'public.set_group_member_minecraft(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_group_member_roblox(uuid, text, bigint)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a widened game-username writer is executable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
