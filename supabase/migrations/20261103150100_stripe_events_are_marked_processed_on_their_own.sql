-- Stripe events are marked processed on their own.
--
-- The products webhook read "a payments row carries this event id" as "this
-- event is fully processed", which made a payment row double as a commit marker:
-- a checkout that collected nothing still wrote a €0 payment, only so a
-- redelivery would find it. The marker now has a table of its own, and a payment
-- row records money and nothing else.
--
-- 1. `stripe_processed_events`: one row per Stripe event the webhook finished
--    handling, written after its last write.
-- 2. Every event id a payments row already carries is copied in, so a
--    redelivery of an event processed before this change is still recognised.
--
-- The €0 payment rows already written as markers are kept. The Klaviyo profile
-- snapshot reads payments for `sog_first_payment_at` and `sog_last_payment_at`,
-- and a segment keys "new customer" on the first of them, so deleting those rows
-- would move or empty both dates for every family whose first checkout cost
-- nothing. Whether to do that is the owner's call, not a side effect of this one.

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
