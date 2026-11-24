-- Staff "now" means a current assignment.
--
-- An assignment is a period, and an ended one stays in the table (owner's
-- rulings, 2026-11-23). Every reader that asks who staffs a group NOW — the
-- access gates behind the workspace, the roster edits and the site notes, the
-- voice room and its chat roster, the groups panel, the admin dashboard's
-- unstaffed groups, the product list's gedu filter and the family page's
-- gedus — read every row as current, so a gedu taken off a group kept all of
-- it. Each now reads only current periods (ended_at IS NULL). Nothing else in
-- any body changes; readers that place a past session in a period, and the
-- temporary seat an ended gedu keeps for their last sessions, are not here.

-- ---------------------------------------------------------------------------
-- product_list_facets
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.product_list_facets WITH (security_invoker='true') AS
 SELECT product_type,
    ( SELECT (count(*))::integer AS count
           FROM public.products p
          WHERE (p.product_type = t.product_type)) AS product_count,
    ARRAY( SELECT DISTINCT seat.gedu_id
           FROM (( SELECT a.gedu_id,
                    a.product_id
                   FROM public.gedu_group_assignments a
                  WHERE a.ended_at IS NULL
                UNION ALL
                 SELECT tr.gedu_id,
                    tr.product_id
                   FROM public.gedu_group_trainees tr) seat
             JOIN public.products p ON ((p.id = seat.product_id)))
          WHERE (p.product_type = t.product_type)
          ORDER BY seat.gedu_id) AS gedu_ids,
    ARRAY( SELECT DISTINCT s.weekday
           FROM (public.schedule_slots s
             JOIN public.products p ON ((p.id = s.product_id)))
          WHERE (p.product_type = t.product_type)
          ORDER BY s.weekday) AS weekdays,
    ARRAY( SELECT DISTINCT p.spoken_language_code
           FROM public.products p
          WHERE (p.product_type = t.product_type)
          ORDER BY p.spoken_language_code) AS spoken_language_codes,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'name_i18n', m.name_i18n, 'type', m.type) ORDER BY m.id) AS jsonb_agg
           FROM public.locations m
          WHERE ((m.type = 'municipality'::public.location_type) AND (m.id IN ( SELECT
                        CASE
                            WHEN (l.type = 'municipality'::public.location_type) THEN l.id
                            ELSE l.parent_id
                        END AS parent_id
                   FROM (public.products p
                     JOIN public.locations l ON ((l.id = p.location_id)))
                  WHERE (p.product_type = t.product_type))))), '[]'::jsonb) AS municipalities
   FROM unnest(enum_range(NULL::public.product_type)) t(product_type);

COMMENT ON COLUMN public.product_list_facets.gedu_ids IS 'The distinct gedus holding a standing seat now — a current assignment period or a trainee seat — on any group of any product of this type, ascending. Empty, never NULL.';

-- ---------------------------------------------------------------------------
-- gedu_teaches_group
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_teaches_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
     WHERE ga.group_id = p_group_id
       AND ga.gedu_id  = (SELECT auth.uid())
       AND ga.ended_at IS NULL
  )
  -- The substitution branch: a live, certified substitution on this group reaches everything
  -- the group's current gedus reach, for as long as their access window is
  -- open. Group-wide rather than per-date on purpose — the workspace, the
  -- roster, the notes and the report are all one surface, and a sub who may
  -- write the report has to be able to open the page it is written on. The two
  -- date-scoped exceptions (the voice room and the report MAIL) do not go
  -- through this predicate; see their own bodies.
  OR public.gedu_substitutes_group(p_group_id);
$$;

COMMENT ON FUNCTION public.gedu_teaches_group(p_group_id uuid) IS 'Internal predicate: may the caller act as staff on this group — holding a current assignment period on it (an ended one reaches nothing here), OR holding a live substitution on it (gedu_substitutes_group, which carries the certification test and the access window). The single gate behind the group workspace, the session notes and report, the register, the session photos and their delete check, and the group notes; gedu_teaches_gamer composes it too, which is why that predicate needed no edit of its own. NOT the gate behind the voice room or the family report mail — both of those are DATE-scoped and call gedu_substitutes_session directly, because a sub has no business in the group''s other sessions and the report mail is at-most-once with no resend. Not exposed to authenticated: it is called from inside the SECURITY DEFINER gedu RPCs.';

-- ---------------------------------------------------------------------------
-- gedu_teaches_group_product
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_teaches_group_product(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One join, because gedu_group_assignments carries product_id alongside
  -- group_id: "any group of this group's product" is a single-table EXISTS
  -- rather than a walk back through products.
  SELECT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.gedu_group_assignments a ON a.product_id = g.product_id
     WHERE g.id = p_group_id
       AND a.gedu_id = (SELECT auth.uid())
       AND a.ended_at IS NULL
  )
  -- The substitution branch is deliberately GROUP-ONLY, not product-wide. An
  -- assignment is a standing relationship with a product, which is what earns
  -- the cross-group mobility above; a substitution is one date on one group, and
  -- widening it to the product would hand a sub the member flair of every
  -- sibling group they were never asked to stand in for.
  OR public.gedu_substitutes_group(p_group_id);
$$;

COMMENT ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) IS 'Internal predicate: is the caller a gedu currently assigned to ANY group of this group''s product — a current period, an ended one counting for nothing? The same question gedu_teaches_group asks, widened from one group to the whole product — which is the cross-group mobility the member-flair RPCs need, because a substitute standing in for another group is exactly the person who needs the note. Gedu-only and composed with is_admin() at each call site, the dominant pattern in this schema. NOT exposed to authenticated: it is called from inside SECURITY DEFINER RPCs and from nowhere else — in particular from no RLS policy, which is what lets it stay private, since a policy predicate is evaluated as the querying role and would have forced a grant. is_voice_group_moderator computes the same thing with is_admin() folded in; it is deliberately left alone rather than reused or renamed, because the voice_zones and voice_private_zone_occupants policies reference it and its name would make a note read look like a voice concern. It additionally admits a LIVE SUBSTITUTION on the group, and the substitution arm is deliberately GROUP-only rather than product-wide: an assignment is a standing relationship with a product, which is what earns the cross-group mobility above, while a substitution is one date on one group, and widening it to the product would hand a sub the member flair of every sibling group they were never asked to stand in for.';

-- ---------------------------------------------------------------------------
-- is_voice_group_member
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_voice_group_member(p_group_id uuid) RETURNS boolean
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
        and a.ended_at is null
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
    )
    -- The trainee branch: a trainee is in THEIR OWN group's room, and in no
    -- other group of the product. Never a moderator — is_voice_group_moderator
    -- has no trainee arm — so in the chat a trainee reads inside the family
    -- time bound, like a gamer.
    or public.gedu_trains_group(p_group_id);
$$;

COMMENT ON FUNCTION public.is_voice_group_member(p_group_id uuid) IS 'Who may be in this group''s voice room, and therefore — through is_chat_channel_member — in its in-call chat: an admin, an active seat-holder of the group, a gedu currently assigned to ANY group of the group''s product (a current period — an ended one is not in the room), or a live substitution dated TODAY OR YESTERDAY in the product''s timezone. The substitution arm is the one thing on this surface that is date-scoped rather than group-wide, and it is the narrower of the two deliberate exceptions to "a sub sees everything the main gedu sees": a sub belongs in the room on the date they are substituting and on no other date of the group. "The session in question" is evaluated at CALL TIME because the predicate is handed a group and nothing else. The substitution arm ADDS to the assignment arm and narrows nothing — a gedu assigned to the product keeps the product-wide mobility they already had. Total boolean; consumed by the voice_zones and chat policies, which is why it is granted to `authenticated` despite being a predicate. YESTERDAY counts beside today because a session dated Monday that runs past local midnight is still Monday''s session at 00:30 on Tuesday, and a session starting at 00:10 has its whole pre-window on the day before; asking about today alone ejects the substitute from the room and the chat at midnight, and refuses them before a small-hours start. The access window inside gedu_substitutes_session applies to whichever date matches. A TRAINEE (gedu_trains_group) is a member of their own group''s room only — group-scoped where an assignment is product-wide — and never a moderator, so the chat''s family time bound applies to them.';

-- ---------------------------------------------------------------------------
-- is_voice_group_moderator
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_voice_group_moderator(p_group_id uuid) RETURNS boolean
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
        and a.ended_at is null
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

COMMENT ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) IS 'Who MODERATES this group''s voice room and its chat: an admin, a gedu currently assigned to any group of the group''s product (a current period), or a live substitution dated today or yesterday in the product''s timezone. A POSITIVE allow-list, never an exclusion — the room learned that the expensive way, a "not a gamer" test having been one parent-seat release away from handing moderation to parents. Date-scoped on its substitution arm exactly as is_voice_group_member is, and for the same reason: the two move together, because the chat channel is gated by the pair and a substitute must be in the channel on their own date only. Its substitution arm spans the same two local dates as is_voice_group_member''s, and always must: the chat channel is gated by the pair, so a cross-midnight session where one of them dropped the substitute would keep them in the room with no moderation, or in the chat with none.';

-- ---------------------------------------------------------------------------
-- chat_channel_roster_ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) RETURNS SETOF uuid
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
     AND ga.ended_at IS NULL
  UNION
  -- The channel's own group's trainees, who are in its room.
  SELECT t.gedu_id
    FROM public.chat_channels c
    JOIN public.gedu_group_trainees t ON t.group_id = c.group_id
   WHERE c.id = p_channel_id
  UNION
  SELECT m.sender_id
    FROM public.chat_messages m
   WHERE m.channel_id = p_channel_id;
$$;

COMMENT ON FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) IS 'Internal: the account ids a channel''s roster names — the group''s active seat-holders, the product''s currently assigned gedus (a gedu whose period ended stays only through a message of theirs), and everyone who has a message in the channel. The single definition behind both get_chat_channel_roster and the send/edit mention validation, so the picker can never offer a name the send would refuse. Not exposed to `authenticated`: it is called from inside the SECURITY DEFINER chat RPCs. The channel''s own group''s trainees are on it too, being members of its room.';

-- ---------------------------------------------------------------------------
-- set_group_member_minecraft
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
  -- the caller is currently assigned to. A gedu may fix a username for the people
  -- they teach and for nobody else.
  --
  -- An admin passes this outright. The admin group details page renders
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
       AND ga.ended_at IS NULL
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

  -- Target must be a GAMER. A Minecraft link is a child's; an adult
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

COMMENT ON FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) IS 'Set a group member''s Minecraft username + resolved UUID, scoped to participants actively enrolled in a group the calling gedu holds a current assignment period on. The Mojang lookup happens in the calling route, so a successful edit lands verified. In practice this is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open to an ADMIN as well as to the currently assigned gedu, guard-first on assert_role with the group question as a second 42501 — the same shape the session writers and the group feed take. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s roster body unchanged, inline editor included; an admin already holds this exact edit on /admin/users/[id], so admitting them here aligns two surfaces on one action rather than granting a power. An admin passes the group half outright and is exempt from nothing else: the target must be a gamer (23514), and a customer or a gamer is refused on the first statement. The group half also admits a LIVE SUBSTITUTION: the participant sits in a group the caller holds a substitution on, window open and certification intact. A sub running the session is the person with the child in front of them and is exactly who can read a handle off their screen.';

-- ---------------------------------------------------------------------------
-- set_group_member_roblox
-- ---------------------------------------------------------------------------

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
  -- the caller is currently assigned to. A gedu may fix a username for the people
  -- they teach and for nobody else. An admin passes it outright — see the
  -- Minecraft twin above for why.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
       AND ga.ended_at IS NULL
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

  -- Target must be a GAMER. A game account is a child's; an adult seat
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

COMMENT ON FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint) IS 'Set a group member''s Roblox username + resolved account id, scoped to participants actively enrolled in a group the calling gedu holds a current assignment period on. The Roblox twin of set_group_member_minecraft, and identical to it in every respect but the key''s type: Roblox''s id is an int64, so the account-id parameter is a DEFAULTed bigint rather than a text column carrying an '''' sentinel, and omitting it is how an unverified save is expressed. The Roblox lookup happens in the calling route (neither Roblox API is reachable from a browser), so an id arriving here was resolved server-side and its presence is the whole of "verified". Clearing the username clears the id with it. In practice the target is always a child: an adult seat carries no linked game account and the roster row shows that slot empty by design. Open to an ADMIN as well as to the currently assigned gedu, in the same shape as its Minecraft twin — the admin group details page renders one roster editor serving both platforms, so admitting one alone would ship a control that works on a Minecraft group and refuses on a Roblox one. An admin passes the group half outright and is exempt from nothing else. The group half also admits a LIVE SUBSTITUTION, in the same shape as its Minecraft twin, and for the same reason: one roster editor serves both platforms.';

-- ---------------------------------------------------------------------------
-- set_site_notes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_public_note text;
  v_gedu_note   text;
  v_address     text;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- "You run something at this building now" — the site-scoped analogue of the
  -- assignment check, read from current periods only, and the half an admin is
  -- exempt from.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND ga.ended_at IS NULL
       AND p.location_id  = p_location_id
       AND p.delivery_mode <> 'online'
  )
  -- The substitution branch, shaped like the assignment one above rather than borrowed
  -- from a group predicate: the question this function asks is about a BUILDING,
  -- so the substitution arm is "I hold a live substitution on some group of a product
  -- held at this site, in person or hybrid". The owner's rule is that a sub sees everything the
  -- main gedu sees, and a site note is low-risk enough not to earn a special
  -- case of its own.
  AND NOT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.products p2 ON p2.id = g.product_id
     WHERE p2.location_id = p_location_id
       AND p2.delivery_mode <> 'online'
       AND public.gedu_substitutes_group(g.id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, NULL, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    -- `address` is deliberately absent from this SET list: whatever an admin
    -- put there stays there.
    SET notes = EXCLUDED.notes
  RETURNING address INTO v_address;

  INSERT INTO public.site_staff_details (location_id, notes)
  VALUES (p_location_id, v_gedu_note)
  ON CONFLICT (location_id) DO UPDATE
    SET notes = EXCLUDED.notes;

  RETURN jsonb_build_object(
    'location_id', p_location_id,
    'address',     v_address,
    'public_note', v_public_note,
    'gedu_note',   v_gedu_note
  );
END;
$$;

COMMENT ON FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) IS 'Write a site''s shared family note and its gedu note. The venue ADDRESS is not a parameter and is never touched — it belongs to the location record and is an admin''s to edit through the location itself. Open to an ADMIN, or to a gedu who currently teaches on a product held at that site (a current assignment period) — in person or hybrid, the two delivery modes with a site, a hybrid product''s gedu included although they join it online. Last-write-wins on the notes, across products. A live SUBSTITUTION on any group of such a product passes the site half too. The arm is location-shaped like the assignment one beside it rather than borrowed from a group predicate, because the question this function asks is about a BUILDING. It is the owner''s "a sub sees everything the main gedu sees" applied to the lowest-risk write on the surface, which is one fewer special case than carving it out would be.';

-- ---------------------------------------------------------------------------
-- get_gedu_assigned_product
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  PERFORM public.assert_role('gedu');

  -- This RPC is the door to the whole workspace, so its gate and its "which
  -- group is mine" resolution are ONE question and are answered together. A
  -- substitution has no assignment row to resolve a group from, which is why the
  -- resolution had to be widened alongside the gate rather than only the gate.
  IF p_group_id IS NOT NULL THEN
    -- An explicit group: the substitution card's link carries one, so a gedu substituting
    -- a SIBLING group of a product they already teach lands in the right
    -- workspace instead of their own group's. It must belong to this product
    -- and be one the caller is currently assigned to or substitutes on —
    -- gedu_teaches_group is exactly that pair of questions.
    SELECT g.id
      INTO v_my_group_id
      FROM product_groups g
     WHERE g.id         = p_group_id
       AND g.product_id = p_product_id
       AND public.gedu_teaches_group(g.id);
  ELSE
    -- The caller's current period on this product; there is at most one.
    SELECT group_id
      INTO v_my_group_id
      FROM gedu_group_assignments
     WHERE product_id = p_product_id
       AND gedu_id    = v_caller_id
       AND ended_at IS NULL
     LIMIT 1;

    -- No current assignment on this product: a pure substitution. Resolve the substituted group,
    -- deterministically ordered so two live substitutions on one product answer the
    -- same way every call. (The card always sends p_group_id, so this arm is
    -- the fallback for a bare link rather than the normal path.)
    IF v_my_group_id IS NULL THEN
      SELECT g.id
        INTO v_my_group_id
        FROM product_groups g
       WHERE g.product_id = p_product_id
         AND public.gedu_substitutes_group(g.id)
       ORDER BY g.created_at, g.id
       LIMIT 1;
    END IF;
  END IF;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    -- Which game identity this product's surfaces are about, if any. The enum
    -- travels as its text value; the mapping from a topic to a platform is a
    -- client-side decision (minecraft_java -> Minecraft, roblox_studio ->
    -- Roblox, everything else -> no game identity), deliberately not encoded
    -- here: a topic gaining or losing a platform is a product decision, not a
    -- schema change.
    'topic',        p.topic,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'delivery_mode', p.delivery_mode,
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
    -- In shell parity with get_gedu_group_feed's, for the same reason the
    -- rosters are in parity: the page composes both documents.
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description,
                 'voice_join_instructions', pt.voice_join_instructions
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        -- Every active seat on the group, whoever holds it — named for the
        -- participant rather than for a gamer, because an adult parent can hold
        -- one and a gamer-shaped name would be a lie the badge repeats on screen.
        'participant_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        -- The group's staff now — current periods only — each with their
        -- assignment ROLE, primary or assistant. Every read that LISTS a
        -- group's staff carries it, because "who is on this group" and "in what
        -- capacity" are one answer, and the role is a pay CLASS rather than a
        -- figure.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'role',       ga.role
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
             AND ga.ended_at IS NULL
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'participant_id',     part.participant_id,
                         'first_name',         gmp.first_name,
                         'birth_year',         gprof.birth_year,
                         'birth_month',        gprof.birth_month,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'roblox_username',    rba.roblox_username,
                         'roblox_user_id',     rba.roblox_user_id,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused. The role check keeps it in
                         -- step with the feed: an id transposition yields NULL
                         -- rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
                                THEN gmp.email END,
                         -- The staff-only flair. Emitted for every roster row,
                         -- note or no note, stamp or no stamp. The
                         -- join stamp is a FACT and the clubs-only newcomer
                         -- rule is a PRESENTATION rule applied client-side, so
                         -- nothing here is nulled out by product type.
                         'group_joined_at',            part.group_joined_at,
                         'note',                       gn.note,
                         'note_updated_by_first_name', ned.first_name,
                         -- In parity with the feed's roster. Always an array,
                         -- never null.
                         'creations',                  COALESCE(gc.creations, '[]'::jsonb)
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
                -- Keyed on exactly (group_id, participant_id), so this cannot
                -- fan the row out; profiles.id behind it is a primary key.
                LEFT JOIN public.gamer_group_notes gn
                       ON gn.group_id       = part.group_id
                      AND gn.participant_id = part.participant_id
                LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
                -- Same key, same guarantee.
                LEFT JOIN public.gamer_group_creations gc
                       ON gc.group_id       = part.group_id
                      AND gc.participant_id = part.participant_id
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups,
    -- The plan to the caller's group's horizon and its final session, in parity with
    -- get_gedu_group_feed's, for the reason the shell and the roster are in
    -- parity: the page composes both documents.
    'planned_sessions', public.planned_sessions_document(
                          p_product_id, public.session_plan_horizon(p_product_id, v_my_group_id)
                        ),
    'final_session_date', public.group_final_session_date(v_my_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) IS 'One round trip for a gedu opening a product they have a seat on: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. The shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair. Each roster entry also carries the staff-only flair — group_joined_at, note and note_updated_by_first_name — emitted unconditionally, because the join stamp is a fact and the clubs-only newcomer rule is applied by the client. Each roster entry carries `creations` too (always an array, [] when there is no row) and the shell carries requires_gamer_creations, both in parity with get_gedu_group_feed for the same reason every other field is: the page composes both documents. THIS IS THE DOOR A SUBSTITUTION COMES THROUGH, and both halves of it are widened rather than only the gate: p_group_id is optional and, when given, must name a group of this product that the caller is currently assigned to or substitutes on — which is what lets a gedu substituting a SIBLING group of a product they already teach land in the right workspace instead of their own group''s. Without it the group of the caller''s current assignment period is resolved, and a caller with no current period on the product falls back to their substituted group, deterministically ordered. A caller with neither is refused with 42501. `gedus` lists each group''s staff now, current periods only, and each entry additionally carries the assignment `role`. The document also carries `planned_sessions`, read to the resolved group''s session_plan_horizon, and that group''s `final_session_date`, in parity with get_gedu_group_feed.';

-- ---------------------------------------------------------------------------
-- get_trainee_assigned_product
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_my_group_id uuid;
  v_timezone    text;
  v_today       date;
  v_product     jsonb;
  v_groups      jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The caller's trainee group on this product. There is at most one (the
  -- table is UNIQUE on gedu and product), so a named group only has to agree
  -- with it.
  SELECT t.group_id
    INTO v_my_group_id
    FROM public.gedu_group_trainees t
   WHERE t.product_id = p_product_id
     AND t.gedu_id    = (SELECT auth.uid())
     AND (p_group_id IS NULL OR t.group_id = p_group_id);

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'topic',                    p.topic,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'delivery_mode',            p.delivery_mode,
    'voice_room_mode',          p.voice_room_mode,
    'external_voice_url',       p.external_voice_url,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
             ))
        FROM public.product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  ), p.timezone
  INTO v_product, v_timezone
  FROM public.products p
  WHERE p.id = p_product_id;

  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- Every group of the product, ordered as get_gedu_assigned_product orders
  -- them. A sibling group is shown by name only, so the trainee can see it
  -- exists (its voice room, locked): its size, its staff and its members are
  -- nothing a gamer on this group is shown. The caller's own group carries the
  -- rest, and its roster is the trainee workspace document's, row for row.
  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT CASE WHEN pg.id <> v_my_group_id THEN
        jsonb_build_object(
          'id',          pg.id,
          'name',        pg.name,
          'created_at',  pg.created_at,
          'is_my_group', false
        )
      ELSE jsonb_build_object(
        'id',          pg.id,
        'name',        pg.name,
        'created_at',  pg.created_at,
        'is_my_group', true,
        'participant_count', (
          SELECT COUNT(*)::integer
            FROM public.participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         gp.id,
                   'first_name', gp.first_name,
                   'role',       ga.role
                 ) ORDER BY gp.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
             AND ga.ended_at IS NULL
        ), '[]'::jsonb),
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id',     part.participant_id,
                   'first_name',         gmp.first_name,
                   'signed_up_at',       part.signed_up_at,
                   'group_joined_at',    part.group_joined_at,
                   'age', CASE WHEN gprof.birth_year IS NOT NULL THEN
                            EXTRACT(YEAR FROM age(v_today::timestamp,
                                                  make_date(gprof.birth_year, gprof.birth_month, 1)::timestamp))::integer
                          END,
                   'gender',             gprof.gender,
                   'minecraft_username', mca.minecraft_username,
                   'minecraft_uuid',     mca.minecraft_uuid,
                   'roblox_username',    rba.roblox_username,
                   'roblox_user_id',     rba.roblox_user_id,
                   'has_note',           (gn.participant_id IS NOT NULL),
                   'creations',          '[]'::jsonb
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp                ON gmp.id        = part.participant_id
            LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
            LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
            LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = part.group_id
                  AND gn.participant_id = part.participant_id
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb)
      ) END AS g
        FROM public.product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups,
    -- As get_gedu_assigned_product carries them, for the trainee's own group.
    'planned_sessions', public.planned_sessions_document(
                          p_product_id, public.session_plan_horizon(p_product_id, v_my_group_id)
                        ),
    'final_session_date', public.group_final_session_date(v_my_group_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) IS 'The trainee''s door to a product: get_gedu_assigned_product''s document for a gedu holding a TRAINEE seat on it, refused with 42501 otherwise (gedu-only on its first statement). p_group_id is optional and, when given, must be the caller''s trainee group. The shell is the gedu one''s (topic included). `groups` holds every group of the product, ordered by created_at then id. A sibling group carries {id, name, created_at, is_my_group: false} and nothing else — its name is shown so the trainee can see it exists, but its size, staff and members are nothing a gamer on this group is shown. The caller''s own group carries is_my_group true, participant_count, `gedus` as {id, first_name, role} for its staff now (current periods only), and the same redacted roster get_trainee_group_feed serves: an integer `age` instead of the birth year and month, `has_note` instead of the note, `creations` always [], and no contact address. It also carries `planned_sessions`, read to the trainee group''s session_plan_horizon, and that group''s `final_session_date`, as get_gedu_assigned_product does.';

-- ---------------------------------------------------------------------------
-- get_admin_dashboard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_tasks jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The Gedu tasks: every educator with something open for an admin, once.
  --
  -- Two things put a Gedu here, and a Gedu holding both is still one entry,
  -- carrying both facts: an admin reads the section by person, and a person
  -- listed twice reads as two people.
  --
  --   * `certification`  — the Gedu is not certified yet. The object carries the
  --                        standings an admin certifies against, and is NULL
  --                        once the Gedu is certified, so a standing is never
  --                        shipped for a decision that is no longer open.
  --   * `team_profile_awaiting_review` — the Gedu's team profile is marked
  --                        ready (`opted_in`) and not yet public (`approved`).
  --                        The CHECK on team_profiles makes approved imply
  --                        opted_in, so this is the one state in which making
  --                        it public is an admin's to do. Only a Gedu's: an
  --                        admin's own profile is made public by admins who
  --                        already know it is there.
  --
  -- An INNER JOIN to gedu_profiles, deliberately. A gedu with no
  -- `gedu_profiles` row is a data error, and a LEFT JOIN would read that
  -- missing row as `certified = false` — offering a broken account a Certify
  -- whose write lands on the row that is not there. Missing means excluded.
  --
  -- `contract_accepted_at` is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version: a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` is when an admin recorded seeing this
  -- candidate's criminal record extract, or NULL if none has been recorded. The
  -- flag beside it is deliberately not shipped: the stamp is non-NULL exactly
  -- when the flag is true, so a second field could only ever contradict the
  -- first. It informs the decision on the same terms as the contract stamp and
  -- gates nothing either.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'certification', CASE WHEN gp.certified THEN NULL ELSE
                 jsonb_build_object(
                   'contract_accepted_at', (
                     SELECT min(ca.accepted_at)
                       FROM public.gedu_contract_acceptances ca
                      WHERE ca.gedu_id = pr.id
                        AND split_part(ca.contract_version, '/', 1) = (
                              SELECT split_part(v.version, '/', 1)
                                FROM public.gedu_contract_versions v
                               ORDER BY v.created_at DESC, v.version DESC
                               LIMIT 1
                            )
                   ),
                   'criminal_record_check_at', gp.criminal_record_check_at
                 )
               END,
               'team_profile_awaiting_review', COALESCE(tp.opted_in AND NOT tp.approved, false)
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_gedu_tasks
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
    LEFT JOIN public.team_profiles tp ON tp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND (gp.certified = false
          OR (tp.opted_in AND NOT tp.approved));

  -- ---------------------------------------------------------------------------
  -- 2. The attention queue: live products with at least one thing wrong.
  --
  -- Seven kinds of wrong, and each is stated as the fact rather than as a
  -- sentence — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `empty_groups_without_gedu` — a group with no educator AND no active
  --                           member. An admin pre-building next term's groups
  --                           has not made a mistake, which is why this is a
  --                           SEPARATE and LOWER-ranked kind rather than part
  --                           of the one above — but it is still a loose end
  --                           somebody has to come back to, so it is named
  --                           rather than carved out of the group check.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --   * `missing_invoice_customer` — municipality clubs only, on the same terms
  --                           as the fee beside it: the link is nullable because
  --                           a club is created before anybody has agreed who
  --                           pays for it, and by the time it starts both the
  --                           fee and the buyer are meant to be set. A club with
  --                           neither is one nobody can raise an invoice for, so
  --                           the omission belongs in the same queue as the fee's.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'empty_groups_without_gedu', eg.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them. Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL),
               'missing_invoice_customer',
                 (c.product_type = 'municipality_club'
                  AND c.invoice_customer_id IS NULL)
             ) AS doc
        FROM candidate c
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                               AND ga.ended_at IS NULL
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The same question asked of the OTHER half of the unstaffed groups:
        -- no educator, and nobody in it either. Deliberately a second
        -- lateral with an inverted membership test rather than a flag on the one
        -- above, because the page ranks the two differently and one wire fact per
        -- kind of wrong is what its ranking maps over. The EXISTS / NOT EXISTS
        -- pair is what makes the two arrays disjoint: no group can be in both,
        -- and a group somebody teaches now is in neither. Only a current period
        -- staffs a group: one whose gedus have all been taken off is unstaffed.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND NOT EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                               AND ga.ended_at IS NULL
                          )
                 ), '[]'::jsonb) AS items
        ) eg
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state". An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR jsonb_array_length(eg.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
          OR (c.product_type = 'municipality_club'
              AND c.invoice_customer_id IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 3. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  --
  -- The sessions themselves are `planned_sessions`: planned_group_sessions over
  -- the product's window, [window_start, window_end), as rows of
  -- {session_date, starts_at, ends_at, cancelled_group_ids}. Cancellation is per
  -- (group, date) and the schedule is per product, so each product also carries
  -- `group_ids`, every group the product has (not only groups some other fact
  -- mentions), and the page decides each date from the two: a date every group
  -- cancelled is a cancelled date; a date some cancelled still runs for the rest.
  -- Beside them ride the product's `holiday_breaks` over the same window, each
  -- with the sessions it withdrew; a planned date is never a holiday, so no
  -- cancellation above is on one.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*, w.window_start, w.window_end
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items,
               'group_ids',      gr.items,
               'planned_sessions', pl.items,
               'holiday_breaks', public.holiday_breaks_document(
                                   c.id, c.window_start, c.window_end - 1
                                 )
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
        -- The window's end is exclusive and the plan's span is inclusive.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'session_date',        planned.session_date,
                              'starts_at',           planned.starts_at,
                              'ends_at',             planned.ends_at,
                              'cancelled_group_ids', to_jsonb(planned.cancelled_group_ids)
                            )
                            ORDER BY planned.session_date, planned.starts_at
                          )
                     FROM public.planned_group_sessions(
                            c.id, c.window_start, c.window_end - 1
                          ) AS planned
                 ), '[]'::jsonb) AS items
        ) pl
    ) s;

  RETURN jsonb_build_object(
    'gedu_tasks',         v_gedu_tasks,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: the Gedu tasks (one entry per Gedu who is uncertified or whose team profile is marked ready and not yet public, never two entries for one Gedu), live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Each Gedu task carries certification, NULL once the Gedu is certified and otherwise the standings the decision is made against, and team_profile_awaiting_review, true while the Gedu''s team profile is marked ready (opted_in) and not yet public (approved); an admin''s own team profile is never listed. The certification standings are contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Beside it is criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. The waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. An unstaffed group with NO active member is named too, in its own empty_groups_without_gedu array beside groups_without_gedu, and can put a product in the queue by itself: an admin pre-building next term has not made a mistake, and that reasoning decides the item''s RANK on the page rather than hiding it. The two arrays are disjoint by construction and neither holds a group somebody is currently assigned to — a group whose every assignment period has ended is unstaffed. Both product sections ask effective_status() and nothing else: there is no stored status to pre-filter on, so the derived answer is the only lifecycle test either candidate set makes, and every date window is computed in the product''s own timezone. Each attention candidate also carries missing_invoice_customer — municipality clubs only, true when the club names no Fennoa invoice customer, and false everywhere else by construction because the CHECK forbids the column on any other product type. It puts a club in the queue on its own, exactly as the municipality fee beside it does: the link is nullable because a club is created before anybody has agreed who pays for it, and by the time it starts both the fee and the buyer are meant to be set, so a club still missing one is an admin omission rather than an ordinary state. The two are the bottom of the page''s ranking and sit together there, because both are a blank field on one form with one consequence — a month of invoices that cannot be written for that buyer. Each schedule product also carries group_ids, every group it has, and planned_sessions, planned_group_sessions over its window [product-local today - 30 days, + 4 months) as {session_date, starts_at, ends_at, cancelled_group_ids} rows, soonest first, so the page places each session at its start instant and can tell a date every group cancelled from one only some did, and holiday_breaks, holiday_breaks_document over the same window (each break of a calendar the product follows, with its name in every locale and the sessions it withdrew). Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

-- ---------------------------------------------------------------------------
-- get_product_groups_with_details
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        -- One pill per CURRENT period: the panel edits who is on the group now,
        -- and an ended period is history it has no control over. The
        -- assignment ROLE rides each pill, which is what the groups panel's
        -- role select reads and writes back through apply_group_changes. This
        -- panel is the permanent-assignment editor; the session-card staffing
        -- editor is a different tool and deliberately does not link to it.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email,
                     'role',       ga.role
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
             AND ga.ended_at IS NULL
        ), '[]'::jsonb),
        -- The group's trainee seats, which the panel places and removes
        -- through apply_group_changes. No role: a trainee is not paid.
        'trainees', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         tp.id,
                     'first_name', tp.first_name,
                     'email',      tp.email
                   )
                   ORDER BY t.created_at, tp.id
                 )
            FROM gedu_group_trainees t
            JOIN profiles tp ON tp.id = t.gedu_id
           WHERE t.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_birth_year',         gprof.birth_year,
                     'participant_birth_month',        gprof.birth_month,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition: money once arrived for
                     -- this seat.
                     'has_payment_marker',             EXISTS (SELECT 1 FROM public.bookings paid WHERE paid.id = p.booking_id AND paid.purchase_shape IN ('subscription_monthly', 'single_payment')),
                     -- The staff-only flair, identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — so these ride for shape parity across
                     -- the three roster readers, not for a reader of this one.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name,
                     -- The seat-offer stamps, identical in all three
                     -- arms for the same reason. NULL here and on the
                     -- unassigned arm by construction — the CHECK forbids an
                     -- offer stamp on anything but a waitlisted row — and read
                     -- for real only on the waitlist arm, where the card draws
                     -- the offer's standing. Whether an offer is LIVE is
                     -- derived from sent_at on the reader's side, against the
                     -- same five-day window this file states everywhere else.
                     'seat_offer_sent_at',             p.seat_offer_sent_at,
                     'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            -- Keyed on exactly (group_id, participant_id), so this cannot fan
            -- the row out; profiles.id behind it is a primary key.
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = p.group_id
                  AND gn.participant_id = p.participant_id
            LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_birth_year',         gprof.birth_year,
             'participant_birth_month',        gprof.birth_month,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             EXISTS (SELECT 1 FROM public.bookings paid WHERE paid.id = p.booking_id AND paid.purchase_shape IN ('subscription_monthly', 'single_payment')),
             -- Group-less by definition, so the join matches nothing and all
             -- three come back NULL. That is the truth rather than a gap: a
             -- seat in no group is new to nothing and has no note filed under
             -- any group. Keeping the expression identical is what keeps this
             -- arm the same shape as the other two.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             -- NULL here too, and by a constraint rather than by a join that
             -- misses: an ACTIVE seat cannot carry an offer stamp at all.
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here, not the constant FALSE that
  -- "demote_to_waitlist refuses a subscribed row, so this cannot exist" would
  -- allow. It can exist: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the seat's booking in place, so a family
  -- that paid and was later demoted still has a paid shape here, where one that
  -- only ever queued has none.
  --
  -- The two seat-offer stamps are the same story one step further on:
  -- this is the ONLY arm where either can be non-NULL, and the waitlist card is
  -- the only reader of them. They ride on the other two arms for shape parity.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_birth_year',         gprof.birth_year,
             'participant_birth_month',        gprof.birth_month,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             EXISTS (SELECT 1 FROM public.bookings paid WHERE paid.id = p.booking_id AND paid.purchase_shape IN ('subscription_monthly', 'single_payment')),
             -- A waitlisted seat holds no group either, so these are NULL for
             -- the same reason as the arm above. The note RPC does admit a
             -- waitlisted TARGET — a note about somebody queueing for the group
             -- is coherent — but such a row is reached through the group's own
             -- roster, not through this arm.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS 'Admin-gated snapshot behind the product Groups panel: groups with their current gedus (one per current assignment period; an ended period is not shown) and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (whether the seat''s booking is a paid shape — money once arrived for this seat, which demotion does not clear, and which a waitlist join''s booking, having no shape, does not claim). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. The person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead. Each chip also carries participant_roblox_username/participant_roblox_user_id beside the Minecraft pair, so the panel can show whichever identity the product''s topic is about; the topic itself is NOT emitted here, because the page already holds the product row. All three branches also carry the staff-only flair — group_joined_at, note and note_updated_by_first_name — from one identical LEFT JOIN, which comes back NULL on the two group-less branches because that is the truth and because one expression is what keeps the three shapes one shape. The groups panel draws neither mark, and no admin surface reads either of them from THIS document — the group details page renders both and reads them off get_gedu_group_feed, the copy a note write invalidates — so all three fields ride here for shape parity across the three roster readers rather than for a reader of this one. All three branches also carry seat_offer_sent_at and seat_offer_expiry_notified_at, on exactly the same terms: only the WAITLIST branch can hold a non-NULL value (a CHECK forbids an offer stamp on any other status) and only the waitlist card reads them, but the expression is identical in all three so the shape stays one shape. Whether an offer is LIVE is derived on the reader''s side from sent_at plus the five-day window. Each entry of a group''s `gedus` carries the assignment `role` — primary or assistant — which is what the panel''s per-pill role select reads and writes back through apply_group_changes. This panel is the PERMANENT assignment editor; the session card''s staffing editor is a different tool, and nothing links the two, deliberately. Each group also carries `trainees`, its trainee seats as {id, first_name, email} in placement order, which the panel places and removes through apply_group_changes.';

-- ---------------------------------------------------------------------------
-- get_my_family_product_feed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_participant    jsonb;
  v_product        jsonb;
  v_group          jsonb;
  v_site           jsonb;
  v_gedus          jsonb;
  v_sessions       jsonb;
  v_creations      jsonb;
  v_cancellations  jsonb;
  v_paid_through   date;
  v_start_date     date;
  v_horizon        date;
  v_status         public.participation_status;
  v_ended_at       timestamptz;
  v_access_end     timestamptz;
  v_planned        jsonb;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, where a NULL uid
  -- would disappear into a larger boolean expression instead of refusing.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT part.participant_id, part.group_id, part.product_id, part.status, part.ended_at
    INTO v_participant_id, v_group_id, v_product_id, v_status, v_ended_at
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  --
  -- The first arm is also what admits a PARENT'S OWN SEAT with no change: the
  -- participant is the caller, so it matches directly and the parent-link
  -- fallback is never reached.
  --
  -- `IS NOT DISTINCT FROM`, not `=`: the equality form is only safe here
  -- because of the guard above, and a predicate whose correctness depends on a
  -- check twenty lines away is one edit away from being wrong again. This form
  -- is false — never NULL — for every input, so the IF cannot be skipped.
  IF v_participant_id IS NULL
     OR NOT (v_participant_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_participant_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. `no_data_found` is P0002, which PostgREST
  -- maps to a 404; the refusals above are 42501, which it maps to a 403.
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Participation % is not placed in a group', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- An ended seat keeps its page as far as the seat went: up to the instant it
  -- ended, and no further (owner ruling, 2026-11-03: reports up to the day they
  -- left). Not raised to a subscription's paid-through date: a seat Stripe
  -- cancels ends at its period end anyway, and an admin's removal is immediate,
  -- so its page must not go on listing sessions the child no longer attends.
  -- NULL on a seat that has not ended, which leaves every list below as it was.
  IF v_status = 'ended' THEN
    v_access_end := v_ended_at;
  END IF;

  -- Whoever holds the seat. The page is participant-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child, or the caller themselves — the
  -- ownership check above is what makes that true.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_participant
  FROM public.profiles pr WHERE pr.id = v_participant_id;

  -- The product shell. Names live in product_translations, not on `products`,
  -- so the translations array IS the name. `material_url` lives on
  -- product_staff_details and this query does not join it. The requirement flag
  -- is not selected either, and its absence here is the enforcement: it
  -- is staff-facing, and a family sees nothing different on a flagged product.
  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'delivery_mode', p.delivery_mode,
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = v_product_id;

  -- The group's family-facing half. `gedu_note` is not selected, and its
  -- absence here is the enforcement — not a filter somewhere downstream. The id
  -- travels because the voice-room href and the feed's entry keys are built
  -- from it.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = v_group_id;

  -- The venue, in-person and hybrid products — same test as the gedu feed, and for
  -- the same reason: an online municipality club carries a location_id (a
  -- municipality, by CHECK), so "has a location" would put an address on a club
  -- with no building. site_staff_details is not joined at all.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.delivery_mode <> 'online';

  -- Who teaches this group now — current periods only — by first name.
  -- Nothing else about them: not the surname, not the email, not the
  -- verification state. A family is being told who they are with, which is a
  -- first name's worth of information.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = v_group_id
         AND ga.ended_at IS NULL
    ) AS gedu_rows;

  -- THIS participant's creations in THIS group, and nobody else's. A
  -- flat array on the document rather than a map keyed by participant, so
  -- another child's work has nowhere to live here BY TYPE — the same move
  -- `attendance` makes below, where the gedu feed carries a map and this
  -- document carries one answer. Empty array when there is no row, so the card
  -- renders on "is this empty" and never on "is this null".
  SELECT COALESCE(
           (SELECT c.creations
              FROM public.gamer_group_creations c
             WHERE c.group_id       = v_group_id
               AND c.participant_id = v_participant_id),
           '[]'::jsonb
         )
    INTO v_creations;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. There is deliberately no window here: what is stored is
  -- what travels.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
  --
  -- The two `updated_by*` keys ride on every session, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` has the same shape as the gedu and admin documents' —
  -- {id, width, height}, ordered by (created_at, id) — because one shared
  -- gallery component renders them all. The uploader does not travel: it is
  -- safeguarding audit, and a family surface is the last place for it.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'updated_by',   s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', (
          SELECT a.status
            FROM public.session_attendance a
           WHERE a.session_id = s.id
             AND a.participant_id   = v_participant_id
        )
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = v_group_id
         -- Cancellation: a record kept under a cancellation does not travel. A
         -- family is told the session is off, and a report on it would say
         -- otherwise; a restore brings the row back here as it was.
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
         -- An ended seat: nothing that started after its access ended.
         AND (v_access_end IS NULL OR s.starts_at < v_access_end)
    ) AS session_rows;

  -- Cancellation: the group's cancelled sessions in effect, newest first, as a
  -- date and NOTHING ELSE. The reason and who cancelled are admin-only; a
  -- family is told the session is off, not why. One kept over a record the
  -- schedule no longer projects travels too, and the record beside it does
  -- not (above): the family has no instants to draw it at, so the date
  -- simply stops being shown rather than showing the report. One on a holiday
  -- is not listed: that date carries its break and nothing else, and the
  -- cancellation is listed again if the break goes.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('session_date', sc.session_date)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = v_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
     AND (v_access_end IS NULL
          OR sc.session_date <= (v_access_end AT TIME ZONE (
               SELECT p.timezone FROM public.products p WHERE p.id = v_product_id
             ))::date);

  -- The product-local date a cancelled membership is paid through: the
  -- `canceling` subscription's current_period_end, the instant the family's
  -- access ends, which the page also reads (as its access-until) to clamp the
  -- list. NULL on anything else, which leaves the horizon as it is.
  SELECT (fs.current_period_end AT TIME ZONE p.timezone)::date
    INTO v_paid_through
    FROM public.family_subscriptions fs
    JOIN public.products p ON p.id = v_product_id
   WHERE fs.participation_id = p_participation_id
     AND fs.status = 'canceling';

  -- An ended seat's access stops at the product-local date it ended.
  IF v_access_end IS NOT NULL THEN
    SELECT (v_access_end AT TIME ZONE p.timezone)::date
      INTO v_paid_through
      FROM public.products p WHERE p.id = v_product_id;
  END IF;

  -- The plan's span, which the holiday breaks share: the product's start to
  -- its horizon for THIS group, raised to the paid-through date.
  SELECT p.start_date INTO v_start_date
    FROM public.products p WHERE p.id = v_product_id;
  v_horizon := public.session_plan_horizon(v_product_id, v_group_id, v_paid_through);
  -- For an ended seat the paid-through date is a ceiling as well as a floor:
  -- the plan stops where the seat's access did.
  IF v_access_end IS NOT NULL THEN
    v_horizon := LEAST(v_horizon, v_paid_through);
  END IF;

  v_planned := public.planned_sessions_document(v_product_id, v_horizon);
  -- The horizon is a date, and an ended seat's access ended at an instant: a
  -- session later on the day it ended is not the family's to join. The plan
  -- keeps only what started before that instant, in its own order.
  IF v_access_end IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(planned.entry ORDER BY planned.ord), '[]'::jsonb)
      INTO v_planned
      FROM jsonb_array_elements(v_planned) WITH ORDINALITY AS planned(entry, ord)
     WHERE (planned.entry->>'starts_at')::timestamptz < v_access_end;
  END IF;

  RETURN jsonb_build_object(
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'creations',   v_creations,
    'sessions',    v_sessions,
    'cancellations', v_cancellations,
    -- The plan from the product's start to its horizon for THIS group — the
    -- eighth session that has not ended and that the group has not cancelled,
    -- on an open-ended product — raised to the paid-through date, so a cancelled membership's
    -- plan reaches the last session the family may still attend. Plain plan
    -- rows; the cancellations above are laid over them by date. An ended
    -- seat's plan stops at the instant the seat ended.
    'planned_sessions', v_planned,
    -- The holiday breaks over the same span, each with the sessions it
    -- withdrew from the plan above.
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon)
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS 'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person and hybrid products, the first names of the gedus teaching the group now (current assignment periods only), the group''s full stored session history with reports and PHOTOS, the named participant''s own attendance marks, and that participant''s own creations. Each session carries updated_by and the last editor''s first name — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Each session also carries `images`: {id, width, height} per photo, ordered by (created_at, id), the same shape the gedu and admin documents carry because one shared gallery renders all three, and never the uploader, which is safeguarding audit. That key rides on this strict family document under no versioned twin of its own, on the severity paragraph in docs/plans/CLAUDE.md: transient read-side breakage inside a release window is accepted. `creations` is a TOP-LEVEL array of {title, url} — this participant''s own, in this group, and structurally incapable of holding anybody else''s because it is not a map keyed by participant. It is the one staff-authored family-facing field that carries links, an owner-approved exception to the link-free rule session reports follow, and the render side parses each URL and degrades to the title as plain text when it is not http(s). Empty array when there is nothing, so the card renders on emptiness and never on null. `planned_sessions` is the product''s plan from start_date to session_plan_horizon for this group (planned_sessions_document), raised to the product-local date a `canceling` subscription''s current_period_end falls on — the paid-through instant the page clamps the list at — as plain {session_date, starts_at, ends_at} rows; the cancellations stay their own list, and leave out any on a holiday date. `holiday_breaks` is holiday_breaks_document over the same span: each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew. An ENDED seat keeps its page: its stored sessions stop at those starting before its ended_at — never raised to a subscription''s current_period_end — its cancellations stop at that instant''s product-local date, and its plan at the instant itself — a session later on the day it ended is not listed — cut there rather than raised to a current_period_end. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page and answers P0002; a row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. Carries no gedu note of any scope, no roster, no other participant''s marks or creations, no parent email, no material link, no requires_gamer_creations flag and no owed/completeness state.';

