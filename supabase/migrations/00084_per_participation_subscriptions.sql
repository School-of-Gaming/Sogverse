-- Per-participation subscriptions: one Stripe subscription per (gamer, club)
-- participation, replacing the shared "family sub" model (one Stripe sub per
-- (customer, currency) with one item per club).
--
-- Why (see docs/products-architecture.md §4.5b / §4.5c / §5.7a):
--   * Always send the parent through Stripe Checkout — even with a saved card —
--     for the trust/safety moment. The old model could only do this for the
--     first club; every later club was an inline `subscriptions.update`.
--   * Per-club cancellation via Stripe's hosted portal. The portal can only
--     cancel a whole subscription, and disables item editing for multi-item
--     subs — so one sub per participation makes each club independently
--     cancelable from the portal, with no in-app per-item removal needed.
--   * Unlocks deferred billing later (anchor each sub to its product's start
--     date) — impossible to do per-club on one shared family sub. See TODO.md.
--
-- The table KEEPS the name `family_subscriptions`, but a row now means "one
-- gamer in one club", not "one family's whole bill". The `family_subscription_items`
-- join table is dropped — the link to the participation moves onto the row.
--
-- Data: prod has zero subscription rows (no-op there). Staging's are fake test
-- data; this migration wipes them (and the consumer-club participations they
-- back) for a clean slate — testers re-subscribe through the new always-Checkout
-- flow. Camp/event single-payment participations and all payments/refunds rows
-- are untouched.

-- =============================================================================
-- 1. Clean slate — drop the fake subscription data (and the participations it
--    backs). Deleting the participations CASCADEs to family_subscription_items
--    via the item table's ON DELETE CASCADE on participation_id.
-- =============================================================================

DELETE FROM public.participations p
  USING public.family_subscription_items fsi
  WHERE fsi.participation_id = p.id;

-- Any remaining (orphan) sub rows — all fake — go too.
DELETE FROM public.family_subscriptions;

-- =============================================================================
-- 2. Drop the item join table. CASCADE clears its RLS policies, grants, and FKs.
--    `cancel_participation` (the only surviving function that referenced it) is
--    recreated below to read the new shape.
-- =============================================================================

DROP TABLE public.family_subscription_items CASCADE;

-- =============================================================================
-- 3. Reshape `family_subscriptions` to be per-participation.
-- =============================================================================

-- One sub per family/currency is no longer the rule — drop that uniqueness.
ALTER TABLE public.family_subscriptions
  DROP CONSTRAINT family_subscriptions_customer_id_currency_key;

-- Link the row directly to its participation, and snapshot the Stripe Price the
-- sub references (the immutable Price the gamer was subscribed at). The table is
-- empty after step 1, so the NOT NULL add is safe.
ALTER TABLE public.family_subscriptions
  ADD COLUMN participation_id UUID NOT NULL
    REFERENCES public.participations(id) ON DELETE CASCADE,
  ADD COLUMN stripe_price_id TEXT;

-- Exactly one sub per participation.
ALTER TABLE public.family_subscriptions
  ADD CONSTRAINT family_subscriptions_participation_id_key UNIQUE (participation_id);

CREATE INDEX idx_family_subscriptions_participation
  ON public.family_subscriptions(participation_id);

-- =============================================================================
-- 4. Recreate `cancel_participation` for the new shape.
--
--    It no longer reads the dropped item table. It reads the linked Stripe
--    subscription id off `family_subscriptions` (so an admin-initiated cancel
--    can cancel the whole Stripe sub) and hard-deletes the participation, which
--    CASCADEs the `family_subscriptions` row away.
--
--    Customer-initiated cancellation is portal-only: the parent cancels in
--    Stripe's hosted portal, Stripe fires `customer.subscription.deleted`, and
--    the webhook calls this RPC to tear the participation down — so this path
--    must NOT call Stripe to cancel again (Stripe already did).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id              UUID;
  v_status                  public.participation_status;
  v_stripe_subscription_id  TEXT;
BEGIN
  SELECT product_id, status
    INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Read the linked Stripe sub id before the delete (CASCADE removes the row).
  SELECT stripe_subscription_id
    INTO v_stripe_subscription_id
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
    LIMIT 1;

  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'stripe_subscription_id', v_stripe_subscription_id,
    'reason', p_reason
  );
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.cancel_participation(uuid, text) FROM authenticated, anon, public;
