-- Drop the orphaned `family_subscriptions.discount_coupon_id` column.
--
-- It was added for a family multi-child discount (the FAMILY_DISCOUNT_PERCENT
-- constant) that was never wired up: no Stripe coupon was ever created and the
-- column was always NULL. The constant has been deleted from the codebase, so
-- the column is now fully dead. No data is lost (every row holds NULL).

ALTER TABLE public.family_subscriptions DROP COLUMN IF EXISTS discount_coupon_id;
