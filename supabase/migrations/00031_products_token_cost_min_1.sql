-- Tighten token_cost constraint: no free products (must be >= 1)

-- First update any existing rows that have token_cost = 0 (from the default in 00030)
UPDATE products SET token_cost = 1 WHERE token_cost = 0;

-- Then replace the >= 0 check with >= 1
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_token_cost_check;
ALTER TABLE products ADD CONSTRAINT products_token_cost_check CHECK (token_cost >= 1);
