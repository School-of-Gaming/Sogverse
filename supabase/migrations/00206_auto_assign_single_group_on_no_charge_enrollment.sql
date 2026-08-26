-- A no-charge product with exactly one group seats new enrollments in it.
--
-- WHY
--
-- "Unassigned" is not a state, it is an inbox: status='active' AND
-- group_id IS NULL, and the admin groups panel exists to empty it. That inbox
-- earns its keep on a product with several groups, where somebody has to decide
-- which one a child belongs in. On a product with exactly ONE group there is no
-- decision to make — every chip in the inbox is going to be dragged into the
-- same column — so the inbox is pure clerical work, and on the municipality
-- clubs (billing_mode = 'external_contract') it is clerical work at the volume
-- of a whole school year's intake.
--
-- So the enrollment writers make the placement themselves when, and only when,
-- it is forced: a product that charges nothing AND has exactly one group. Zero
-- groups has nowhere to put anybody; two or more is a real decision and stays a
-- human's.
--
-- WHY THE PREDICATE IS BILLING, NOT PRODUCT TYPE
--
-- The distinction that matters is whether a seat is created by this transaction
-- or by a later webhook. A no-charge seat lands active on the spot, so the
-- writer holding the product lock is the one place that can make the placement
-- under a consistent read of the group list. A PAID seat is written by
-- `confirm_paid_participation` from a Stripe webhook, on a different
-- transaction, at a different time — deliberately untouched here, and the
-- reason this migration is keyed to billing_mode rather than to product_type.
-- The waitlist promotion path is likewise untouched: it takes the target group
-- as an argument, and that argument defaults to NULL, so a promotion places
-- somebody in a group or leaves them in the inbox exactly as the admin asked
-- when they dropped the chip. Which of the two happens is their decision at the
-- moment they make it, and this migration has no business making it for them.
--
-- WHY THE "EXACTLY ONE" READ CANNOT RACE
--
-- `create_participation` already opens with `SELECT * FROM products WHERE
-- id = ... FOR UPDATE`, which is the same row lock the group editor takes
-- before it adds or removes a group. So the count read below sits inside that
-- lock and cannot see a half-applied group edit: a concurrent admin either
-- committed before this enrollment (and their group list is what gets counted)
-- or waits behind it.
--
-- `admin_enroll_participant` did NOT take that lock — it read the product with
-- a plain SELECT — so this migration adds `FOR UPDATE` to its product read.
-- Without it, an admin comp-enrolling while another admin splits the single
-- group into two could count one group and then insert against a product that
-- has two. The lock is the same one every other participation writer takes, in
-- the same order (product first, then participations), so it introduces no new
-- deadlock ordering.
--
-- The read itself is deliberately `LIMIT 2`: the question is "is there exactly
-- one", not "how many are there", and stopping at the second row answers it on
-- a product with fifty groups as cheaply as on a product with one.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- Whether the single group has a gedu assigned is irrelevant — an unstaffed
-- group is still the only place the seat can go, and holding the child in the
-- inbox until a gedu appears would just be the same clerical work deferred.
--
-- No backfill. Existing rows sitting in the inbox stay there; whether to sweep
-- them is a separate decision, and doing it silently inside a behaviour change
-- would mix an irreversible data edit into a function replacement.
--
-- `group_joined_at` is NOT set by either INSERT below. A BEFORE INSERT OR
-- UPDATE OF group_id trigger stamps it whenever group_id is set, and the table
-- comment says in as many words not to write it by hand — inserting with a
-- group_id present gets the stamp for free.
--
-- WHY THE BODIES ARE COPIED FROM `supabase/schema.sql`
--
-- The standing rule. Neither function has been touched by this branch, so
-- `schema.sql` is the current truth for both; everything else is carried
-- forward verbatim, including the `SET search_path TO ''` headers, the grants,
-- the REVOKE FROM PUBLIC and every existing comment in the bodies.

-- ---------------------------------------------------------------------------
-- The family self-enrollment path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) RETURNS jsonb
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
  v_auto_group_id         UUID;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- WHO IS IN THE SEAT, and whether this product admits them.
  --
  -- Plain `=`, deliberately not `IS NOT DISTINCT FROM`: two NULL ids are not a
  -- self seat, they are a caller with nothing to say, and the NULL comparison
  -- drops them into the ELSE branch where the parent-link check refuses them.
  -- Fail-closed falls out of the operator rather than out of a guard somewhere
  -- above.
  IF p_participant_id = p_customer_id THEN
    -- The adult's own seat. This function has no auth.uid() (service_role
    -- only), so "self" can only mean participant = the customer the route
    -- pinned to the session user — which is the same footing the parent-link
    -- check has always stood on.
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Somebody else's seat. The parent-link requirement is unchanged and is
    -- what keeps "a parent can never enroll another adult" true: an unlinked
    -- adult fails here exactly as an unlinked child does.
    SELECT EXISTS (
      SELECT 1 FROM public.parent_gamer
      WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
    ) INTO v_is_parent;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_product.for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
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
      AND participant_id = p_participant_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_participant_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup. A parent's
  -- own seat counts here like anybody else's: the cap is on seats, not on
  -- children.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  -- AUTOMATIC PLACEMENT (00206), for the two branches below that seat somebody
  -- on the spot. A no-charge product with exactly one group has no placement
  -- decision left in it, so the seat goes straight into that group instead of
  -- into the unassigned inbox; zero groups has nowhere to put anyone, and two
  -- or more is a real decision that stays a human's. NULL out of this read is
  -- the unassigned inbox, which is what every enrollment did before.
  --
  -- Safe against a concurrent group edit because the product row is held FOR
  -- UPDATE above — the same lock the group editor takes. LIMIT 2 because the
  -- question is "exactly one?", not "how many?".
  IF v_product.billing_mode IN ('free', 'external_contract') THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
    -- from group_id, and the table comment forbids writing it by hand.
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
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
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
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

COMMENT ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) IS 'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap) and then either writes the seat or reports that the caller may go and take the money. The two no-charge shapes — free and external (municipality, invoiced off-platform) — insert an active row here and now; the paid shapes return kind=''validated'' and nothing is written until confirm_paid_participation runs from the Stripe webhook, so an abandoned Checkout leaves nothing behind. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count and the group read below race-free against a concurrent signup or group edit. Since 00206 the two instant-active branches place the seat automatically when the product charges nothing AND has exactly one group: that combination has no placement decision left in it, so the row lands in that group rather than in the unassigned inbox. Zero groups, two or more groups, or any paid product still land group_id NULL — the inbox — and whether the single group has a gedu assigned is not consulted. group_joined_at is never written here; a trigger stamps it from group_id. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user.';

-- Carried forward and re-asserted. The REVOKE is load-bearing on a recreate: a
-- replaced function comes back PUBLIC-executable.
REVOKE EXECUTE ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- The admin comp-enrollment path
-- ---------------------------------------------------------------------------
--
-- Same rule, same reason: an admin dropping a child onto a free camp with one
-- group would otherwise have to go and drag the chip they just created out of
-- the inbox and into the only column on screen.
--
-- Two differences from the function above. The product read gains FOR UPDATE
-- (it had none), so the group count is taken under the same lock. And the
-- billing check is explicit — this function accepts PAID camps and events, so
-- unlike the branches above it cannot infer "no charge" from the shape it was
-- asked for.

CREATE OR REPLACE FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_billing_mode     public.billing_mode;
  v_for_gamers       boolean;
  v_for_parents      boolean;
  v_participant_role public.user_role;
  v_customer_id      uuid;
  v_participation_id uuid;
  v_auto_group_id    uuid;
BEGIN
  PERFORM public.assert_admin();

  -- FOR UPDATE since 00206: the automatic placement below counts this product's
  -- groups, and the lock is what stops that count from being taken against a
  -- group list another admin is in the middle of changing. Same lock, same
  -- order (product, then participations) as every other participation writer.
  SELECT product_type, billing_mode, for_gamers, for_parents
    INTO v_product_type, v_billing_mode, v_for_gamers, v_for_parents
    FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The one shape whose seat cannot exist without a Stripe subscription, which
  -- comp-enrollment has no way to create. Every other combination — free clubs
  -- included, since 00166 — is the free camp and free event this function has
  -- always written.
  IF v_product_type = 'consumer_club' AND v_billing_mode = 'paid' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for subscription-billed consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- This function derives the customer rather than being told one, so "is this
  -- a self seat" is decided from the participant's ROLE. A `customer` profile
  -- is an adult taking a seat on their own account; every other role (and a
  -- participant who does not exist at all, whose role reads NULL and so fails
  -- this comparison) goes down the child path and is resolved through the
  -- parent link exactly as before — including the error it has always raised.
  SELECT role INTO v_participant_role
    FROM public.profiles WHERE id = p_participant_id;

  IF v_participant_role = 'customer' THEN
    IF NOT v_for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- An adult pays for their own seat: they are the customer AND the
    -- participant. This is the row shape the dropped no-self-signup CHECK used
    -- to forbid.
    v_customer_id := p_participant_id;
  ELSE
    -- One parent per gamer is the current model; where a gamer somehow has
    -- several links, the oldest wins so the choice is deterministic rather than
    -- whatever the planner returned. Multi-parent reckoning is future work.
    SELECT parent_id INTO v_customer_id
      FROM public.parent_gamer
      WHERE gamer_id = p_participant_id
      ORDER BY created_at ASC
      LIMIT 1;
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'gamer % has no linked parent', p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- AUTOMATIC PLACEMENT (00206). A no-charge product with exactly one group has
  -- no placement decision left in it. A paid camp or event still lands in the
  -- unassigned inbox — money on the seat is what separates the two, and this
  -- function serves both.
  IF v_billing_mode IN ('free', 'external_contract') THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  -- The partial unique index on (product_id, participant_id) for non-reserving
  -- statuses is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  --
  -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
  -- from group_id, and the table comment forbids writing it by hand.
  INSERT INTO public.participations (product_id, participant_id, customer_id, status, group_id)
  VALUES (p_product_id, p_participant_id, v_customer_id, 'active', v_auto_group_id)
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'customer_id', v_customer_id
  );
END;
$$;

COMMENT ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) IS 'Admin-gated comp-enrollment: drops a participant onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event. Since 00173 it also enforces the audience: a customer profile takes a seat as their own customer and needs for_parents, anyone else is resolved through the parent link and needs for_gamers. Renamed from admin_enroll_gamer in 00175 — it has not only enrolled gamers since 00173. Since 00206 it places the seat automatically when the product charges nothing (billing_mode free or external_contract) AND has exactly one group, matching the family self-enrollment path; a PAID camp or event still lands in the unassigned inbox, as does any product with zero or several groups, and whether the single group has a gedu assigned is not consulted. That placement is why the product read now takes FOR UPDATE — the group count has to be taken under the same lock the group editor holds. group_joined_at is never written here; a trigger stamps it from group_id.';

REVOKE EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so
-- a silent no-op — an already-claimed version number, a grant that did not take,
-- a section lost while retyping a body — fails here rather than later as an
-- inbox that quietly fills up again. Apply-time protection: it says what was
-- true when this migration ran, and nothing about later ones.

DO $assert$
DECLARE
  v_src      text;
  v_name     text;
  -- How many rows each function can seat on the spot, and therefore how many of
  -- its INSERTs must carry the group: `create_participation` writes a seat in
  -- two branches (free and external), `admin_enroll_participant` in one.
  v_expected int;
  v_found    int;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['create_participation', 'admin_enroll_participant']
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% does not exist', v_name;
    END IF;

    -- --- (a) The placement read landed, and it is gated on billing. ---------
    IF position('billing_mode IN (''free'', ''external_contract'')' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not gate automatic placement on a no-charge billing mode', v_name;
    END IF;

    -- Probes only the STATEMENT can produce. prosrc carries the body's comments
    -- too, and `LIMIT 2` is written out in the comment that explains this read —
    -- a bare table name is one comment edit from the same trap — so a body whose
    -- code was deleted and whose explanation survived would pass both. A
    -- `FROM` clause and an aggregate call are prose nobody writes by accident.
    IF position('FROM public.product_groups' IN v_src) = 0
       OR position('array_agg(g.id)' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not read the product''s groups with the bounded exactly-one check', v_name;
    END IF;

    -- --- (b) EVERY INSERT carries the group, and not the stamp. ------------
    --
    -- The read is worthless if the value it produces never reaches the row, and
    -- a body that computed v_auto_group_id and then inserted the old column
    -- list would look, to a grep for the read alone, exactly like this landed.
    --
    -- Counted rather than merely found, because `create_participation` seats
    -- somebody in two separate branches and a substring test cannot tell one
    -- updated INSERT from two — leaving the external (municipality) branch
    -- writing the old column list would be invisible to it, on the very path
    -- that motivated this migration.
    v_expected := CASE v_name WHEN 'create_participation' THEN 2 ELSE 1 END;

    v_found := (length(v_src) - length(replace(v_src, 'status, group_id', '')))
               / length('status, group_id');
    IF v_found <> v_expected THEN
      RAISE EXCEPTION '% names group_id in % of its % on-the-spot INSERT column lists', v_name, v_found, v_expected;
    END IF;

    v_found := (length(v_src) - length(replace(v_src, '''active'', v_auto_group_id', '')))
               / length('''active'', v_auto_group_id');
    IF v_found <> v_expected THEN
      RAISE EXCEPTION '% computes an automatic group id but inserts it in only % of its % seat writes — the placement would be dead code on the rest', v_name, v_found, v_expected;
    END IF;
  END LOOP;

  -- --- (c) The admin path takes the product lock the count needs. ----------
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'admin_enroll_participant';

  IF position('FROM public.products WHERE id = p_product_id FOR UPDATE' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_enroll_participant reads the product without FOR UPDATE — its group count could race a concurrent group edit';
  END IF;

  -- Guard-first, in the shape the authorization spine reads. The admin path is
  -- reachable by `authenticated`, so its guard must remain the first statement.
  IF position('PERFORM public.assert_admin();' IN v_src) = 0
     OR position('PERFORM public.assert_admin();' IN v_src)
        > position('FROM public.products' IN v_src) THEN
    RAISE EXCEPTION 'admin_enroll_participant no longer opens with its assert_admin guard';
  END IF;

  -- --- (d) The grants came back exactly as they went in. -------------------
  IF NOT has_function_privilege('service_role', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_enroll_participant(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_enroll_participant(uuid, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'an enrollment writer lost an EXECUTE grant during recreation';
  END IF;

  -- create_participation is service_role only and must stay that way: it has no
  -- auth.uid() and trusts its caller to have pinned the customer id.
  IF has_function_privilege('authenticated', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_participation(uuid, uuid, uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_enroll_participant(uuid, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'an enrollment writer is executable by a role it must not be — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
