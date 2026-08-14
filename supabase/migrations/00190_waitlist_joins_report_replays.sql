-- A waitlist join says whether it actually joined anything.
--
-- WHY THE CALLER CANNOT WORK THIS OUT FOR ITSELF
--
-- `join_waitlist` is idempotent by design: an existing waitlisted/reserving/
-- active row for this (product, participant) is returned instead of a second
-- row being written. That is the right behaviour and it is not changing. What
-- is wrong is that the returned shape is *identical* either way — same
-- participation id, same derived position, same status — so nothing downstream
-- can tell a fresh join from a replay. A parent who resubmits a stale tab, or
-- whose browser retries, gets the same answer twice, and anything the caller
-- does once per join it then does twice.
--
-- The concrete casualty is the confirmation email. It has to be sent exactly
-- once per place in line, and the only place the truth lives is inside this
-- function, under the product gate lock, at the moment the INSERT either
-- happens or does not. Recomputing it outside — "was there a row a moment
-- ago?" — is a second query racing the first, which is precisely the race the
-- lock exists to remove.
--
-- THE SHAPE IS confirm_paid_participation'S, DELIBERATELY
--
-- That function answers the same question for the paid path (Stripe redelivers;
-- both deliveries report `confirmed` with the same id, and only the first
-- carries `idempotent` false), and the webhook keys its mail on exactly that
-- flag. Copying the name and the polarity means the two write paths a family
-- can arrive on report replays the same way, and one contract sentence covers
-- both. `false` only on the call that ran the INSERT; `true` on every call that
-- recognised a row already there.
--
-- The flag is added to BOTH return sites rather than only the existing-row one.
-- An optional key would let a caller's `!result.idempotent` pass vacuously on
-- any future branch that forgot it — the fresh-insert branch has to say `false`
-- out loud for the check to mean anything.
--
-- NOTHING ELSE MOVES
--
-- The audience gates, the parent-of-gamer check, the waitlist_enabled refusal,
-- the clock_timestamp() ordering stamp and both position derivations are
-- transcribed unchanged from the current definition. `CREATE OR REPLACE` keeps
-- the ACL; the REVOKE below is re-issued for the reason 00173 gave when it last
-- replaced this body.

CREATE OR REPLACE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_ts       TIMESTAMPTZ;
  v_existing_status   public.participation_status;
  v_now               TIMESTAMPTZ;
  v_position          INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Same audience gate as create_participation, and for the same reason: a
  -- queue is a promise of a seat, so it has to refuse exactly the seats the
  -- signup path would. See that function for why `=` rather than
  -- `IS NOT DISTINCT FROM`, and for why the parent-link arm is what keeps a
  -- parent from enrolling another adult.
  IF p_participant_id = p_customer_id THEN
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
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

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is,
  -- flagged so the caller can tell this apart from the INSERT below.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'waitlisted' THEN
      SELECT COUNT(*) INTO v_position
        FROM public.participations
        WHERE product_id = p_product_id AND status = 'waitlisted'
          AND (waitlisted_at < v_existing_ts
               OR (waitlisted_at = v_existing_ts AND id <= v_existing_id));
    ELSE
      -- Already holds a spot (active/reserving) — not on the waitlist.
      v_position := 0;
    END IF;
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_position,
      'status', v_existing_status::text,
      'idempotent', TRUE
    );
  END IF;

  -- Stamp the join time; order is derived from it, never stored as a rank.
  -- clock_timestamp(), NOT now(): now() is transaction_timestamp() (frozen at
  -- transaction start), so concurrent joins serialized on the gate lock can
  -- carry equal/inverted stamps and both compute rank 1. clock_timestamp()
  -- reads the wall clock at this statement — which runs under the lock, after
  -- the prior joiner committed — so stamps are monotonic with real join order.
  v_now := clock_timestamp();
  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  -- The one call that wrote a row. Everything that must happen exactly once per
  -- place in line keys on this.
  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted',
    'idempotent', FALSE
  );
END;
$$;

COMMENT ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid) IS
  'Waitlist engine behind join_product_waitlist: gates the audience, refuses a '
  'product with the waitlist off, and either writes a waitlisted participation '
  'stamped with clock_timestamp() or returns the waitlisted/reserving/active '
  'row already there. Returns participation_id, waitlist_position (0 when the '
  'row already holds a seat rather than a place in line), status, and '
  'idempotent — false only on the call that ran the INSERT, true on a call that '
  'recognised an existing row. Anything that must happen exactly once per place '
  'in line (the confirmation email) keys on idempotent=false; the flag is the '
  'only way to tell a replay apart, since both answers are otherwise identical. '
  'No EXECUTE grant to anyone: the guarded wrapper is the only caller.';

-- No grant, unchanged since 00126: join_waitlist is reachable only from another
-- SECURITY DEFINER function inside the database, so nothing outside it executes
-- this. The REVOKE is re-issued because a replaced body is a good moment to
-- re-assert the posture, and it costs one statement.
REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid, uuid) FROM PUBLIC;

-- Assert the end state rather than trusting that the replacement above landed
-- the way it reads. Apply-time protection: it says what was true when 00190
-- ran, and nothing about later migrations.
DO $$
DECLARE
  v_src TEXT;
BEGIN
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.join_waitlist(uuid, uuid, uuid)'::regprocedure);

  -- Both return sites, counted rather than merely present: an optional flag is
  -- worse than no flag, because `!idempotent` would then pass on the branch
  -- that forgot it. The existing-row branch is the only TRUE and the
  -- fresh-insert branch is the only FALSE.
  IF (length(v_src) - length(replace(v_src, '''idempotent'', TRUE', ''))) / length('''idempotent'', TRUE') <> 1 THEN
    RAISE EXCEPTION 'join_waitlist must report idempotent=TRUE on exactly the existing-row return';
  END IF;
  IF (length(v_src) - length(replace(v_src, '''idempotent'', FALSE', ''))) / length('''idempotent'', FALSE') <> 1 THEN
    RAISE EXCEPTION 'join_waitlist must report idempotent=FALSE on exactly the fresh-insert return';
  END IF;

  -- The parts that were transcribed, not rewritten. A replacement that dropped
  -- the ordering stamp or the audience gate would still compile and still
  -- return the new flag.
  IF v_src NOT LIKE '%clock_timestamp()%' THEN
    RAISE EXCEPTION 'join_waitlist lost its clock_timestamp() ordering stamp';
  END IF;
  IF v_src NOT LIKE '%waitlist_enabled%' THEN
    RAISE EXCEPTION 'join_waitlist lost its waitlist_enabled gate';
  END IF;
  IF v_src NOT LIKE '%parent_gamer%' THEN
    RAISE EXCEPTION 'join_waitlist lost its parent-of-gamer check';
  END IF;

  -- The engine stays unreachable from outside the database; only the guarded
  -- wrapper is callable, and it is callable exactly as before.
  IF has_function_privilege('authenticated', 'public.join_waitlist(uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.join_waitlist(uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.join_waitlist(uuid, uuid, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'join_waitlist is executable outside the database — the engine is reachable only from join_product_waitlist';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.join_product_waitlist(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lost EXECUTE on join_product_waitlist';
  END IF;
END;
$$;
