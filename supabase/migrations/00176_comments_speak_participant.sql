-- Two schema comments still spoke of the seat model's previous world —
-- vocabulary rot flagged while closing out the products-for-parents plan.
-- The column comment called a parent seat "the next step" (it shipped), and
-- the confirm-paid comment said "gamer" for a participant who may now be the
-- buyer themselves. Comments only; no behavior, no ACL, no signature changes.

COMMENT ON COLUMN public.participations.participant_id IS
  'The profile occupying this seat: a gamer enrolled by their parent, or — on '
  'a product whose audience admits adults — the paying customer themselves '
  '(participant_id = customer_id is what a self seat looks like). The column '
  'is named for what it means rather than for any one role that fills it.';

COMMENT ON FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text) IS
  'Creates the active participation for a paid signup once Stripe confirms '
  'payment. service_role only — the arguments come from Checkout Session '
  'metadata we wrote. Deliberately audience-ungated: validation happened '
  'before the money, and this after-money recorder refusing would strand a '
  'charge with no seat. Returns kind=confirmed with participation_id '
  '(idempotent=true when this same session already bought the seat), or '
  'kind=duplicate_payment with existing_participation_id when a different '
  'payment already put this participant on this product.';

-- End-state assertion: both comments carry the new vocabulary and neither
-- carries its stale phrase. Each arm can fail independently — a wrong or
-- missing comment raises rather than passing silently.
DO $assert$
DECLARE
  v_col  text;
  v_fn   text;
BEGIN
  SELECT col_description('public.participations'::regclass, attnum)
    INTO v_col
    FROM pg_attribute
   WHERE attrelid = 'public.participations'::regclass
     AND attname = 'participant_id';

  IF v_col IS NULL OR v_col NOT LIKE '%self seat%' THEN
    RAISE EXCEPTION 'participations.participant_id comment missing or not updated';
  END IF;
  IF v_col LIKE '%the next step%' THEN
    RAISE EXCEPTION 'participations.participant_id comment still calls parent seats the next step';
  END IF;

  SELECT obj_description(p.oid)
    INTO v_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'confirm_paid_participation';

  IF v_fn IS NULL OR v_fn NOT LIKE '%this participant on this product%' THEN
    RAISE EXCEPTION 'confirm_paid_participation comment missing or not updated';
  END IF;
  IF v_fn LIKE '%this gamer on this product%' THEN
    RAISE EXCEPTION 'confirm_paid_participation comment still says gamer';
  END IF;
END
$assert$;
