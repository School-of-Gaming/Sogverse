-- Stripe events are marked processed on their own, and a payment is money.
--
-- The products webhook read "a payments row carries this event id" as "this
-- event is fully processed", which made a payment row double as a commit marker:
-- a checkout that collected nothing still wrote a €0 payment, only so a
-- redelivery would find it. The marker now has a table of its own, and a payment
-- row records money that actually moved and nothing else.
--
-- 1. `stripe_processed_events`: one row per Stripe event the webhook finished
--    handling, written after its last write.
-- 2. Every event id a payments row already carries is copied in, €0 rows
--    included, so a redelivery of an event processed before this change is
--    still recognised.
-- 3. The €0 payment rows, which recorded no money, are deleted, and the amount
--    CHECK tightens from "not negative" to "positive" so none is written again.
--    Nothing fires on a payments delete. Their parents are filed in the Klaviyo
--    profile outbox, because the snapshot's first and last payment and lifetime
--    totals are read from payments and move for every family whose first
--    checkout cost nothing: `sog_first_payment_at` becomes the first money they
--    paid. Commitment and a free seat are told apart in Klaviyo by the
--    `SV Enrolled` event's billing_mode, not by a payment.

CREATE TABLE public.stripe_processed_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_processed_events IS 'One row per Stripe event the products webhook has finished handling: the route checks it before handling an event and writes it after the handler''s last write, so a redelivery of a finished event does nothing and one that died part-way runs again (every write it makes is idempotent on replay; the UNIQUE on payments.stripe_event_id is the net under the payment). Holds only the four event types the route handles, whether or not an event turned out to concern us. Events finished before this table existed were copied in from payments.stripe_event_id, typed from the row''s shape and stamped with its created_at. Service role only.';

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.stripe_processed_events TO service_role;

-- A renewal row carries the invoice's billing reason and its subscription, and
-- never the product a checkout names; everything else came from a checkout.
INSERT INTO public.stripe_processed_events (stripe_event_id, event_type, processed_at)
SELECT pay.stripe_event_id,
       CASE
         WHEN pay.metadata ? 'billingReason'
           OR (pay.metadata ? 'stripeSubscriptionId'
               AND NOT pay.metadata ? 'productId')
         THEN 'invoice.paid'
         ELSE 'checkout.session.completed'
       END,
       pay.created_at
  FROM public.payments pay;

-- The parents whose snapshot moves, read before their rows go.
SELECT public.enqueue_klaviyo_profiles(ARRAY(
  SELECT DISTINCT pay.customer_id
    FROM public.payments pay
   WHERE pay.amount_cents = 0
));

DELETE FROM public.payments WHERE amount_cents = 0;

ALTER TABLE public.payments
  DROP CONSTRAINT payments_amount_cents_check,
  ADD CONSTRAINT payments_amount_cents_check CHECK (amount_cents > 0);

COMMENT ON CONSTRAINT payments_amount_cents_check ON public.payments IS 'A payment is money that moved: a checkout or an invoice settled at €0 records no payment, and the products webhook marks its event processed in stripe_processed_events instead.';
