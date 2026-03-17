-- Add subscription_tier to customer_profiles.
-- Stores the Stripe Product ID of the active subscription tier.
-- NULL when no subscription is active.
ALTER TABLE customer_profiles ADD COLUMN subscription_tier TEXT;
