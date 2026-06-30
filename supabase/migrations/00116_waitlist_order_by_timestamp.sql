-- Waitlist ordering: explicit position → join timestamp; drop dead promote stub.
--
-- Two related changes to the waitlist model:
--
-- 1. DROP promote_from_waitlist. It shipped as a forward-looking, read-only
--    stub for an automatic seat-opens→promote flow that we've decided not to
--    build. It has zero callers and the wrong shape for the manual admin-driven
--    promotion we'll add later (which will be a mutating RPC under the product
--    lock). Keeping it around is misleading, so it goes; we add a correct one
--    when the admin promote UI is built.
--
-- 2. Replace participations.waitlist_position (int, MAX+1 at join) with
--    waitlisted_at (timestamptz, stamped at join). Order is now DERIVED from the
--    timestamp (ORDER BY waitlisted_at, id), not stored as a dense rank. This
--    suits manual, possibly out-of-order promotion: removing or promoting a
--    waitlisted row leaves nothing to renumber, and the timestamp is an
--    immutable fact rather than a rank that drifts. The id tiebreaker makes the
--    order a strict total even on a (lock-serialized, so near-impossible)
--    timestamp tie.
--
-- Order-preserving + safe on populated environments: existing waitlisted rows
-- backfill waitlisted_at from created_at (positions were assigned in creation
-- order, so this preserves their relative order) before the column is dropped.

DROP FUNCTION IF EXISTS public.promote_from_waitlist(uuid);

-- New column, backfilled for any existing waitlisted rows, then made
-- required-for-waitlisted via CHECK (mirrors the old position constraint).
ALTER TABLE public.participations
  ADD COLUMN waitlisted_at timestamp with time zone;

UPDATE public.participations
  SET waitlisted_at = created_at
  WHERE status = 'waitlisted';

ALTER TABLE public.participations
  ADD CONSTRAINT chk_participations_waitlisted_has_timestamp
  CHECK ((status <> 'waitlisted'::public.participation_status)
         OR (waitlisted_at IS NOT NULL));

-- Drop the old position column, its constraint, and its index.
ALTER TABLE public.participations
  DROP CONSTRAINT chk_participations_waitlisted_has_position;
DROP INDEX IF EXISTS public.idx_participations_waitlisted;
ALTER TABLE public.participations
  DROP COLUMN waitlist_position;

-- Partial index supporting waitlist ordering reads (ORDER BY waitlisted_at).
CREATE INDEX idx_participations_waitlisted
  ON public.participations USING btree (product_id, waitlisted_at)
  WHERE (status = 'waitlisted'::public.participation_status);

-- Rewrite join_waitlist to stamp waitlisted_at. The returned waitlist_position
-- is the DERIVED rank at this instant (count of waitlisted rows ordered before
-- this one, ties broken by id) — convenient for a "you're #N" confirmation;
-- every other surface recomputes it at read time. CREATE OR REPLACE keeps the
-- existing grant to service_role.
CREATE OR REPLACE FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) RETURNS jsonb
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

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
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
      'status', v_existing_status::text
    );
  END IF;

  -- Stamp the join time; order is derived from it, never stored as a rank.
  v_now := now();
  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted'
  );
END;
$$;
