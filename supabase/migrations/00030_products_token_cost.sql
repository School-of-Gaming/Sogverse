-- Add token_cost (default 0 for existing rows)
ALTER TABLE products ADD COLUMN token_cost INTEGER NOT NULL DEFAULT 0 CHECK (token_cost >= 0);
-- Drop the default so new rows must supply explicitly
ALTER TABLE products ALTER COLUMN token_cost DROP DEFAULT;

-- Drop unused Stripe/currency columns and index
DROP INDEX IF EXISTS idx_products_stripe;
ALTER TABLE products DROP COLUMN stripe_product_id;
ALTER TABLE products DROP COLUMN stripe_price_id;
ALTER TABLE products DROP COLUMN currency;
ALTER TABLE products DROP COLUMN price;
