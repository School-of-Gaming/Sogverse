-- Extensions, shared helpers, and schema grants

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Shared trigger function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================================
-- Schema grants
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
