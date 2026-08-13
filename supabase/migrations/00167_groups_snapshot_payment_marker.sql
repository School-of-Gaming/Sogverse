-- 00167: the groups snapshot carries the payment marker too, so the panel's
-- promote refusal is decided from one read instead of two.
--
-- WHY. 00166 gave every participation object in
-- get_product_groups_with_details a has_live_subscription flag, which is what
-- the admin panel's DEMOTE dialog asks. The panel's other refusal — PROMOTE of
-- a waitlisted family onto a paid product — asks a different question: did
-- money ever arrive for this seat? That is `stripe_checkout_session_id IS NOT
-- NULL`, and because the snapshot did not carry it the panel fetched it with a
-- second query against participations, filtered to the product's waitlisted
-- rows. Two reads for one panel, with a window between them in which the
-- markers describe a waitlist the snapshot no longer has.
--
-- The marker rides along in the snapshot instead. It is the same shape of
-- addition 00166 made and for the same reason: the panel renders every
-- participation on the product at once, so asking per chip is an N+1 against a
-- column that is already on the row being selected. No join is involved — the
-- column lives on participations itself.
--
-- WHY IT IS A REAL READ ON ALL THREE BRANCHES. Unlike has_live_subscription,
-- which is a constant false on the waitlist branch (00166 made a subscribed
-- waitlisted row a state the database refuses to create), the payment marker is
-- most interesting exactly there. Demotion does not clear it: a camper who
-- genuinely paid and was later moved to the waitlist still carries their
-- Checkout Session id, and the panel uses that to let them be promoted back
-- with a plain drag, while a family who joined the queue without paying never
-- had one and gets the dialog. Keying the refusal on the product's billing
-- alone would trap the former on the waitlist forever.
--
-- It is added to the grouped and unassigned branches as well, even though only
-- the waitlist branch's value decides anything today, so the zod contract keeps
-- ONE required participation shape rather than a union of two — the same
-- reasoning 00166 recorded.
--
-- The marker says money arrived at some point; it is not a statement about the
-- seat being currently paid for. A cancelled subscription leaves the id
-- standing. That is the intended meaning: the refusal exists to stop an admin
-- handing out a seat to a family that never entered a payment flow at all, not
-- to audit billing state.
--
-- WHY `CREATE OR REPLACE`. The signature is unchanged, so the function keeps
-- its OID, its ACL and its authorization-spine classification (still
-- admin-gated, with `PERFORM public.assert_admin();` as its first statement).
-- The grants are restated anyway — the house rule is that a migration says out
-- loud who may execute what it wrote — and the DO block at the foot asserts the
-- end state a REPLACE cannot: that the new key really landed in all three
-- participation objects, and that the 00166 flag beside it survived the paste.

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid)
RETURNS jsonb
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
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                       p.id,
                     'gamer_id',                 p.gamer_id,
                     'gamer_first_name',         gmp.first_name,
                     'gamer_date_of_birth',      gprof.date_of_birth,
                     'gamer_gender',             gprof.gender,
                     'gamer_minecraft_username', mca.minecraft_username,
                     'gamer_minecraft_uuid',     mca.minecraft_uuid,
                     'gamer_parent_first_name',  parent.first_name,
                     'gamer_parent_last_name',   parent.last_name,
                     'status',                   p.status,
                     'signed_up_at',             p.signed_up_at,
                     -- The demote dialog's condition, resolved server-side so
                     -- the panel needs no second round trip per chip.
                     'has_live_subscription',    (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',       (p.stripe_checkout_session_id IS NOT NULL)
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.gamer_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            LEFT JOIN family_subscriptions fs ON fs.participation_id = p.id
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.gamer_id
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
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at,
             'has_live_subscription',    (fs.id IS NOT NULL),
             'has_payment_marker',       (p.stripe_checkout_session_id IS NOT NULL)
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN family_subscriptions fs ON fs.participation_id = p.id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
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
  -- has_live_subscription is a CONSTANT false here rather than a read. Since
  -- 00166 demote_to_waitlist refuses a subscribed participation, so a waitlisted
  -- row carrying a live subscription is a state the database will not create;
  -- the field exists on this branch only so the shape stays one object, and the
  -- panel's demote dialog never asks it of a row that is already waitlisted.
  --
  -- has_payment_marker is the opposite case: a real read, and this is the branch
  -- whose value actually decides something. Demotion leaves the Checkout Session
  -- id in place, so a family that paid and was later demoted is distinguishable
  -- here from one that only ever queued.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at,
             'has_live_subscription',    FALSE,
             'has_payment_marker',       (p.stripe_checkout_session_id IS NOT NULL)
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
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

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS
  'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (constant false on the waitlist branch, because demote_to_waitlist refuses to create such a row) and has_payment_marker (a real read of stripe_checkout_session_id on all three branches — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- An unchanged signature means CREATE OR REPLACE kept the ACL, but a migration
-- states who may execute what it wrote rather than relying on that.

GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Assert the end state
-- ---------------------------------------------------------------------------
--
-- Source-level, as in 00166: migrations run against a schema with no rows, so
-- a behavioural probe would have nothing to read. The behaviour is pinned in
-- tests/db/waitlist-admin.test.ts and tests/db/apply-group-changes.test.ts,
-- which parse real RPC output through the production zod contract. What is
-- worth asserting here is what a long-body replace can silently get wrong:
-- landing the new key in only some of the three participation objects.

DO $$
DECLARE
  v_src TEXT;
  v_key TEXT;
BEGIN
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.get_product_groups_with_details(uuid)'::regprocedure);

  -- Counted, not merely present: a key missing from one branch makes the zod
  -- contract's one required shape a lie for whichever branch was missed. The
  -- needle carries the quote and the comma so it matches jsonb keys only, never
  -- the prose about them.
  v_key := '''has_payment_marker'',';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details must carry has_payment_marker in all three participation objects (grouped, unassigned, waitlist)';
  END IF;

  -- 00166's flag has to still be there beside it.
  v_key := '''has_live_subscription'',';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details lost has_live_subscription from one of its three participation objects';
  END IF;

  -- The marker is the column, not a constant: a FALSE pasted onto one branch
  -- would report every waitlister as never-paid and trap the demoted-after-
  -- paying camper the whole rule exists to let back in.
  IF (length(v_src) - length(replace(v_src, 'p.stripe_checkout_session_id IS NOT NULL', '')))
     / length('p.stripe_checkout_session_id IS NOT NULL') <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details must read stripe_checkout_session_id on all three participation objects';
  END IF;

  -- The spine requires the admin guard to be the function's first statement;
  -- asserting its presence here catches a body pasted without it.
  IF v_src NOT LIKE '%PERFORM public.assert_admin();%' THEN
    RAISE EXCEPTION 'get_product_groups_with_details lost its admin guard across the replace';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
           'authenticated', 'public.get_product_groups_with_details(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute get_product_groups_with_details';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
           'service_role', 'public.get_product_groups_with_details(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute get_product_groups_with_details';
  END IF;
  IF pg_catalog.has_function_privilege(
           'anon', 'public.get_product_groups_with_details(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_product_groups_with_details is reachable by anon';
  END IF;
END;
$$;
