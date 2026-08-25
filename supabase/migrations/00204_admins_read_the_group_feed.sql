-- Admins read the group feed, because it is the same page.
--
-- WHY
--
-- The admin product page is gaining a per-group GROUP DETAILS page, and it does
-- not get a layout of its own: it renders the gedu group workspace's page body,
-- unchanged. Two surfaces built from one body only stay one surface if they are
-- fed by one document — the moment an admin-shaped RPC is written to feed the
-- admin copy, the two documents start drifting field by field, and the drift
-- reads downstream as a panel that is empty on one surface and populated on the
-- other rather than as an error. So `get_gedu_group_feed` gains an admin
-- caller, and nothing else about it moves.
--
-- This is the same widening `00200` made to the five session writers and `00203`
-- made to the two member-flair RPCs, and it takes the identical shape: one
-- `assert_role` call naming whichever of the two roles the caller holds, then an
-- ownership question the admin passes outright. What an admin skips is only the
-- SECOND question — "and do you teach this group" — which is a statement about
-- staff reach over one product and has never been a statement about an admin.
--
-- The negative half is unchanged and is the half that matters: a customer and a
-- gamer are still refused on the first statement, so this document — which
-- carries the gedu-only material link, the group's staff note, the site's staff
-- note and every member's staff note — remains unreachable to a family.
--
-- WHY THE BODY IS COPIED FROM `00203` AND NOT FROM `supabase/schema.sql`
--
-- The standing rule is to copy an object's body from `schema.sql`, because a
-- migration that first defined a function may already have been superseded.
-- That rule inverts here, and deliberately. `schema.sql` is built by CI from the
-- migrations merged to `dev`, and `00203` — which recreated this function to add
-- the three member-flair fields — has not merged. So `schema.sql` still
-- describes the PRE-`00203` definition, and copying from it would silently
-- revert the roster flair this branch just added. `00203`'s copy is the current
-- truth for this one object, and it is what the body below was retyped from.
--
-- Everything else is carried forward verbatim: the body, the `SET search_path TO
-- ''` header, both EXECUTE grants, the REVOKE FROM PUBLIC, and the comment,
-- which gains a sentence about the widened audience and loses nothing.

CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
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
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel (00203): the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair (00203), in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  --
  -- Two reserved booleans were emitted here until 00151, purely so the document
  -- mirrored the table. 00151 dropped the columns; nothing replaces them. Their
  -- names are deliberately not repeated in this body — the end-state assertion
  -- at the foot of that migration greps this source for them.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been (00197). The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- 00194's field, carried through verbatim — see this migration's
        -- header. Nothing here reads it; it is the current definition of this
        -- function on the database this file is pushed to, and recreating a
        -- function preserves what it is not deliberately changing.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.participant_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math. Open since 00204 to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is still shown only their OWN group''s feed, and a customer or a gamer is still refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult), carries both game identities since 00195 (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Since 00203 each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Each session row carries report_emailed_at since 00197 — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere.';

-- Carried forward and re-asserted below. The REVOKE is load-bearing on a
-- recreate: a replaced function comes back PUBLIC-executable.
REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Two consequences of 00203, reviewed and ACCEPTED by the owner — written into
-- the comments so the next person who meets either behaviour finds a decision,
-- not a gap. Each comment is 00203's text plus one new paragraph; COMMENT ON
-- replaces wholesale, so both are re-issued in full.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.participations.group_joined_at IS
  'When this seat entered its CURRENT group. NULL when the seat holds no group, '
  'and NULL for every row that predates the column — there was deliberately no '
  'backfill, because a group move leaves no trace and signed_up_at is not a '
  'join date for anyone who has ever been moved. A move between two groups of '
  'one product RESETS it: the member is new to THAT group, which is the whole '
  'claim the newcomer badge makes. Stamped only by '
  'trg_participations_stamp_group_joined_at, which is the column''s only '
  'writer — no RPC and no policy-driven UPDATE sets it, because group_id has at '
  'least five writers (including the ON DELETE SET NULL cascade from '
  'product_groups) and a trigger is the only point that sees all of them. '
  'A consequence with no undo, accepted for v1: an accidental move on the admin '
  'drag board, corrected with a second move back, re-stamps both times — the '
  'member reads as new to a group they never really left, for the length of the '
  'badge window, and no UI clears the stamp. The mislabel is rare, bounded at '
  '30 days, and its harm is a Gedu welcoming someone they already know; a '
  'per-member clear affordance is the known follow-up if it starts to matter.';

COMMENT ON TABLE public.gamer_group_notes IS
  'One row per (group, member): what the staff running that group need to know '
  'about that person before the session starts. Plain text, not markdown — a '
  'note is read in the box it was typed in, and offering headings would invite '
  'composing a document rather than jotting. Strictly keyed to the group, so a '
  'note does NOT follow a member who is moved: it is about how THIS group is '
  'going, and half of them would be stale or actively misleading in the next '
  'one. A member who leaves the group leaves their row behind, unreachable from '
  'every surface (all of them render the group''s active roster) and refused by '
  'the write RPC''s target check — an ACCEPTED leftover, not an oversight, and '
  'deliberately not cleaned up. Deleting the GROUP does delete the note, by FK. '
  'No Data API role holds a grant on this table and RLS is on with no policy at '
  'all: every read rides a roster document or get_group_staff_overlay, every '
  'write goes through set_gamer_group_note, and all of those are SECURITY '
  'DEFINER. Absence of a row is what "no note" means everywhere. One further '
  'consequence of the retention, also reviewed and accepted: a member who '
  'leaves and later RETURNS to the group silently regains their old row, and '
  'every surface presents it as current — the note dialog names its writer but '
  'not its date. Dating the edit line is the known follow-up if months-old '
  'guidance resurfacing this way ever misleads in practice.';

-- ---------------------------------------------------------------------------
-- End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so
-- a silent no-op — an already-claimed version number, a grant that did not take,
-- a section lost while retyping a 200-line body — fails here rather than three
-- weeks later as an empty panel. Apply-time protection: it says what was true
-- when this migration ran, and nothing about later ones.

DO $assert$
DECLARE
  v_src text;
  v_n   integer;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_gedu_group_feed does not exist';
  END IF;

  -- --- (a) The role guard is the widened CASE, and the old one is gone. -----
  --
  -- Both halves are asserted. The presence check alone would pass on a body
  -- that grew the CASE somewhere below an unchanged assert_role('gedu') first
  -- statement — which would refuse every admin while looking, to a grep, like
  -- this migration had landed.
  IF position('CASE WHEN public.is_admin() THEN ''admin'' ELSE ''gedu'' END' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed does not guard on the gedu-or-admin CASE — the admin group details page reads this document and would be refused';
  END IF;

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed still carries the gedu-only assert_role guard — the widened CASE has to REPLACE it, not sit beside it';
  END IF;

  -- --- (b) The ownership half survived, and an admin is let through it. -----
  --
  -- `NOT public.is_admin()` appears in exactly one place in this body: the
  -- ownership check. The CASE above spells it without the NOT, so this position
  -- is unambiguous and can be ordered against the guard.
  IF position('NOT public.is_admin()' IN v_src) = 0
     OR position('NOT public.gedu_teaches_group(p_group_id)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost its own-group check, or does not compose it under NOT public.is_admin() — the role guard alone admits every gedu on the platform';
  END IF;

  -- Guard-first, in the shape the authorization spine reads: the role guard is
  -- the FIRST statement and the ownership question comes after it.
  IF position('PERFORM public.assert_role(' IN v_src)
     > position('NOT public.is_admin()' IN v_src) THEN
    RAISE EXCEPTION 'get_gedu_group_feed checks ownership before its role guard — the guard must be the first statement';
  END IF;

  -- --- (c) The body was retyped in full and lost nothing. -------------------
  --
  -- A lost section reads as an empty panel rather than as an error, which is
  -- the whole reason these are here. group_joined_at is named explicitly: it is
  -- 00203's field, this migration retyped the body from 00203 rather than from
  -- schema.sql (which predates it), and getting that wrong would silently
  -- revert the roster flair instead of failing.
  IF position('group_joined_at' IN v_src) = 0
     OR position('note_updated_by_first_name' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost the member-flair fields — this body was retyped from 00203, not from schema.sql, precisely because schema.sql predates them';
  END IF;

  IF position('material_url' IN v_src) = 0
     OR position('attendance' IN v_src) = 0
     OR position('report_emailed_at' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost a section while being retyped';
  END IF;

  -- --- (d) The grants came back exactly as they went in. -------------------
  IF NOT has_function_privilege('authenticated', 'public.get_gedu_group_feed(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_gedu_group_feed(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost an EXECUTE grant during recreation';
  END IF;

  IF has_function_privilege('anon', 'public.get_gedu_group_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_gedu_group_feed is executable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- --- (e) 00203's gap, closed here. ---------------------------------------
  --
  -- 00203 asserted that get_product_groups_with_details joins gamer_group_notes
  -- exactly three times, as its statement that all three participation arms
  -- carry the flair. A join count cannot distinguish a widened JOIN from a
  -- widened OUTPUT: three arms could each have taken the join while only one
  -- emitted the fields, and the other two would read downstream as "this member
  -- has no note" rather than as an error. Counting the emitted KEY is the
  -- unambiguous statement, and it is landed here rather than in 00203 because
  -- 00203 is already applied to staging while this block still runs everywhere.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_product_groups_with_details';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_product_groups_with_details does not exist';
  END IF;

  SELECT count(*) INTO v_n
    FROM regexp_matches(v_src, 'note_updated_by_first_name', 'g');

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'get_product_groups_with_details emits note_updated_by_first_name % time(s) — it has three participation arms (grouped, unassigned, waitlist) and all three must EMIT the flair, not merely join to it', v_n;
  END IF;
END
$assert$;
