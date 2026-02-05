-- Migration: Create products table
-- Description: Products available for purchase with Stripe integration support

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  currency TEXT DEFAULT 'USD',
  image_url TEXT,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active products
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = true;

-- Index for Stripe lookups
CREATE INDEX idx_products_stripe ON products(stripe_product_id) WHERE stripe_product_id IS NOT NULL;

-- Apply updated_at trigger
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function to get active products
CREATE OR REPLACE FUNCTION get_active_products()
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON TABLE products IS 'Products available for purchase';
COMMENT ON COLUMN products.stripe_product_id IS 'Stripe product ID for payment integration';
COMMENT ON COLUMN products.stripe_price_id IS 'Stripe price ID for payment integration';
COMMENT ON COLUMN products.metadata IS 'Additional product metadata as JSON';
