-- The pre-bookings checkout path is gone.
--
-- Every Checkout Session is now created after its booking and carries the
-- booking's id, and Stripe's redelivery window for Sessions created before
-- bookings has closed, so nothing calls the two functions that served them and
-- nothing reads the column the old confirmation page found a seat by. A seat's
-- Checkout Session is on its booking, bookings.stripe_checkout_session_id.
-- Dropping the column drops its unique index with it.

DROP FUNCTION public.confirm_paid_participation(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean);

DROP FUNCTION public.create_participation(
  uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean);

ALTER TABLE public.participations DROP COLUMN stripe_checkout_session_id;
