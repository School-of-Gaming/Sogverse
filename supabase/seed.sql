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

-- =============================================================================
-- 1. Test Users (auth.users → triggers handle_new_user → profiles + extensions)
-- =============================================================================

-- Admin (trigger assigns customer; promoted below in section 2)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@test.local',
  crypt('testpassword123', gen_salt('bf')),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('display_name', 'Test Admin'),
  '', '', '', '',
  NOW(), NOW()
);
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
  encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'customer@test.local',
  crypt('testpassword123', gen_salt('bf')),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('role', 'customer', 'display_name', 'Test Customer'),
  '', '', '', '',
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

-- Gedu (trigger assigns customer; promoted below in section 2)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'gedu@test.local',
  crypt('testpassword123', gen_salt('bf')),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('display_name', 'Test Gedu'),
  '', '', '', '',
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

-- Gamer (trigger assigns customer; promoted below in section 2)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'testgamer@gamer.sogverse.internal',
  crypt('testpassword123', gen_salt('bf')),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('display_name', 'Test Gamer'),
  '', '', '', '',
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
  encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'customer2@test.local',
  crypt('testpassword123', gen_salt('bf')),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('role', 'customer', 'display_name', 'Test Customer 2'),
  '', '', '', '',
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

-- Gamer 2 (second gamer linked to customer 1 — needed for v2 race / waitlist
-- monotonicity tests where two distinct (customer, gamer) pairs are required.
-- Linked to customer 1 because the join_waitlist_v2 idempotency check is keyed
-- on gamer_id alone, so distinct gamers — not distinct customers — are what
-- yields independent rows.)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'testgamer2@gamer.sogverse.internal',
  crypt('testpassword123', gen_salt('bf')),
  NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('display_name', 'Test Gamer 2'),
  '', '', '', '',
  NOW(), NOW()
);
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000006',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000006', 'email', 'testgamer2@gamer.sogverse.internal'),
  'email', '00000000-0000-0000-0000-000000000006',
  NOW(), NOW(), NOW()
);

-- =============================================================================
-- 2. Promote non-customer roles (trigger defaults ALL users to customer)
-- =============================================================================

-- Promote admin: update role, remove customer_profiles row the trigger created
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-000000000001';
DELETE FROM customer_profiles WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Promote gedu: update role, remove customer_profiles row the trigger created
UPDATE profiles SET role = 'gedu' WHERE id = '00000000-0000-0000-0000-000000000003';
DELETE FROM customer_profiles WHERE user_id = '00000000-0000-0000-0000-000000000003';

-- Promote gamer: update role/email/username, swap extension tables
UPDATE profiles SET role = 'gamer', email = NULL, username = 'testgamer'
WHERE id = '00000000-0000-0000-0000-000000000004';
DELETE FROM customer_profiles WHERE user_id = '00000000-0000-0000-0000-000000000004';
INSERT INTO gamer_profiles (user_id, date_of_birth, gender)
VALUES ('00000000-0000-0000-0000-000000000004', '2015-06-15', 'boy');

-- Promote gamer 2 (mirrors gamer 1 promotion)
UPDATE profiles SET role = 'gamer', email = NULL, username = 'testgamer2'
WHERE id = '00000000-0000-0000-0000-000000000006';
DELETE FROM customer_profiles WHERE user_id = '00000000-0000-0000-0000-000000000006';
INSERT INTO gamer_profiles (user_id, date_of_birth, gender)
VALUES ('00000000-0000-0000-0000-000000000006', '2016-03-20', 'girl');

-- =============================================================================
-- 3. Patch extension tables (trigger creates them with defaults)
-- =============================================================================

-- Give customer 1 some tokens for testing
UPDATE customer_profiles SET token_balance = 20 WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- =============================================================================
-- 4. Parent-Gamer Link
-- =============================================================================

INSERT INTO parent_gamer (id, parent_id, gamer_id) VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000002', -- customer 1
  '00000000-0000-0000-0000-000000000004'  -- gamer
);

INSERT INTO parent_gamer (id, parent_id, gamer_id) VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000002', -- customer 1
  '00000000-0000-0000-0000-000000000006'  -- gamer 2
);

-- =============================================================================
-- 5. Game, Product, Group
-- =============================================================================

-- Test game (the 'Unassigned' game with id ...001 is already created by migration 00016)
INSERT INTO games (id, name) VALUES (
  '00000000-0000-0000-0000-000000000010', 'Test Game'
);

-- Test product (Wednesday = 3, 15:00 Europe/Helsinki, token_cost=2, visible)
-- Note: is_visible was renamed from is_active in migration 00021
-- is_remote/location_id/spoken_language_code added in migration 00024
INSERT INTO products (id, name, description, image_path, is_visible, created_by, game_id, day_of_week, start_time, timezone, duration_minutes, min_age, max_age, token_cost, is_remote, location_id, spoken_language_code) VALUES (
  '00000000-0000-0000-0000-000000000020',
  'Test Product',
  'A test product for DB integration tests',
  'test-product.jpg',
  true,
  '00000000-0000-0000-0000-000000000001', -- admin created it
  '00000000-0000-0000-0000-000000000010', -- Test Game
  3,      -- Wednesday
  '15:00', -- 3 PM
  'Europe/Helsinki',
  60,     -- 1 hour
  6,      -- min age
  12,     -- max age
  2,      -- token cost
  true,   -- is_remote (seeded test product is remote — in-person variants are created per-test)
  NULL,   -- location_id
  'en'    -- spoken_language_code (seeded by migration 00018)
);

-- Test group (gedu assigned to the test product)
INSERT INTO product_groups (id, product_id, gedu_id, display_order) VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000020', -- Test Product
  '00000000-0000-0000-0000-000000000003', -- Test Gedu
  0
);

-- Voice room for the test group (matches what commit_group_changes would create)
INSERT INTO voice_rooms (group_id, room_type, name, daily_room_name) VALUES (
  '00000000-0000-0000-0000-000000000030', -- Test Group
  'group',
  'Test Product',
  'group-00000000'
);

-- NOTE: Enrollments are NOT seeded here — they are mutable test state.
-- Test files that need enrollments create them via seedEnrollment() or the
-- enroll_gamer_in_group RPC. This prevents cross-file interference.

-- =============================================================================
-- 6. Locations (for product-location and gedu-coverage tests)
-- =============================================================================
-- Finland -> Uusimaa (region) -> Helsinki (municipality) -> Test School (site).
-- The site is the leaf referenced by product-location tests.

INSERT INTO locations (id, name, type, parent_id, country_code) VALUES
  ('00000000-0000-0000-0000-000000000200', 'Finland',     'country',      NULL,                                   'FI'),
  ('00000000-0000-0000-0000-000000000201', 'Uusimaa',     'region',       '00000000-0000-0000-0000-000000000200', 'FI'),
  ('00000000-0000-0000-0000-000000000202', 'Helsinki',    'municipality', '00000000-0000-0000-0000-000000000201', 'FI'),
  ('00000000-0000-0000-0000-000000000203', 'Test School', 'site',         '00000000-0000-0000-0000-000000000202', 'FI');

-- =============================================================================
-- 7. Feedback Submissions
-- =============================================================================

INSERT INTO feedback_submissions (user_id, message) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Test feedback from customer');
