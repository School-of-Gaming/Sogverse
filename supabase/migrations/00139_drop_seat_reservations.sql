-- Removes the reserve → confirm stage from the paid-signup flow. A paid
-- participation is now created at payment confirmation (inside the Stripe
-- webhook) instead of being held as a `reserving` row from before Checkout.
--
-- WHY
--
-- The reserving row existed to stop a popular product overselling while parents
-- sat on the Stripe page. That premise no longer holds: seat caps are locked off
-- in the admin form for every product type except municipality clubs, and
-- municipality clubs are invoiced off-platform, so they never reach Stripe
-- Checkout at all. The cap the reservation protects cannot currently apply to
-- any sellable product.
--
-- What it cost while dormant: every failure between taking the seat and creating
-- the Checkout Session had to release the seat by hand, and a missed release
-- stranded a row that no webhook could ever reclaim (no Session exists yet, so
-- nothing expires). A stranded row then held the seat permanently, because the
-- seat-math RPC counted every reserving row regardless of its deadline while the
-- rollup the parent-facing counter reads filtered on that deadline — the product
-- advertised a free seat and checkout answered "full", with no way to tell why.
-- Both problems disappear with the stage itself: an abandoned or failed checkout
-- now leaves nothing in the database.
--
-- WHAT REPLACES THE HANDLE
--
-- The reserving row was not only a capacity hold — it was also the handle
-- joining a Stripe session to a participation, in both directions. Going in,
-- that link now lives in the Checkout Session metadata we write ourselves
-- (customer, gamer, product), which `confirm_paid_participation` below turns
-- into a row. Coming back out, the row records the Checkout Session that paid
-- for it (`participations.stripe_checkout_session_id`): that is what lets the
-- confirmation page resolve a `success_url` back to a seat, and — more
-- importantly — what tells a redelivered webhook that the row it is looking at
-- is its own earlier work rather than a second payment. See the function's notes.
--
-- THE RETIRED ENUM VALUE
--
-- PostgreSQL cannot drop a value from an enum, so `participation_status` keeps
-- 'reserving' forever. Nothing writes it after this migration. Any row still
-- carrying it is a stranded pre-payment hold from the old flow — deleted below,
-- before the column it depended on goes away.

-- ---------------------------------------------------------------------------
-- 1. Clear out stranded holds
-- ---------------------------------------------------------------------------
--
-- No such row can be legitimate: it means a parent started Checkout and the
-- session neither completed nor expired. Leaving them would strand seats under a
-- status nothing ever transitions out of again.

DELETE FROM public.participations WHERE status = 'reserving';

COMMENT ON TYPE public.participation_status IS
  'Participation lifecycle. ''reserving'' is RETIRED (2026-08, migration 00139): paid participations are created at payment confirmation, so nothing writes it. PostgreSQL cannot drop an enum value, hence it remains listed.';

-- ---------------------------------------------------------------------------
-- 2. Drop the two reservation-lifecycle RPCs
-- ---------------------------------------------------------------------------
--
-- `confirm_reservation` is superseded by `confirm_paid_participation` below;
-- `expire_reservation` has nothing left to expire. Both were service_role-only,
-- so no authenticated-facing surface changes.

DROP FUNCTION IF EXISTS public.confirm_reservation(uuid);
DROP FUNCTION IF EXISTS public.expire_reservation(uuid);

-- ---------------------------------------------------------------------------
-- 3. create_participation: validate paid signups, insert nothing
-- ---------------------------------------------------------------------------
--
-- Body copied from schema.sql per supabase/CLAUDE.md. Every validation is
-- unchanged — product lock, parent-of check, effective-status gate, registration
-- window, currency, purchase shape, already-enrolled check, seat-cap gate — and
-- the free / external branches still insert an instantly-active row. Only the
-- paid tail changes: it now returns 'validated' and writes nothing, so the
-- caller can create the Checkout Session knowing the signup would be accepted.
--
-- The seat-cap gate reads `count_active_seats` instead of `count_seats_taken`.
-- With reserving gone the two would count the same rows, and one function
-- counting seats is one place for the predicate to live. CREATE OR REPLACE
-- preserves the existing grants.

CREATE OR REPLACE FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) RETURNS jsonb
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

  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a % participation on this product', p_gamer_id, v_existing_status
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

-- ---------------------------------------------------------------------------
-- 4. count_seats_taken is gone; count_active_seats is the one seat count
-- ---------------------------------------------------------------------------
--
-- Its only caller was create_participation, rewritten above. Keeping a second
-- function whose body is now byte-identical to count_active_seats is how the two
-- drift apart again.

DROP FUNCTION IF EXISTS public.count_seats_taken(uuid);

-- ---------------------------------------------------------------------------
-- 5. The Checkout Session a paid seat was bought with
-- ---------------------------------------------------------------------------
--
-- Null for every no-charge seat (free events, municipality registrations, admin
-- enrollments, waitlist rows) and for every row created before this migration.
-- Unique where present: one Checkout Session buys at most one seat.
--
-- Two jobs, and the second is the load-bearing one:
--   1. The confirmation page arrives holding only a session id (the row it wants
--      did not exist when the `success_url` was built), and resolves it here.
--   2. It is the only thing that distinguishes "this webhook is a redelivery of
--      the event that created this row" from "the parent paid twice". Without
--      it the two are indistinguishable, and the handler's own retry path — it
--      deliberately writes the payment row last, so a failed subscription write
--      leaves no commit marker and Stripe re-runs the whole handler — would
--      read its own participation as a duplicate charge and cancel a paying
--      customer's live subscription.

ALTER TABLE public.participations
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

COMMENT ON COLUMN public.participations.stripe_checkout_session_id IS
  'Stripe Checkout Session that paid for this seat. NULL for no-charge seats (free, municipality, admin enrollment, waitlist) and for rows predating the create-on-confirmation flow.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_participations_checkout_session
  ON public.participations (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. confirm_paid_participation — the webhook's write
-- ---------------------------------------------------------------------------
--
-- Called from the Stripe `checkout.session.completed` handler with the
-- (customer, gamer, product) triple we put in the Session metadata ourselves,
-- plus the session's own id. service_role only: the arguments are trusted
-- precisely because they are ours, and an authenticated caller reaching this
-- would be handing itself a free seat.
--
-- Takes the product row FOR UPDATE, the same gate lock every participation
-- mutation begins with, so this serializes against create_participation,
-- cancel_participation and the waitlist RPCs.
--
-- Deliberately does NOT re-check the seat cap. The money has already moved; a
-- refusal here would leave a paid customer with no seat and no row, which is
-- strictly worse than one seat over a cap an admin can see.
--
-- Three outcomes, and the middle one is why the session id is an argument:
--   confirmed  (idempotent=false) — a fresh seat.
--   confirmed  (idempotent=true)  — this very session already bought this seat,
--                                   so a redelivery gets the same answer as the
--                                   first delivery and the caller re-runs its
--                                   remaining writes safely.
--   duplicate_payment             — a different session, or no session at all,
--                                   already put this gamer on this product. Two
--                                   charges, one seat; the caller records the
--                                   duplicate and cancels a live subscription.

-- A no-op on any database built from this repo's migrations. It exists for the
-- shared staging project, where an earlier draft of this same migration created
-- a three-argument version before the session id became an argument; without it
-- that draft would survive as a granted, unreachable overload.
DROP FUNCTION IF EXISTS public.confirm_paid_participation(uuid, uuid, uuid);

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_conflict_id      UUID;
  v_conflict_session TEXT;
  v_conflict_status  public.participation_status;
  v_participation_id UUID;
BEGIN
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Pre-check the partial UNIQUE on (product_id, gamer_id): under the gate lock
  -- this decides the outcome, and the index itself is left as the backstop.
  SELECT id, status, stripe_checkout_session_id
    INTO v_conflict_id, v_conflict_status, v_conflict_session
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id   = p_gamer_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    IF v_conflict_session IS NOT NULL
       AND v_conflict_session = p_checkout_session_id THEN
      RETURN jsonb_build_object(
        'kind', 'confirmed',
        'participation_id', v_conflict_id,
        'idempotent', TRUE
      );
    END IF;

    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'existing_participation_id', v_conflict_id,
      'existing_status', v_conflict_status::text
    );
  END IF;

  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'active', p_checkout_session_id
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) IS
  'Creates the active participation for a paid signup once Stripe confirms payment. service_role only — the arguments come from Checkout Session metadata we wrote. Returns kind=confirmed with participation_id (idempotent=true when this same session already bought the seat), or kind=duplicate_payment with existing_participation_id when a different payment already put this gamer on this product.';

REVOKE ALL ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_checkout_session_id text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Retire the reservation plumbing on participations
-- ---------------------------------------------------------------------------
--
-- The trigger must be recreated before the column drops: `UPDATE OF ... `
-- names the column as a real dependency, so dropping it out from under the
-- trigger would take the trigger with it.

DROP TRIGGER IF EXISTS trg_participations_refresh_counts_upd ON public.participations;

CREATE TRIGGER trg_participations_refresh_counts_upd
  AFTER UPDATE OF status, product_id ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();

DROP INDEX IF EXISTS public.idx_participations_reserving_live;

ALTER TABLE public.participations
  DROP CONSTRAINT IF EXISTS chk_participations_reserving_has_until;

ALTER TABLE public.participations
  DROP COLUMN IF EXISTS reserved_until;

-- ---------------------------------------------------------------------------
-- 8. Retire reserving_count on the seat rollup
-- ---------------------------------------------------------------------------
--
-- The rollup is what the parent-facing seat counter reads over Realtime. With no
-- reserving rows to count, the column would be a permanent zero that every
-- surface still has to add in — and adding it in is exactly what made the
-- counter and the capacity gate disagree.

CREATE OR REPLACE FUNCTION public.refresh_product_seat_counts(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_active     INTEGER;
  v_waitlist   INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'waitlisted')
    INTO v_active, v_waitlist
    FROM public.participations
    WHERE product_id = p_product_id;

  INSERT INTO public.product_seat_counts (
    product_id, active_count, waitlist_count, updated_at
  )
  VALUES (p_product_id, v_active, v_waitlist, NOW())
  ON CONFLICT (product_id) DO UPDATE SET
    active_count    = EXCLUDED.active_count,
    waitlist_count  = EXCLUDED.waitlist_count,
    updated_at      = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_product_seat_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.product_seat_counts (
    product_id, active_count, waitlist_count
  ) VALUES (NEW.id, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE public.product_seat_counts
  DROP CONSTRAINT IF EXISTS product_seat_counts_reserving_count_check;

ALTER TABLE public.product_seat_counts
  DROP COLUMN IF EXISTS reserving_count;

-- ---------------------------------------------------------------------------
-- 9. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Almost every statement above is conditional, and a conditional whose predicate
-- did not match is indistinguishable from one that did its job — the only
-- production discrepancy on record was a migration that took a branch its author
-- did not expect. Assert what should be true rather than trusting the branches.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.participations WHERE status = 'reserving'
  ) THEN
    RAISE EXCEPTION 'participations still holds reserving rows — the seat hold survived the transition';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'participations'
       AND column_name = 'reserved_until'
  ) THEN
    RAISE EXCEPTION 'participations.reserved_until is still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'product_seat_counts'
       AND column_name = 'reserving_count'
  ) THEN
    RAISE EXCEPTION 'product_seat_counts.reserving_count is still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('confirm_reservation', 'expire_reservation', 'count_seats_taken')
  ) THEN
    RAISE EXCEPTION 'a reservation-era function survived the drop';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'participations'
       AND column_name = 'stripe_checkout_session_id'
  ) THEN
    RAISE EXCEPTION 'participations.stripe_checkout_session_id was not added';
  END IF;

  -- Exactly one, by argument count: a surviving three-argument draft would take
  -- the caller's four-argument RPC silently nowhere useful, and is the specific
  -- thing the conditional drop above exists to clear.
  IF (
    SELECT COUNT(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'confirm_paid_participation'
  ) <> 1 THEN
    RAISE EXCEPTION 'confirm_paid_participation is missing, or exists in more than one argument shape';
  END IF;
END;
$$;
