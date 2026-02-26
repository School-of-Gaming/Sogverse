-- =============================================================================
-- Seed data for local Supabase (supabase db reset)
-- Uses deterministic UUIDs in the 00000000-0000-0000-0000-0000000000xx range
-- that never collide with real user data.
--
-- The handle_new_user() trigger auto-creates profiles + extension tables
-- from auth.users inserts, so we only need to insert into auth.users here,
-- then patch any extra fields (token_balance, gamer details) afterward.
-- =============================================================================

-- All test users use this password: testpassword123
-- Supabase local auth stores bcrypt hashes with the $2a$ prefix.
-- This hash corresponds to 'testpassword123':
-- $2a$10$PznXOAYBEgjKztMnmKSbCe8sNBqDqEBjqCOdCJmmp.0aL3FHkmuSa

-- =============================================================================
-- 1. Test Users (auth.users → triggers handle_new_user → profiles + extensions)
-- =============================================================================

-- Admin
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, confirmation_sent_at,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@test.local',
  '$2a$10$PznXOAYBEgjKztMnmKSbCe8sNBqDqEBjqCOdCJmmp.0aL3FHkmuSa',
  NOW(), NOW(),
  jsonb_build_object('role', 'admin', 'display_name', 'Test Admin'),
  NOW(), NOW()
);

-- Also insert into auth.identities (required for sign-in to work)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'admin@test.local'),
  'email', '00000000-0000-0000-0000-000000000001',
  NOW(), NOW(), NOW()
);

-- Customer 1
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, confirmation_sent_at,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'customer@test.local',
  '$2a$10$PznXOAYBEgjKztMnmKSbCe8sNBqDqEBjqCOdCJmmp.0aL3FHkmuSa',
  NOW(), NOW(),
  jsonb_build_object('role', 'customer', 'display_name', 'Test Customer'),
  NOW(), NOW()
);
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'customer@test.local'),
  'email', '00000000-0000-0000-0000-000000000002',
  NOW(), NOW(), NOW()
);

-- Gedu
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, confirmation_sent_at,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'gedu@test.local',
  '$2a$10$PznXOAYBEgjKztMnmKSbCe8sNBqDqEBjqCOdCJmmp.0aL3FHkmuSa',
  NOW(), NOW(),
  jsonb_build_object('role', 'gedu', 'display_name', 'Test Gedu'),
  NOW(), NOW()
);
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000003',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003', 'email', 'gedu@test.local'),
  'email', '00000000-0000-0000-0000-000000000003',
  NOW(), NOW(), NOW()
);

-- Gamer (synthetic email → handle_new_user sets role=gamer, email=NULL, username extracted)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, confirmation_sent_at,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'testgamer@gamer.sogverse.internal',
  '$2a$10$PznXOAYBEgjKztMnmKSbCe8sNBqDqEBjqCOdCJmmp.0aL3FHkmuSa',
  NOW(), NOW(),
  jsonb_build_object('display_name', 'Test Gamer'),
  NOW(), NOW()
);
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000004',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'email', 'testgamer@gamer.sogverse.internal'),
  'email', '00000000-0000-0000-0000-000000000004',
  NOW(), NOW(), NOW()
);

-- Customer 2 (for cross-customer auth tests)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, confirmation_sent_at,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'customer2@test.local',
  '$2a$10$PznXOAYBEgjKztMnmKSbCe8sNBqDqEBjqCOdCJmmp.0aL3FHkmuSa',
  NOW(), NOW(),
  jsonb_build_object('role', 'customer', 'display_name', 'Test Customer 2'),
  NOW(), NOW()
);
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000005',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000005', 'email', 'customer2@test.local'),
  'email', '00000000-0000-0000-0000-000000000005',
  NOW(), NOW(), NOW()
);

-- =============================================================================
-- 2. Patch extension tables (trigger creates them with defaults)
-- =============================================================================

-- Give customer 1 some tokens for testing
UPDATE customer_profiles SET token_balance = 20 WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- Set gamer profile details
UPDATE gamer_profiles SET
  date_of_birth = '2015-06-15',
  gender = 'boy'
WHERE user_id = '00000000-0000-0000-0000-000000000004';

-- =============================================================================
-- 3. Parent-Gamer Link
-- =============================================================================

INSERT INTO parent_gamer (id, parent_id, gamer_id) VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000002', -- customer 1
  '00000000-0000-0000-0000-000000000004'  -- gamer
);

-- =============================================================================
-- 4. Game, Product, Group
-- =============================================================================

-- Test game (the 'Unassigned' game with id ...001 is already created by migration 00016)
INSERT INTO games (id, name) VALUES (
  '00000000-0000-0000-0000-000000000010', 'Test Game'
);

-- Test product (Wednesday = 3, 15:00 Europe/Helsinki, token_cost=2, visible)
INSERT INTO products (id, name, description, image_url, is_visible, created_by, game_id, day_of_week, start_time, timezone, duration_minutes, min_age, max_age, token_cost) VALUES (
  '00000000-0000-0000-0000-000000000020',
  'Test Product',
  'A test product for DB integration tests',
  'https://example.com/test.png',
  true,
  '00000000-0000-0000-0000-000000000001', -- admin created it
  '00000000-0000-0000-0000-000000000010', -- Test Game
  3,      -- Wednesday
  '15:00', -- 3 PM
  'Europe/Helsinki',
  60,     -- 1 hour
  6,      -- min age
  12,     -- max age
  2       -- token cost
);

-- Test group (gedu assigned to the test product)
INSERT INTO product_groups (id, product_id, gedu_id, display_order) VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000020', -- Test Product
  '00000000-0000-0000-0000-000000000003', -- Test Gedu
  0
);
