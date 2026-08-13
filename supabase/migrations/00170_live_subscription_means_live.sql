-- 00170: "has a live Stripe subscription" stops meaning "has a
-- family_subscriptions row" and starts meaning "has one that is not dead".
-- The two admin refusals and the groups snapshot all move to the same
-- predicate, and the snapshot's waitlist branch stops guessing.
--
-- WHY. 00166 keyed both admin refusals — demote_to_waitlist and
-- admin_remove_participation — to the mere EXISTENCE of a family_subscriptions
-- row, on the reasoning that participation_id is UNIQUE there and
-- stripe_subscription_id is NOT NULL, so a row is a subscription. That is true
-- about the column and false about Stripe.
--
-- The row carries a status, constrained to
--   active | past_due | cancelled | incomplete | canceling
-- and the products webhook UPDATES it in place rather than deleting the row.
-- One of those updates is terminal: when Stripe exhausts dunning it moves the
-- subscription to `unpaid` (and an abandoned first payment to
-- `incomplete_expired`), both of which we store as `cancelled`. Neither fires
-- customer.subscription.deleted — that event is what deletes the participation
-- — so the row simply sits there, status `cancelled`, describing a
-- subscription that will never bill anything again.
--
-- Under 00166's predicate that dead row is indistinguishable from a live one.
-- The consequences are the reason this migration exists:
--
--   * demote_to_waitlist refuses forever. The seat can never be moved to the
--     waitlist to make room for someone else.
--   * admin_remove_participation refuses forever. There is no other exit — the
--     family has no live subscription to cancel through the portal, so the
--     "cancel it in Stripe first" instruction the refusal gives is advice about
--     something that does not exist.
--
-- Net effect: a family whose card finally failed permanently consumes a seat
-- that nobody can free, on a capped product, indefinitely. A dead subscription
-- must not hold a seat hostage.
--
-- THE PREDICATE, once, everywhere:
--
--     a family_subscriptions row exists for this participation
--     with status <> 'cancelled'
--
-- `status` is NOT NULL and CHECK-constrained to the five values, so `<>` is
-- total — no NULL hole. It deliberately keeps `past_due`, `incomplete` and
-- `canceling` on the refusing side: all three are subscriptions Stripe may
-- still bill or still recover, and `canceling` in particular is billing right
-- now and lapses at the period end. Only `cancelled` is terminal, and it is
-- terminal in both directions — a portal cancellation that completes deletes
-- the participation outright, so a surviving `cancelled` row can only be the
-- dunning-dead case above.
--
-- WHY THE SNAPSHOT'S WAITLIST BRANCH BECOMES A REAL READ. 00166 wrote
-- has_live_subscription as a constant FALSE there, resting on "demote_to_waitlist
-- refuses a subscribed row, so this state cannot exist". That reasoning does not
-- hold:
--
--   * The subscription is written AFTER a Stripe round trip, by the webhook,
--     with no product gate lock held — while demote_to_waitlist takes the lock
--     and reads the table. A demote landing in the window between the Checkout
--     Session completing and the family_subscriptions insert produces exactly
--     the row the constant says is impossible.
--   * The documented manual sub-adoption process (binding an externally created
--     Stripe subscription to an existing participation) writes the row directly,
--     against whatever status that participation happens to hold.
--
-- A snapshot that reports FALSE for such a row tells the admin panel a seat is
-- free of money when it is not. The branch now reads the same join as the other
-- two, so the panel is told the truth and can refuse the drag it should refuse.
-- The waitlist join gains the family_subscriptions LEFT JOIN it previously did
-- not have; participation_id is UNIQUE there, so it still cannot fan the row set
-- out, and it is indexed.
--
-- WHY FOUR FUNCTIONS ARE REPLACED WITH THEIR OWN BODIES — POOLED-SESSION
-- INSURANCE. 00169 dropped and recreated `product_status` and
-- `effective_product_status`. PL/pgSQL caches a compiled function keyed on its
-- pg_proc row (oid + xmin/tid) and resolves the type OIDs named in its DECLARE
-- block once, at compile time; a `LANGUAGE sql` body's plan is cached the same
-- way. Neither cache knows the type it captured was dropped out from under it,
-- and the symptom on a pooled backend that was already warm is
-- "cache lookup failed for type NNNN" until that connection is recycled — which
-- on a pooler can be a long time, and is not something a deploy triggers.
--
-- 00169 recreated the two functions whose SIGNATURES carry the enums
-- (create_product, effective_status), which is what the catalog forces. It did
-- not touch the two that merely name the types inside their bodies, because
-- nothing forces that — pg_proc records no dependency for it. pg_proc was
-- queried for exactly that set and it is two functions:
--
--   create_participation  DECLAREs v_eff_status public.effective_product_status
--   can_read_product      casts 'pending'/'running' to public.product_status
--
-- Both are re-issued below as byte-identical CREATE OR REPLACE. A replace
-- rewrites the pg_proc row, which invalidates every session's cached copy and
-- forces a recompile against the types that exist now. Nothing about either
-- function's behaviour changes, and that is the point: this is a cache flush
-- expressed as DDL, not an edit.
--
-- WHY THESE ARE ALL `CREATE OR REPLACE`. Every signature is unchanged, so each
-- function keeps its OID, its ACL and its authorization-spine classification.
-- The grants are restated anyway — the house rule is that a migration says out
-- loud who may execute what it wrote — and each is restated exactly as it
-- stood, which for create_participation means service_role ONLY (it takes the
-- customer id as a parameter; no browser role may reach it) and for
-- can_read_product means anon as well (it is the products SELECT policy's
-- predicate). The DO blocks at the foot assert the end state a REPLACE cannot.

-- ---------------------------------------------------------------------------
-- 1. demote_to_waitlist — the refusal asks whether the subscription is alive
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demote_to_waitlist(p_participation_id uuid)
RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status;
  v_live_sub   TEXT;
  v_now        TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- The product gate lock, as before. The product's TYPE is not read: nothing
  -- in this function branches on it.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- A LIVE subscription, not merely a row. participation_id is UNIQUE here and
  -- stripe_subscription_id is NOT NULL, so at most one row can match — but the
  -- webhook updates status in place instead of deleting, and a subscription
  -- Stripe gave up dunning (`unpaid`, stored as `cancelled`) never fires
  -- subscription.deleted. Treating that dead row as live made this refusal
  -- permanent: the seat could never be waitlisted, and the family had nothing
  -- left to cancel. `cancelled` is the only terminal value; past_due,
  -- incomplete and canceling can all still bill and still refuse.
  --
  -- What is being protected is unchanged: demoting a genuinely subscribed
  -- family puts a live subscription on a waitlisted row, which the parent's own
  -- leave affordance can delete — CASCADEing family_subscriptions away while
  -- Stripe keeps billing.
  --
  -- Refused for the operation, not for the row's current state — so this
  -- precedes the idempotent noop below.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
      AND status <> 'cancelled';
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Idempotent: already on the waitlist.
  IF v_status = 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only an active participation can be moved to the waitlist (status: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Back of the line: clock_timestamp() under the gate lock is monotonic with
  -- real ordering (00117 rule). Clear group_id — waitlisted gamers aren't grouped.
  v_now := clock_timestamp();
  UPDATE public.participations
     SET status = 'waitlisted',
         waitlisted_at = v_now,
         group_id = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'demoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id
  );
END;
$$;

COMMENT ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) IS
  'Admin-gated demotion of an active participation to the back of the product waitlist, under the product gate lock. Refuses any participation carrying a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — on any product type: a waitlisted row can be deleted by the parent via leave_my_waitlist_spot, which cascades family_subscriptions and orphans a subscription that keeps billing. A ''cancelled'' row is explicitly not live: dunning-exhausted subscriptions are stored that way and never fire subscription.deleted, so counting them would hold the seat hostage forever. Raised with the same errcode admin_remove_participation uses for the same condition.';

-- ---------------------------------------------------------------------------
-- 2. admin_remove_participation — the same predicate, for the same reason
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_remove_participation(
  p_product_id uuid,
  p_participation_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row_product_id uuid;
  v_live_sub       text;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id INTO v_row_product_id
    FROM public.participations WHERE id = p_participation_id;
  IF NOT FOUND OR v_row_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'participation % is not on product %',
      p_participation_id, p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A LIVE subscription, not merely a row — see demote_to_waitlist above for
  -- the whole reasoning; the two refusals are deliberately one predicate. The
  -- stakes here are the sharper of the two: removal is the ONLY exit a
  -- participation has once its subscription is dead (there is nothing left for
  -- the family to cancel), so counting a `cancelled` row as live left the seat
  -- permanently occupied with no instruction that could ever free it.
  --
  -- Still refused for anything that can bill: cancelling the participation
  -- CASCADEs family_subscriptions, and a live subscription would carry on
  -- charging a family the database no longer knows about.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
      AND status <> 'cancelled';
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN public.cancel_participation(p_participation_id, 'admin_cancelled');
END;
$$;

COMMENT ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) IS
  'Admin-gated un-enrollment. Refuses a participation that is not on the named product, or one with a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — which must be cancelled through Stripe first, or the cancel would orphan it; otherwise delegates to cancel_participation. A dunning-dead subscription is stored as ''cancelled'' and does NOT refuse: admin removal is the only exit such a seat has, so counting it would strand the seat forever. Product type is not consulted — a free club has no parent-facing cancel, so this is its only exit.';

-- ---------------------------------------------------------------------------
-- 3. get_product_groups_with_details — same predicate on all three branches,
--    and the waitlist branch stops guessing
-- ---------------------------------------------------------------------------

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
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
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
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
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
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
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
  -- has_live_subscription is a REAL READ here as of 00170. It used to be a
  -- constant FALSE, resting on "demote_to_waitlist refuses a subscribed row, so
  -- this cannot exist". It can: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
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
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
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
  'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches since 00170 — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip.';

-- ---------------------------------------------------------------------------
-- 4. Pooled-session insurance: byte-identical re-issues of the two functions
--    that name 00169's rebuilt enum types inside their bodies.
-- ---------------------------------------------------------------------------
--
-- Nothing below is an edit. See the header for why a no-op replace is the fix:
-- 00169 dropped both status enums out from under any already-compiled plpgsql
-- function and any cached SQL-function plan that captured their OIDs, and only
-- the two functions whose signatures carried the types were forced to be
-- recreated. Rewriting these two pg_proc rows invalidates the stale caches on
-- every pooled backend, which is otherwise only fixed by that connection being
-- recycled.

CREATE OR REPLACE FUNCTION public.create_participation(
  p_product_id uuid,
  p_gamer_id uuid,
  p_customer_id uuid,
  p_purchase_shape text,
  p_currency text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_is_parent             BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'subscription_monthly', 'single_payment', 'free', 'external'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  -- The already-enrolled gate. Its status list has to match the one
  -- `confirm_paid_participation` conflicts on, or a signup can pass here, take
  -- the parent's money, and then be refused at confirmation with nothing to
  -- show for it. 'completed' is the member that was missing: nothing writes
  -- that status today, so the gap was unreachable rather than harmless.
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, gamer_id, customer_id, status
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active'
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Municipality clubs are invoiced off-platform: no Stripe, nothing to
  -- confirm later. Mirrors the free branch (instant active), gated on
  -- billing_mode so a paid product can never be registered without payment.
  IF p_purchase_shape = 'external' THEN
    IF v_product.billing_mode <> 'external_contract' THEN
      RAISE EXCEPTION 'product is not externally contracted'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, gamer_id, customer_id, status
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active'
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'external_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Paid shapes (subscription_monthly, single_payment). Everything above has
  -- passed, so this signup is one the platform would accept — but no row is
  -- written until the money arrives. The caller creates the Stripe Checkout
  -- Session next; if the parent abandons it, nothing was left behind to clean
  -- up. `confirm_paid_participation` writes the row from the webhook.
  RETURN jsonb_build_object('kind', 'validated');
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid)
RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT public.get_user_role()) = 'admin'::public.user_role
    -- public: published. `is_visible` is NOT tested here, and its absence is
    -- the point: that column governs LISTING only — the browse queries filter
    -- on it — while a direct link to an unlisted product is meant to lead to a
    -- page a parent can read and buy from. The consequence is that an unlisted
    -- product is readable, and therefore enumerable, through the Data API:
    -- obscurity rather than secrecy, accepted by owner decision (Aug 2026).
    -- What keeps a product unbuyable is its status, its seat cap and its
    -- registration window — never its visibility.
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending'::public.product_status, 'running'::public.product_status)
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM public.participations p
      WHERE p.product_id = p_product_id
        AND (p.gamer_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active'::public.participation_status, 'waitlisted'::public.participation_status)
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants — restated exactly as they stood for every function above.
-- ---------------------------------------------------------------------------
--
-- Unchanged signatures mean CREATE OR REPLACE kept every ACL, but a migration
-- states who may execute what it wrote rather than relying on that. Note the
-- deliberate asymmetry: create_participation is service_role ONLY (it takes the
-- customer id as a parameter, so any browser-reachable grant would let one
-- family enroll on another's behalf), and can_read_product is the only one anon
-- may execute (it is the products SELECT policy's predicate).

GRANT EXECUTE ON FUNCTION public.demote_to_waitlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_to_waitlist(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Source-level, as in 00166 and 00167: migrations run against a schema with no
-- rows, so there is no dunning-dead subscription here to demote past and a
-- behavioural probe would pass on the un-migrated function as readily as on
-- this one. The behaviour is pinned where fixtures exist —
-- tests/db/waitlist-admin.test.ts and tests/db/admin-participation-rpcs.test.ts.
-- What is worth asserting here is what a long-body replace can silently get
-- wrong: leaving one of the three copies of the predicate on the old test.

DO $$
DECLARE
  v_src TEXT;
  v_key TEXT;
BEGIN
  -- Both refusals now filter the subscription row by status. Asserting the
  -- filter is present is the whole point: without it the function still
  -- compiles, still refuses, and refuses forever.
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.demote_to_waitlist(uuid)'::regprocedure);
  IF v_src NOT LIKE '%status <> ''cancelled''%' THEN
    RAISE EXCEPTION 'demote_to_waitlist still treats any family_subscriptions row as live';
  END IF;
  IF v_src NOT LIKE '%family_subscriptions%' THEN
    RAISE EXCEPTION 'demote_to_waitlist lost its live-subscription refusal';
  END IF;

  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.admin_remove_participation(uuid, uuid)'::regprocedure);
  IF v_src NOT LIKE '%status <> ''cancelled''%' THEN
    RAISE EXCEPTION 'admin_remove_participation still treats any family_subscriptions row as live';
  END IF;
  IF v_src NOT LIKE '%family_subscriptions%' THEN
    RAISE EXCEPTION 'admin_remove_participation lost its live-subscription refusal';
  END IF;

  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.get_product_groups_with_details(uuid)'::regprocedure);

  -- Three participation objects, three joins, three copies of the liveness
  -- filter — counted rather than merely present, because a single branch left
  -- on the old join is exactly the mistake this shape invites.
  v_key := 'fs.status <> ''cancelled''';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details must exclude cancelled subscriptions on all three participation objects (grouped, unassigned, waitlist)';
  END IF;

  -- The waitlist branch reads the join instead of asserting FALSE. Counting the
  -- expression catches the constant surviving on any one branch, and the
  -- explicit FALSE check names the specific regression.
  v_key := '(fs.id IS NOT NULL)';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details must derive has_live_subscription from the join on all three participation objects';
  END IF;
  IF v_src LIKE '%''has_live_subscription'',    FALSE%' THEN
    RAISE EXCEPTION
      'get_product_groups_with_details still reports a constant false has_live_subscription on the waitlist branch';
  END IF;

  -- 00166's and 00167's keys both survived the paste, in all three objects.
  v_key := '''has_live_subscription'',';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details lost has_live_subscription from one of its three participation objects';
  END IF;
  v_key := '''has_payment_marker'',';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details lost has_payment_marker from one of its three participation objects';
  END IF;

  -- The two no-op re-issues really are the bodies they claim to be. If either
  -- had been pasted from something else, the type it exists to recompile would
  -- be missing.
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.create_participation(uuid, uuid, uuid, text, text)'::regprocedure);
  IF v_src NOT LIKE '%public.effective_product_status%' THEN
    RAISE EXCEPTION 'create_participation no longer declares effective_product_status — the re-issue is not the live body';
  END IF;

  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.can_read_product(uuid)'::regprocedure);
  IF v_src NOT LIKE '%''pending''::public.product_status%'
     OR v_src NOT LIKE '%''running''::public.product_status%' THEN
    RAISE EXCEPTION 'can_read_product lost its published-status gate across the re-issue';
  END IF;
  IF v_src LIKE '%is_visible = true%' THEN
    RAISE EXCEPTION 'can_read_product regained its is_visible test across the re-issue';
  END IF;
END;
$$;

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  -- The three admin-gated functions keep the guard-first shape the
  -- authorization spine requires, and the grant posture 00166/00167 set.
  FOREACH v_signature IN ARRAY ARRAY[
    'public.demote_to_waitlist(uuid)',
    'public.admin_remove_participation(uuid, uuid)',
    'public.get_product_groups_with_details(uuid)'
  ] LOOP
    IF (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = v_signature::regprocedure)
       NOT LIKE '%PERFORM public.assert_admin();%' THEN
      RAISE EXCEPTION '% lost its admin guard across the replace', v_signature;
    END IF;

    IF NOT pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %', v_signature;
    END IF;
    IF NOT pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute %', v_signature;
    END IF;
    IF pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION '% is reachable by anon', v_signature;
    END IF;
  END LOOP;

  -- create_participation stays service-role-only. It has no guard by design
  -- (its caller is a server route holding the admin client), which is only safe
  -- while no browser role can execute it.
  IF NOT pg_catalog.has_function_privilege(
           'service_role', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute create_participation';
  END IF;
  IF pg_catalog.has_function_privilege(
           'authenticated', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_participation is reachable by authenticated';
  END IF;
  IF pg_catalog.has_function_privilege(
           'anon', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_participation is reachable by anon';
  END IF;

  -- can_read_product is the products SELECT policy's predicate, so anon
  -- executing it is required rather than tolerated.
  IF NOT pg_catalog.has_function_privilege('anon', 'public.can_read_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot execute can_read_product';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.can_read_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute can_read_product';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', 'public.can_read_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute can_read_product';
  END IF;
END;
$$;
