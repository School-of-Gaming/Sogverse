-- Seed data for development
-- Note: This file is for local development only
-- User accounts should be created through the application

-- Insert sample products
INSERT INTO products (name, description, price, currency, is_active, metadata) VALUES
  ('Gaming Starter Pack', 'Perfect introduction to educational gaming with 5 beginner-friendly games', 29.99, 'USD', true, '{"category": "starter", "age_range": "6-10"}'),
  ('Pro Gamer Bundle', 'Advanced gaming package with 10 challenging games and tutorials', 49.99, 'USD', true, '{"category": "advanced", "age_range": "10-14"}'),
  ('Educator Toolkit', 'Complete toolkit for game educators including curriculum guides', 99.99, 'USD', true, '{"category": "education", "for_educators": true}'),
  ('Family Pack', 'Includes access for up to 4 gamers with parent dashboard', 79.99, 'USD', true, '{"category": "family", "max_gamers": 4}'),
  ('Monthly Subscription', 'Access to all games and new releases every month', 9.99, 'USD', true, '{"category": "subscription", "billing_period": "monthly"}'),
  ('Annual Subscription', 'Full year access at a discounted rate', 99.99, 'USD', true, '{"category": "subscription", "billing_period": "annual"}')
ON CONFLICT DO NOTHING;

-- Note: To create test users, use the Supabase Auth API or the application
-- Example users for testing (create via Auth):
-- admin@sogverse.com (role: admin)
-- parent@test.com (role: customer)
-- educator@test.com (role: gedu)
-- testgamer (role: gamer, email: testgamer@gamer.sogverse.internal)
