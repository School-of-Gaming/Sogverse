-- =============================================================================
-- Rich example seed — a realistic catalogue for reviewing UI on a local stack
-- =============================================================================
--
-- WHAT THIS IS FOR. `seed.sql` is the deliberately minimal fixture set the DB
-- tests are written against. This file is the opposite: it fills a local
-- database with enough of a catalogue that the admin, gedu and family
-- dashboards look like a real platform — products of every type and lifecycle
-- state, families with children, certified and uncertified educators, groups
-- with sessions, reports, attendance, feedback and a substitution. It exists so
-- a human can look at the UI. Nothing asserts anything here.
--
-- CI NEVER LOADS IT. It is not named in `config.toml` — `seed.sql` is the CLI's
-- default seed and stays the only one the CLI loads — and no CI job applies it.
-- The local stack script applies it after `seed.sql`; by hand that is
--
--     psql -v ON_ERROR_STOP=1 -f supabase/rich-seed.sql
--
-- against a local database that has already been seeded. It expects `seed.sql`
-- to have run — not for anything it borrows, but because a database without
-- those fixtures is not the local database this file is for — and it is written
-- to be applied ONCE to a fresh one: the guard below refuses a second run, or a
-- run against any populated database, before a single row is written.
--
-- PRICES ONLY HAVE TO RENDER. A local stack's users do not exist in Stripe's
-- test mode, so this seed creates NOTHING in Stripe: the paid seats below are
-- written through the same RPC the Stripe webhook calls, with a made-up
-- checkout-session id. Checkout and billing are still verified on staging.
--
-- IT CALLS THE REAL RPCs. Everything product-shaped goes through the admin,
-- family and gedu RPCs under impersonated claims, never a hand-INSERT — so when
-- one of those contracts changes, bringing a stack up fails loudly here and is
-- fixed then. Accounts are the one exception: they are direct `auth.users` /
-- `auth.identities` inserts exactly as `seed.sql` does them.
--
-- THE PICTURES ARE NOT IN HERE. A product's picture is a `product_images`
-- catalogue entry naming an object in the `product-images` storage bucket by
-- the sha256 of its bytes, so no amount of SQL can mint one — the bytes have to
-- be uploaded first. `scripts/local-db/rich-images.sh` does that, and the local
-- stack runs it straight after this file. Applying this file by hand leaves
-- every product on its placeholder.
--
-- SIGNING IN. Three accounts are the ones to look at the app through, and they
-- share the password `password`:
--
--     admin@example.com    Admin Example    the admin who owns the catalogue
--     parent@example.com   Parent Example   three children, PIN 1111
--     gedu@example.com     Gedu Example     certified, the busiest teaching load
--
-- Every other account this file creates exists to fill lists, and they all
-- share `seed.sql`'s password, `testpassword123`. `seed.sql`'s own fixtures are
-- untouched and keep theirs.
--
-- IDS ARE GENERATED, NEVER WRITTEN OUT. Every account gets `gen_random_uuid()`,
-- because the avatar identicon derives its pattern from the id's hex bytes and
-- a hand-written id — all ones, all twos — draws a degenerate face that is not
-- what anyone will see in production. Nothing here may therefore name an
-- account by id: the email is the handle, and an id is read back out of
-- `public.profiles` wherever one is needed.
-- =============================================================================

\set ON_ERROR_STOP on

SET client_encoding TO 'UTF8';

-- =============================================================================
-- 0. Where this may run
-- =============================================================================
-- A freshly seeded local database, and nowhere else. Three cheap facts say so:
-- seed.sql's admin is present with the admin role (so seed.sql has run against
-- this database), the database holds only a handful of users (so it is not a
-- real environment), and this file's own admin account is absent (so this is
-- not a second run — its 40 accounts leave the count well under the limit
-- below, so the count alone would not notice). Any of the three failing stops
-- the script before its first write.
--
-- The second-run check is on the EMAIL, not on an id: this file writes no id it
-- could recognise later, which is the point of the header's ids rule.

DO $$
DECLARE
  users bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = '00000000-0000-0000-0000-000000000001' AND role = 'admin'
  ) THEN
    RAISE EXCEPTION
      'rich-seed.sql is for a freshly seeded local database only: seed.sql''s admin account is not here, so seed.sql has not run against this database.';
  END IF;

  SELECT count(*) INTO users FROM auth.users;
  IF users >= 50 THEN
    RAISE EXCEPTION
      'rich-seed.sql is for a freshly seeded local database only: this database already holds % users.', users;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@example.com') THEN
    RAISE EXCEPTION
      'rich-seed.sql is for a freshly seeded local database only: its accounts are already here, so this is a second run. Reset the database and seed it again.';
  END IF;
END
$$;

-- =============================================================================
-- 1. Accounts
-- =============================================================================
-- Direct auth inserts, the way seed.sql does them: the handle_new_user()
-- trigger turns each one into a `customer` profile, and the RPCs below promote
-- it. The one account promoted by hand is the admin — no RPC mints one, so the
-- `create-admin-account` skill's shape is what this follows: an auth user, then
-- the profile promoted over psql.
--
-- The id is the helper's to choose and nobody else's. Callers pass an email.

CREATE FUNCTION pg_temp.account(
  p_email text, p_first text, p_last text, p_password text DEFAULT 'testpassword123'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    created_at, updated_at
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('first_name', p_first, 'last_name', p_last),
    '', '', '', '',
    now(), now()
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_id, v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email),
    'email', v_id::text,
    now(), now(), now()
  );

  RETURN v_id;
END;
$$;

BEGIN;

-- The owner's admin. Everything admin-gated below runs as this account, so the
-- catalogue, the venues, the groups and the comped seats all read as its work
-- rather than as the DB tests' fixture admin's.
DO $$
DECLARE v_admin uuid := pg_temp.account('admin@example.com', 'Admin', 'Example', 'password');
BEGIN
  UPDATE public.profiles SET role = 'admin', email_verified_at = now()
   WHERE id = v_admin;
  DELETE FROM public.customer_profiles WHERE user_id = v_admin;
END;
$$;

-- Educators. Five are certified below, two are not: a brand-new hire whose
-- record check is in and an applicant with nothing recorded yet. The owner's
-- gedu is first and carries the heaviest teaching load.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('gedu@example.com',           'Gedu',   'Example',   'password'),
    ('aino.virtanen@example.com',  'Aino',   'Virtanen',  'testpassword123'),
    ('mikko.lehtinen@example.com', 'Mikko',  'Lehtinen',  'testpassword123'),
    ('sofia.nieminen@example.com', 'Sofia',  'Nieminen',  'testpassword123'),
    ('lucas.moreau@example.com',   'Lucas',  'Moreau',    'testpassword123'),
    ('emma.koskinen@example.com',  'Emma',   'Koskinen',  'testpassword123'),
    ('oliver.grant@example.com',   'Oliver', 'Grant',     'testpassword123')
  ) AS t(email, first_name, last_name, password)
  LOOP
    PERFORM pg_temp.account(r.email, r.first_name, r.last_name, r.password);
  END LOOP;
END;
$$;

-- Parents. The owner's is first, and is the one with children on the most
-- products.
DO $$
DECLARE
  r      record;
  v_id   uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('parent@example.com',          'Parent',  'Example',   'password',        'en', ARRAY['en','fi']::public.spoken_language[], '358401000000'),
    ('laura.korhonen@example.com',  'Laura',   'Korhonen',  'testpassword123', 'fi', ARRAY['fi','en']::public.spoken_language[], '358401000001'),
    ('petri.makinen@example.com',   'Petri',   'Mäkinen',   'testpassword123', 'fi', ARRAY['fi']::public.spoken_language[],      '358401000002'),
    ('hanna.salminen@example.com',  'Hanna',   'Salminen',  'testpassword123', 'fi', ARRAY['fi','sv']::public.spoken_language[], '358401000003'),
    ('jussi.heikkinen@example.com', 'Jussi',   'Heikkinen', 'testpassword123', 'fi', ARRAY['fi']::public.spoken_language[],      '358401000004'),
    ('marika.laine@example.com',    'Marika',  'Laine',     'testpassword123', 'fi', ARRAY['fi','en']::public.spoken_language[], '358401000005'),
    ('anna.jarvinen@example.com',   'Anna',    'Järvinen',  'testpassword123', 'fi', ARRAY['fi']::public.spoken_language[],      '358401000006'),
    ('camille.dubois@example.com',  'Camille', 'Dubois',    'testpassword123', 'fr', ARRAY['fr','en']::public.spoken_language[], '358401000007'),
    ('james.whitfield@example.com', 'James',   'Whitfield', 'testpassword123', 'en', ARRAY['en']::public.spoken_language[],      '358401000008'),
    ('satu.rantanen@example.com',   'Satu',    'Rantanen',  'testpassword123', 'fi', ARRAY['fi','en']::public.spoken_language[], '358401000009'),
    ('tomi.hakala@example.com',     'Tomi',    'Hakala',    'testpassword123', 'fi', ARRAY['fi']::public.spoken_language[],      '358401000010')
  ) AS t(email, first_name, last_name, password, locale, languages, phone)
  LOOP
    v_id := pg_temp.account(r.email, r.first_name, r.last_name, r.password);

    -- The fields the registration form collects and no RPC owns. Done here
    -- rather than later because create_gamer copies the parent's locale onto
    -- each child, so it has to be right before the children exist.
    UPDATE public.profiles
       SET locale = r.locale, spoken_languages = r.languages, phone = r.phone,
           email_verified_at = now()
     WHERE id = v_id;
  END LOOP;
END;
$$;

-- Children. Only the auth user is made here; create_gamer promotes it in
-- section 4, once the family has a PIN. Their addresses sit under
-- `@gamer.example.com`, which is what tells a child's account from a parent's
-- wherever this file selects one set or the other.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('milo@gamer.example.com',   'Milo',   'Example'),
    ('nea@gamer.example.com',    'Nea',    'Example'),
    ('otso@gamer.example.com',   'Otso',   'Example'),
    ('elias@gamer.example.com',  'Elias',  'Korhonen'),
    ('venla@gamer.example.com',  'Venla',  'Korhonen'),
    ('onni@gamer.example.com',   'Onni',   'Mäkinen'),
    ('aada@gamer.example.com',   'Aada',   'Salminen'),
    ('vaino@gamer.example.com',  'Väinö',  'Salminen'),
    ('sanni@gamer.example.com',  'Sanni',  'Salminen'),
    ('eino@gamer.example.com',   'Eino',   'Heikkinen'),
    ('iida@gamer.example.com',   'Iida',   'Laine'),
    ('leevi@gamer.example.com',  'Leevi',  'Laine'),
    ('oskari@gamer.example.com', 'Oskari', 'Järvinen'),
    ('lea@gamer.example.com',    'Léa',    'Dubois'),
    ('hugo@gamer.example.com',   'Hugo',   'Dubois'),
    ('olivia@gamer.example.com', 'Olivia', 'Whitfield'),
    ('noah@gamer.example.com',   'Noah',   'Whitfield'),
    ('pihla@gamer.example.com',  'Pihla',  'Rantanen'),
    ('aarne@gamer.example.com',  'Aarne',  'Rantanen'),
    ('rasmus@gamer.example.com', 'Rasmus', 'Hakala'),
    ('sointu@gamer.example.com', 'Sointu', 'Hakala')
  ) AS t(email, first_name, last_name)
  LOOP
    PERFORM pg_temp.account(r.email, r.first_name, r.last_name);
  END LOOP;
END;
$$;

COMMIT;

-- The acting admin's claims, spelled once here and pasted at the top of every
-- transaction below that writes through an admin-gated RPC. It is a `SELECT`
-- rather than a literal because the id was generated a moment ago and this file
-- never writes one out.
--
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', (SELECT id::text FROM public.profiles
--                                WHERE email = 'admin@example.com'),
--                       'role', 'authenticated')::text, true);

-- =============================================================================
-- 2. Educators — registered, certified, record-checked, contract signed
-- =============================================================================

-- register_gedu is service_role only: it promotes the trigger-seeded customer
-- profile and writes the coverage areas. Coverage points at the real seeded
-- municipalities, looked up by name — the geonames rows carry generated ids.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r          record;
  v_helsinki uuid := (SELECT id FROM public.locations
                       WHERE country_code = 'FI' AND type = 'municipality'
                         AND name = 'Helsinki' AND geonames_id IS NOT NULL LIMIT 1);
  v_espoo    uuid := (SELECT id FROM public.locations
                       WHERE country_code = 'FI' AND type = 'municipality'
                         AND name = 'Espoo' AND geonames_id IS NOT NULL LIMIT 1);
  v_tampere  uuid := (SELECT id FROM public.locations
                       WHERE country_code = 'FI' AND type = 'municipality'
                         AND name = 'Tampere' AND geonames_id IS NOT NULL LIMIT 1);
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('gedu@example.com',           'Gedu',   'Example',   'en', '358501000000', ARRAY['en','fi']::public.spoken_language[], ARRAY[v_helsinki, v_espoo], 'GeduExample', '',            ''),
    ('aino.virtanen@example.com',  'Aino',   'Virtanen',  'fi', '358501000001', ARRAY['fi','en']::public.spoken_language[], ARRAY[v_helsinki, v_espoo], 'AinoBuilds',  '',            ''),
    ('mikko.lehtinen@example.com', 'Mikko',  'Lehtinen',  'fi', '358501000002', ARRAY['fi']::public.spoken_language[],      ARRAY[v_helsinki],          'MikkoMC',     'MikkoBuilds', ''),
    ('sofia.nieminen@example.com', 'Sofia',  'Nieminen',  'fi', '358501000003', ARRAY['fi','sv','en']::public.spoken_language[], ARRAY[v_tampere],      '',            'SofiaStudio', ''),
    ('lucas.moreau@example.com',   'Lucas',  'Moreau',    'en', '358501000004', ARRAY['fr','en']::public.spoken_language[], ARRAY[]::uuid[],            '',            '',            ''),
    ('emma.koskinen@example.com',  'Emma',   'Koskinen',  'fi', '358501000005', ARRAY['fi','en']::public.spoken_language[], ARRAY[v_espoo],             '',            '',            ''),
    ('oliver.grant@example.com',   'Oliver', 'Grant',     'en', '358501000006', ARRAY['en']::public.spoken_language[],      ARRAY[]::uuid[],            '',            '',            '')
  ) AS t(email, first_name, last_name, locale, phone, languages, coverage, minecraft, roblox, roblox_id)
  LOOP
    PERFORM public.register_gedu(
      (SELECT id FROM public.profiles WHERE email = r.email),
      r.first_name, r.last_name, r.locale, r.phone, r.languages, r.coverage,
      r.minecraft, '', r.roblox, r.roblox_id);
  END LOOP;
END;
$$;
COMMIT;

-- Certification and the record check, both admin-only and both stamped
-- server-side. Five certified; Emma has her record extract in but is not
-- certified yet; Oliver has neither.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE g uuid;
BEGIN
  FOR g IN SELECT id FROM public.profiles WHERE email IN (
    'gedu@example.com', 'aino.virtanen@example.com', 'mikko.lehtinen@example.com',
    'sofia.nieminen@example.com', 'lucas.moreau@example.com')
  LOOP
    PERFORM public.set_gedu_criminal_record_check(g, true);
    PERFORM public.set_gedu_certified(g, true);
  END LOOP;

  PERFORM public.set_gedu_criminal_record_check(
    (SELECT id FROM public.profiles WHERE email = 'emma.koskinen@example.com'), true);
END;
$$;
COMMIT;

-- The contract each educator signs for themselves. Which version exists is
-- reference data a migration publishes, so the newest is read rather than
-- named. Five sign: four certified educators and the one still awaiting
-- certification. Lucas is certified and has NOT signed, and Oliver has neither
-- — signing and certifying are independent facts, and the admin user list has
-- to show every combination of them.
--
-- The signers are resolved under the admin's claims BEFORE any gedu's claims go
-- on: a gedu has no policy that would let them read another account's row.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  g uuid;
  v_version text := (SELECT version FROM public.gedu_contract_versions
                      WHERE version LIKE '%/fi' ORDER BY created_at DESC LIMIT 1);
  v_signers uuid[] := ARRAY(
    SELECT id FROM public.profiles WHERE email IN (
      'gedu@example.com', 'aino.virtanen@example.com', 'mikko.lehtinen@example.com',
      'sofia.nieminen@example.com', 'emma.koskinen@example.com'));
BEGIN
  IF v_version IS NULL THEN
    RETURN;
  END IF;

  FOREACH g IN ARRAY v_signers LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', g::text, 'role', 'authenticated')::text, true);
    PERFORM public.accept_gedu_contract(v_version);
  END LOOP;
END;
$$;
COMMIT;

-- =============================================================================
-- 3. Parent PINs
-- =============================================================================
-- A family may not acquire a child before it holds a PIN — create_gamer refuses
-- with PIN_REQUIRED otherwise — so this runs before section 4.
--
-- Which profiles are the parents, without naming eleven addresses: at this
-- point the admin and the educators have been promoted out of `customer` and
-- the children are still under `@gamer.example.com`, so a customer with an
-- `@example.com` address is a parent this file made and nothing else is.

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT id, email FROM public.profiles
            WHERE role = 'customer' AND email LIKE '%@example.com' ORDER BY email
  LOOP
    PERFORM public.set_pin_for_user(
      p.id,
      CASE WHEN p.email = 'parent@example.com' THEN '1111' ELSE '1234' END);
  END LOOP;
END;
$$;
COMMIT;

-- =============================================================================
-- 4. Children
-- =============================================================================
-- create_gamer is the atomic promote-and-link the gamer-creation route calls:
-- it swaps the profile to a gamer, records the parent's guardian declaration
-- against the current document version, links the game accounts and the parent.
-- Ages are now()-relative so the catalogue stays plausible however long the
-- stack has been up, and they spread across every product's audience.

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('milo@gamer.example.com',   'parent@example.com',          'Milo',   'Example',   10, 'boy',        'MiloBuilds',  NULL),
    ('nea@gamer.example.com',    'parent@example.com',          'Nea',    'Example',   13, 'girl',       NULL,          'NeaMakes'),
    ('otso@gamer.example.com',   'parent@example.com',          'Otso',   'Example',   8,  'boy',        'OtsoMC',      NULL),
    ('elias@gamer.example.com',  'laura.korhonen@example.com',  'Elias',  'Korhonen',  9,  'boy',        'EliasCraft',  NULL),
    ('venla@gamer.example.com',  'laura.korhonen@example.com',  'Venla',  'Korhonen',  12, 'girl',       NULL,          'VenlaBuilds'),
    ('onni@gamer.example.com',   'petri.makinen@example.com',   'Onni',   'Mäkinen',   7,  'boy',        'OnniMC',      NULL),
    ('aada@gamer.example.com',   'hanna.salminen@example.com',  'Aada',   'Salminen',  10, 'girl',       NULL,          NULL),
    ('vaino@gamer.example.com',  'hanna.salminen@example.com',  'Väinö',  'Salminen',  13, 'boy',        'VainoV',      NULL),
    ('sanni@gamer.example.com',  'hanna.salminen@example.com',  'Sanni',  'Salminen',  8,  'girl',       NULL,          NULL),
    ('eino@gamer.example.com',   'jussi.heikkinen@example.com', 'Eino',   'Heikkinen', 11, 'boy',        'EinoH',       NULL),
    ('iida@gamer.example.com',   'marika.laine@example.com',    'Iida',   'Laine',     14, 'girl',       NULL,          'IidaL'),
    ('leevi@gamer.example.com',  'marika.laine@example.com',    'Leevi',  'Laine',     10, 'boy',        'LeeviL',      NULL),
    ('oskari@gamer.example.com', 'anna.jarvinen@example.com',   'Oskari', 'Järvinen',  9,  'boy',        NULL,          NULL),
    ('lea@gamer.example.com',    'camille.dubois@example.com',  'Léa',    'Dubois',    12, 'girl',       NULL,          'LeaD'),
    ('hugo@gamer.example.com',   'camille.dubois@example.com',  'Hugo',   'Dubois',    8,  'boy',        'HugoD',       NULL),
    ('olivia@gamer.example.com', 'james.whitfield@example.com', 'Olivia', 'Whitfield', 11, 'girl',       NULL,          NULL),
    ('noah@gamer.example.com',   'james.whitfield@example.com', 'Noah',   'Whitfield', 15, 'boy',        'NoahW',       NULL),
    ('pihla@gamer.example.com',  'satu.rantanen@example.com',   'Pihla',  'Rantanen',  6,  'girl',       NULL,          NULL),
    ('aarne@gamer.example.com',  'satu.rantanen@example.com',   'Aarne',  'Rantanen',  13, 'boy',        'AarneR',      NULL),
    ('rasmus@gamer.example.com', 'tomi.hakala@example.com',     'Rasmus', 'Hakala',    12, 'boy',        NULL,          'RasmusH'),
    ('sointu@gamer.example.com', 'tomi.hakala@example.com',     'Sointu', 'Hakala',    9,  'non_binary', NULL,          NULL)
  ) AS t(email, parent_email, first_name, last_name, age, gender, minecraft, roblox)
  LOOP
    PERFORM public.create_gamer(
      (SELECT id FROM public.profiles WHERE email = r.email),
      (SELECT id FROM public.profiles WHERE email = r.parent_email),
      r.first_name, r.last_name,
      (current_date - make_interval(years => r.age, days => 40))::date,
      r.gender::public.gender_type,
      r.minecraft, NULL, r.roblox, NULL,
      'parent'::public.gamer_sign_in, true
    );
  END LOOP;
END;
$$;
COMMIT;

-- =============================================================================
-- 5. Venues
-- =============================================================================
-- Sites are the one location type nobody seeds: the geonames tree stops at
-- municipality, and an in-person product needs a site. `locations` and
-- `site_details` both carry admin-gated write grants, so these go in on the
-- admin's own session exactly as the admin locations page writes them.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

INSERT INTO public.locations (name, type, parent_id, country_code)
SELECT v.name, 'site'::public.location_type, m.id, 'FI'
  FROM (VALUES
    ('Sogverse-studio, Kamppi', 'Helsinki'),
    ('Sellon kirjasto',         'Espoo'),
    ('Nuorisotila Monitoimi',   'Tampere')
  ) AS v(name, municipality)
  JOIN public.locations m
    ON m.name = v.municipality AND m.type = 'municipality'
   AND m.country_code = 'FI' AND m.geonames_id IS NOT NULL;

INSERT INTO public.site_details (location_id, address, notes)
SELECT l.id, v.address, v.notes
  FROM (VALUES
    ('Sogverse-studio, Kamppi', 'Urho Kekkosen katu 1, 00100 Helsinki',
     'Third floor. Ring the intercom; the lift needs a key card after 17.00.'),
    ('Sellon kirjasto', 'Leppävaarankatu 9, 02600 Espoo',
     'Group room 2, behind the children''s section.'),
    ('Nuorisotila Monitoimi', 'Hämeenpuisto 14, 33210 Tampere',
     'Entrance from the courtyard. Machines are booked through the youth worker.')
  ) AS v(name, address, notes)
  JOIN public.locations l ON l.name = v.name AND l.type = 'site';

COMMIT;

-- =============================================================================
-- 6. The catalogue
-- =============================================================================
-- Twelve products: every product type, every billing mode, and every lifecycle
-- state the derivation can produce — pending, running and completed, a hidden
-- draft, and one whose registration window has not opened. Dates are
-- now()-relative so the catalogue never goes stale. Prices are plain EUR cents
-- and exist to render; no Stripe object stands behind any of them.
--
-- A product is looked up again later by its English title, which is unique here.
--
-- A NAME CARRIES NEITHER ITS DAY NOR ITS PLACE. The schedule slots say which
-- weekday a product runs and the location says where, so a name repeating
-- either is the same fact stored twice — and the copy in the name is the one
-- that goes stale when a term moves or a venue changes. Names here therefore
-- say what the product IS and nothing about when or where it happens.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tz       text := 'Europe/Helsinki';
  v_helsinki uuid := (SELECT id FROM public.locations
                       WHERE type = 'site' AND name = 'Sogverse-studio, Kamppi');
  v_espoo    uuid := (SELECT id FROM public.locations
                       WHERE type = 'site' AND name = 'Sellon kirjasto');
  v_tampere  uuid := (SELECT id FROM public.locations
                       WHERE type = 'site' AND name = 'Nuorisotila Monitoimi');
  -- A day camp runs every day it is open, so one slot per weekday.
  v_daily    jsonb := (SELECT jsonb_agg(jsonb_build_object(
                         'weekday', d, 'start_time', '10:00', 'duration_minutes', 300))
                       FROM generate_series(0, 6) d);
BEGIN

  -- 1. Running, listed, paid consumer club. The busiest thing in the catalogue.
  PERFORM public.create_product(
    'consumer_club', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Minecraft Java Club',
        'short_description','A weekly online club for building, redstone and survival.',
        'long_description','Every week our educators run a small online group on our own Java server.\n\n- Building and redstone projects the children choose themselves\n- A closed server with no strangers on it\n- Voice chat moderated by the educator throughout'),
      jsonb_build_object('locale','fi','name','Minecraft Java -kerho',
        'short_description','Viikoittainen verkkokerho rakentamiseen, redstoneen ja selviytymiseen.',
        'long_description','Ohjaajamme vetävät joka viikko pienen verkkoryhmän omalla Java-palvelimellamme.\n\n- Rakennus- ja redstone-projektit lapset valitsevat itse\n- Suljettu palvelin, jolle ei pääse ulkopuolisia\n- Ohjaaja moderoi puhekanavaa koko ajan')
    ),
    'minecraft_java', 'fi', true, v_tz,
    now() - interval '90 days', true, false,
    p_min_age => 8, p_max_age => 12, p_is_visible => true,
    p_start_date => current_date - 56,
    p_seat_count => 12,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 1, 'start_time', '16:00', 'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',4900)),
    p_primary_gedu_fee_cents => 6000, p_assistant_gedu_fee_cents => 4000
  );

  -- 2. Pending, registration open, in person, and the one product that asks for
  --    consent documents before a seat is taken.
  PERFORM public.create_product(
    'consumer_club', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Roblox Studio Club',
        'short_description','Make your own Roblox game, one session at a time.',
        'long_description','A term of Roblox Studio for children who want to build rather than only play. We start from a template and finish with a game each child can share with their family.'),
      jsonb_build_object('locale','fi','name','Roblox Studio -kerho',
        'short_description','Tee oma Roblox-pelisi, kerta kerrallaan.',
        'long_description','Robloxin pelinteon kausi lapsille, jotka haluavat rakentaa eivätkä vain pelata. Aloitamme pohjasta ja lopetamme peliin, jonka jokainen voi jakaa perheelleen.')
    ),
    'roblox_studio', 'fi', false, v_tz,
    now() - interval '7 days', true, false,
    p_min_age => 9, p_max_age => 14, p_is_visible => true,
    p_location_id => v_helsinki,
    p_start_date => current_date + 21,
    p_seat_count => 10,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 3, 'start_time', '17:00', 'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',5900)),
    p_primary_gedu_fee_cents => 6500,
    p_tag => 'beginner',
    p_required_consent_slugs => ARRAY['roblox-programme-terms','roblox-privacy-policy']
  );

  -- 3. Pending, and registration has NOT opened yet.
  PERFORM public.create_product(
    'consumer_club', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Fortnite Creative Club',
        'short_description','Level design and teamwork in Fortnite Creative.',
        'long_description','Registration opens shortly. The club builds maps together and plays them at the end of each session.'),
      jsonb_build_object('locale','fi','name','Fortnite Creative -kerho',
        'short_description','Kenttäsuunnittelua ja yhteistyötä Fortnite Creativessa.',
        'long_description','Ilmoittautuminen avautuu pian. Kerhossa rakennetaan karttoja yhdessä ja pelataan ne jokaisen kerran lopuksi.')
    ),
    'fortnite', 'en', true, v_tz,
    now() + interval '10 days', true, false,
    p_min_age => 10, p_max_age => 15, p_is_visible => true,
    p_start_date => current_date + 35,
    p_seat_count => 12,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 0, 'start_time', '18:00', 'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',5400)),
    p_primary_gedu_fee_cents => 6000
  );

  -- 4. Running and free — the club a family joins without paying anything.
  PERFORM public.create_product(
    'consumer_club', 'free',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Creator Studio Club',
        'short_description','A free, calm club for making videos, thumbnails and streams.',
        'long_description','Small groups, a predictable structure every week, and no pressure to be on camera. Designed with neurodivergent children in mind.'),
      jsonb_build_object('locale','fi','name','Sisällöntuotannon kerho',
        'short_description','Maksuton ja rauhallinen kerho videoiden, kansikuvien ja striimien tekoon.',
        'long_description','Pienet ryhmät, joka viikko sama rakenne eikä painetta näkyä kameralla. Suunniteltu erityisesti neuroepätyypillisiä lapsia ajatellen.')
    ),
    'creator_studio', 'fi', true, v_tz,
    now() - interval '30 days', true, false,
    p_min_age => 8, p_max_age => 13, p_is_visible => true,
    p_start_date => current_date - 14,
    p_end_date => current_date + 120,
    p_seat_count => 15,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 2, 'start_time', '16:30', 'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000,
    p_tag => 'neuroinclusive'
  );

  -- 5. The unlisted draft an admin is still writing.
  PERFORM public.create_product(
    'consumer_club', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Esports Academy (Spring Intake)',
        'short_description','Coached team play for older children. Draft — not published.',
        'long_description','Still being written: the coaching plan and the fee split are not settled.'),
      jsonb_build_object('locale','fi','name','Esports-akatemia (kevätkausi)',
        'short_description','Valmennettua joukkuepelaamista isommille lapsille. Luonnos, ei julkaistu.',
        'long_description','Vielä kesken: valmennussuunnitelma ja palkkiojako ovat sopimatta.')
    ),
    'esports', 'fi', true, v_tz,
    now() + interval '30 days', true, false,
    p_min_age => 12, p_max_age => 16, p_is_visible => false,
    p_start_date => current_date + 60,
    p_seat_count => 12,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 4, 'start_time', '17:00', 'duration_minutes', 120)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',6900)),
    p_primary_gedu_fee_cents => 8000,
    p_tag => 'advanced'
  );

  -- 6. Running municipality club, invoiced off platform, free to the family.
  PERFORM public.create_product(
    'municipality_club', 'external_contract',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Schools Game Club',
        'short_description','An after-school club run with the city of Espoo. Free to families.',
        'long_description','Minecraft Education in a school library, one afternoon a week, paid for by the city.'),
      jsonb_build_object('locale','fi','name','Koulujen pelikerho',
        'short_description','Espoon kaupungin kanssa järjestettävä iltapäiväkerho. Perheille maksuton.',
        'long_description','Minecraft Educationia koulun kirjastossa kerran viikossa iltapäivällä, kaupungin kustantamana.')
    ),
    'minecraft_education', 'fi', false, v_tz,
    now() - interval '45 days', true, false,
    p_min_age => 9, p_max_age => 12, p_is_visible => true,
    p_location_id => v_espoo,
    p_start_date => current_date - 30,
    p_end_date => current_date + 60,
    p_seat_count => 16,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 1, 'start_time', '14:00', 'duration_minutes', 60)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 180000
  );

  -- 7. A municipality club whose term is over — the completed state.
  PERFORM public.create_product(
    'municipality_club', 'external_contract',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Autumn Term Game Club',
        'short_description','Last autumn''s club with the city of Tampere. Finished.',
        'long_description','A full term of Minecraft Bedrock at a youth centre, invoiced to the city at the end of the term.'),
      jsonb_build_object('locale','fi','name','Syyskauden pelikerho',
        'short_description','Viime syksyn kerho Tampereen kaupungin kanssa. Päättynyt.',
        'long_description','Kokonainen kausi Minecraft Bedrockia nuorisotilassa. Kaupungilta laskutettiin kauden lopussa.')
    ),
    'minecraft_bedrock', 'fi', false, v_tz,
    now() - interval '220 days', true, false,
    p_min_age => 8, p_max_age => 12, p_is_visible => true,
    p_location_id => v_tampere,
    p_start_date => current_date - 200,
    p_end_date => current_date - 30,
    p_seat_count => 14,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 2, 'start_time', '13:00', 'duration_minutes', 60)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 150000
  );

  -- 8. An upcoming paid camp.
  PERFORM public.create_product(
    'camp', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Minecraft Summer Camp',
        'short_description','Five days of building, from ten in the morning to three.',
        'long_description','A week in our Kamppi studio. Bring lunch; snacks and drinks are provided. Each day ends with the group showing what they built.'),
      jsonb_build_object('locale','fi','name','Minecraft-kesäleiri',
        'short_description','Viisi päivää rakentamista kello kymmenestä kolmeen.',
        'long_description','Viikko Kampin studiollamme. Ota omat eväät mukaan, välipala ja juotavat saat meiltä. Jokainen päivä päättyy siihen, että ryhmä esittelee rakentamansa.')
    ),
    'minecraft_java', 'fi', false, v_tz,
    now() - interval '20 days', true, false,
    p_min_age => 8, p_max_age => 13, p_is_visible => true,
    p_location_id => v_helsinki,
    p_start_date => current_date + 40,
    p_end_date => current_date + 44,
    p_seat_count => 20,
    p_schedule_slots => v_daily,
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',21900)),
    p_primary_gedu_fee_cents => 30000, p_assistant_gedu_fee_cents => 20000
  );

  -- 9. A camp that has been and gone.
  PERFORM public.create_product(
    'camp', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Roblox Winter Camp',
        'short_description','The winter holiday camp. Finished.',
        'long_description','Four days of Roblox Studio over the winter holiday.'),
      jsonb_build_object('locale','fi','name','Roblox-talvileiri',
        'short_description','Talvilomaleiri. Päättynyt.',
        'long_description','Neljä päivää Roblox Studiota talviloman aikana.')
    ),
    'roblox_studio', 'fi', false, v_tz,
    now() - interval '160 days', true, false,
    p_min_age => 9, p_max_age => 14, p_is_visible => true,
    p_location_id => v_tampere,
    p_start_date => current_date - 120,
    p_end_date => current_date - 116,
    p_seat_count => 18,
    p_schedule_slots => v_daily,
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',19900)),
    p_primary_gedu_fee_cents => 28000
  );

  -- 10. A small free camp — four seats, so it fills and the rest queue.
  PERFORM public.create_product(
    'camp', 'free',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','AI and Game Design Camp',
        'short_description','Three free online days on how games are designed, with a little AI.',
        'long_description','Funded by a grant, so it costs families nothing. Places are limited and the queue moves as people drop out.'),
      jsonb_build_object('locale','fi','name','Tekoälyn ja pelisuunnittelun leiri',
        'short_description','Kolme maksutonta verkkopäivää pelisuunnittelusta ja tekoälystä.',
        'long_description','Leiri on apurahoitettu, joten perheille se on maksuton. Paikkoja on rajoitetusti ja jono etenee, kun joku perääntyy.')
    ),
    'ai', 'en', true, v_tz,
    now() - interval '10 days', true, false,
    p_min_age => 11, p_max_age => 15, p_is_visible => true,
    p_start_date => current_date + 14,
    p_end_date => current_date + 16,
    p_seat_count => 4,
    p_schedule_slots => v_daily,
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 18000
  );

  -- 11. A paid event for PARENTS — the audience with no age range.
  PERFORM public.create_product(
    'event', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Parents'' Evening: Gaming and Screen Time',
        'short_description','An online evening for parents. Ninety minutes, questions welcome.',
        'long_description','What children actually do in Minecraft and Roblox, what the age ratings mean, and what a reasonable screen-time agreement looks like at home.'),
      jsonb_build_object('locale','fi','name','Vanhempainilta: pelaaminen ja ruutuaika',
        'short_description','Verkkoilta vanhemmille. Puolitoista tuntia, kysymyksiä saa esittää.',
        'long_description','Mitä lapset oikeasti tekevät Minecraftissa ja Robloxissa, mitä ikärajat tarkoittavat ja millainen on kohtuullinen ruutuaikasopimus kotona.')
    ),
    'minecraft_java', 'fi', true, v_tz,
    now() - interval '5 days', false, true,
    p_is_visible => true,
    p_start_date => current_date + 10,
    p_end_date => current_date + 10,
    p_seat_count => 60,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 3, 'start_time', '18:00', 'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',1500)),
    p_primary_gedu_fee_cents => 12000
  );

  -- 12. A free event both children and parents attended, now past.
  PERFORM public.create_product(
    'event', 'free',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Family Game Jam',
        'short_description','A free Saturday where families made a small game together.',
        'long_description','Four hours, one game per family, and a showcase at the end.'),
      jsonb_build_object('locale','fi','name','Perheiden pelijami',
        'short_description','Maksuton lauantai, jona perheet tekivät yhdessä pienen pelin.',
        'long_description','Neljä tuntia, yksi peli perhettä kohti ja lopuksi esittely.')
    ),
    'game_studio', 'en', false, v_tz,
    now() - interval '30 days', true, true,
    p_min_age => 7, p_max_age => 15, p_is_visible => true,
    p_location_id => v_helsinki,
    p_start_date => current_date - 7,
    p_end_date => current_date - 7,
    p_seat_count => 40,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 5, 'start_time', '11:00', 'duration_minutes', 240)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 15000
  );

END;
$$;

COMMIT;

-- =============================================================================
-- 7. Groups and educator assignments
-- =============================================================================
-- One batch per product through the admin groups panel's own RPC, which mints
-- the groups and seats their educators in a single transaction. The draft club
-- deliberately gets none: an unpublished product with no groups is a real state
-- the admin UI has to render.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r          record;
  -- The owner's gedu takes the three clubs with history behind them, so the
  -- account they sign in as is the one with rosters, sessions and reports.
  v_gedu     uuid := (SELECT id FROM public.profiles WHERE email = 'gedu@example.com');
  v_aino     uuid := (SELECT id FROM public.profiles WHERE email = 'aino.virtanen@example.com');
  v_mikko    uuid := (SELECT id FROM public.profiles WHERE email = 'mikko.lehtinen@example.com');
  v_sofia    uuid := (SELECT id FROM public.profiles WHERE email = 'sofia.nieminen@example.com');
  v_lucas    uuid := (SELECT id FROM public.profiles WHERE email = 'lucas.moreau@example.com');
  v_emma     uuid := (SELECT id FROM public.profiles WHERE email = 'emma.koskinen@example.com');
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Minecraft Java Club',                      'Ryhmä A',      v_gedu,  'primary', 'Ryhmä B',      v_aino),
    ('Roblox Studio Club',                       'Ryhmä A',      v_sofia, 'primary', NULL,           NULL),
    ('Fortnite Creative Club',                   'Crew A',       v_lucas, 'primary', NULL,           NULL),
    ('Creator Studio Club',                      'Ryhmä A',      v_gedu,  'primary', NULL,           NULL),
    ('Schools Game Club',                        'Ryhmä 1',      v_gedu,  'primary', NULL,           NULL),
    ('Autumn Term Game Club',                    'Ryhmä 1',      v_sofia, 'primary', NULL,           NULL),
    ('Minecraft Summer Camp',                    'Camp Group A', v_lucas, 'primary', 'Camp Group B', v_emma),
    ('Roblox Winter Camp',                       'Camp Group A', v_mikko, 'primary', NULL,           NULL),
    ('AI and Game Design Camp',                  'AI Camp',      v_lucas, 'primary', NULL,           NULL),
    ('Parents'' Evening: Gaming and Screen Time','Webinaari',    v_sofia, 'primary', NULL,           NULL),
    ('Family Game Jam',                          'Game Jam',     v_mikko, 'primary', NULL,           NULL)
  ) AS t(product_name, group_a, gedu_a, role_a, group_b, gedu_b)
  LOOP
    PERFORM public.apply_group_changes(
      (SELECT product_id FROM public.product_translations
        WHERE locale = 'en' AND name = r.product_name),
      p_added_groups => (
        SELECT jsonb_agg(g) FROM (
          SELECT jsonb_build_object(
                   'tempId', 'a', 'name', r.group_a,
                   'gedus', jsonb_build_array(
                     jsonb_build_object('geduId', r.gedu_a, 'role', r.role_a))) AS g
          UNION ALL
          SELECT jsonb_build_object(
                   'tempId', 'b', 'name', r.group_b,
                   'gedus', jsonb_build_array(
                     jsonb_build_object('geduId', r.gedu_b, 'role', 'primary')))
           WHERE r.group_b IS NOT NULL
        ) s
      )
    );
  END LOOP;

  -- The second educator on the Minecraft Java club is an assistant, not a primary, and
  -- she is the one still awaiting certification — the pairing an admin actually
  -- uses while somebody is being trained up.
  PERFORM public.apply_group_changes(
    (SELECT product_id FROM public.product_translations
      WHERE locale = 'en' AND name = 'Minecraft Java Club'),
    p_gedu_assignments_added => jsonb_build_array(
      jsonb_build_object(
        'groupId', (SELECT g.id FROM public.product_groups g
                      JOIN public.product_translations t
                        ON t.product_id = g.product_id AND t.locale = 'en'
                     WHERE t.name = 'Minecraft Java Club'
                       AND g.name = 'Ryhmä A'),
        'geduId', v_emma, 'role', 'assistant'))
  );
END;
$$;

COMMIT;

-- =============================================================================
-- 8. Seats
-- =============================================================================
-- Every seat goes in through a real enrolment path, and which path depends on
-- what the product charges:
--
--   * FREE and EXTERNALLY CONTRACTED products take the family's own signup RPC.
--   * PAID products are validated by that same RPC and then written by the one
--     the Stripe webhook calls, with a made-up checkout-session id. No Stripe
--     object exists behind them and none is needed: nothing in the database
--     asks Stripe anything, and the seat renders exactly as a bought one does.
--     What a local stack therefore CANNOT show is the billing portal — a
--     subscription's next invoice, its cancellation state — because that data
--     lives in Stripe. Billing is reviewed on staging, as it is today.
--   * One past camp is comped through the ADMIN enrolment RPC, which is a
--     separate path worth having on screen.
--   * The small free camp fills and the rest of the queue joins the waitlist.

BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  r        record;
  v_result jsonb;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- product title, child email, purchase shape
    ('Minecraft Java Club', 'milo@gamer.example.com',   'subscription_monthly'),
    ('Minecraft Java Club', 'elias@gamer.example.com',  'subscription_monthly'),
    ('Minecraft Java Club', 'onni@gamer.example.com',   'subscription_monthly'),
    ('Minecraft Java Club', 'sanni@gamer.example.com',  'subscription_monthly'),
    ('Minecraft Java Club', 'oskari@gamer.example.com', 'subscription_monthly'),
    ('Minecraft Java Club', 'hugo@gamer.example.com',   'subscription_monthly'),
    ('Minecraft Java Club', 'aada@gamer.example.com',   'subscription_monthly'),
    ('Minecraft Java Club', 'leevi@gamer.example.com',  'subscription_monthly'),
    ('Roblox Studio Club', 'nea@gamer.example.com',    'subscription_monthly'),
    ('Roblox Studio Club', 'venla@gamer.example.com',  'subscription_monthly'),
    ('Roblox Studio Club', 'eino@gamer.example.com',   'subscription_monthly'),
    ('Roblox Studio Club', 'lea@gamer.example.com',    'subscription_monthly'),
    ('Roblox Studio Club', 'rasmus@gamer.example.com', 'subscription_monthly'),
    ('Creator Studio Club', 'otso@gamer.example.com',   'free'),
    ('Creator Studio Club', 'nea@gamer.example.com',    'free'),
    ('Creator Studio Club', 'sointu@gamer.example.com', 'free'),
    ('Creator Studio Club', 'pihla@gamer.example.com',  'free'),
    ('Creator Studio Club', 'onni@gamer.example.com',   'free'),
    ('Creator Studio Club', 'oskari@gamer.example.com', 'free'),
    ('Creator Studio Club', 'hugo@gamer.example.com',   'free'),
    ('Creator Studio Club', 'aada@gamer.example.com',   'free'),
    ('Schools Game Club', 'milo@gamer.example.com',   'external'),
    ('Schools Game Club', 'elias@gamer.example.com',  'external'),
    ('Schools Game Club', 'venla@gamer.example.com',  'external'),
    ('Schools Game Club', 'aada@gamer.example.com',   'external'),
    ('Schools Game Club', 'vaino@gamer.example.com',  'external'),
    ('Schools Game Club', 'eino@gamer.example.com',   'external'),
    ('Schools Game Club', 'leevi@gamer.example.com',  'external'),
    ('Schools Game Club', 'oskari@gamer.example.com', 'external'),
    ('Schools Game Club', 'lea@gamer.example.com',    'external'),
    ('Schools Game Club', 'olivia@gamer.example.com', 'external'),
    ('Schools Game Club', 'rasmus@gamer.example.com', 'external'),
    ('Minecraft Summer Camp', 'milo@gamer.example.com',   'single_payment'),
    ('Minecraft Summer Camp', 'otso@gamer.example.com',   'single_payment'),
    ('Minecraft Summer Camp', 'elias@gamer.example.com',  'single_payment'),
    ('Minecraft Summer Camp', 'sanni@gamer.example.com',  'single_payment'),
    ('Minecraft Summer Camp', 'onni@gamer.example.com',   'single_payment'),
    ('Minecraft Summer Camp', 'hugo@gamer.example.com',   'single_payment'),
    ('Minecraft Summer Camp', 'oskari@gamer.example.com', 'single_payment'),
    ('Minecraft Summer Camp', 'leevi@gamer.example.com',  'single_payment'),
    ('AI and Game Design Camp', 'iida@gamer.example.com',   'free'),
    ('AI and Game Design Camp', 'noah@gamer.example.com',   'free'),
    ('AI and Game Design Camp', 'aarne@gamer.example.com',  'free'),
    ('AI and Game Design Camp', 'venla@gamer.example.com',  'free')
  ) AS t(product_name, gamer_email, shape)
  LOOP
    DECLARE
      v_product uuid := (SELECT product_id FROM public.product_translations
                          WHERE locale = 'en' AND name = r.product_name);
      v_gamer   uuid := (SELECT id FROM public.profiles WHERE email = r.gamer_email);
      v_parent  uuid := (SELECT parent_id FROM public.parent_gamer pg
                          JOIN public.profiles p ON p.id = pg.gamer_id
                         WHERE p.email = r.gamer_email LIMIT 1);
      v_consents text[] := (SELECT array_agg(document_slug)
                              FROM public.product_required_consents
                             WHERE product_id = v_product);
    BEGIN
      v_result := public.create_participation(
        v_product, v_gamer, v_parent, r.shape, 'eur', v_consents);

      IF v_result->>'kind' = 'validated' THEN
        -- A made-up checkout-session id. It has to be unique per seat (the
        -- table says so), and it stands for nothing in Stripe.
        PERFORM public.confirm_paid_participation(
          v_product, v_gamer, v_parent,
          'cs_test_' || md5(v_product::text || v_gamer::text));
      END IF;
    END;
  END LOOP;
END;
$$;

-- The adults' own seats: a parent buys a place at the parents' evening.
-- (Runs as service_role, like the checkout route that writes it.)
DO $$
DECLARE
  r        record;
  v_result jsonb;
  v_event  uuid := (SELECT product_id FROM public.product_translations
                     WHERE locale = 'en'
                       AND name = 'Parents'' Evening: Gaming and Screen Time');
BEGIN
  FOR r IN SELECT id FROM public.profiles
            WHERE email IN ('parent@example.com', 'laura.korhonen@example.com',
                            'hanna.salminen@example.com', 'camille.dubois@example.com',
                            'james.whitfield@example.com', 'tomi.hakala@example.com')
  LOOP
    v_result := public.create_participation(v_event, r.id, r.id, 'single_payment', 'eur');
    IF v_result->>'kind' = 'validated' THEN
      PERFORM public.confirm_paid_participation(v_event, r.id, r.id,
        'cs_test_' || md5(v_event::text || r.id::text));
    END IF;
  END LOOP;
END;
$$;

COMMIT;

-- The queue on the small free camp: four seats are gone, so these four wait.
-- The waitlist engine has no grant of its own — the guarded wrapper is the only
-- door — so each parent joins the queue for their own child, as they would.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r             record;
  v_admin_claims text := json_build_object(
    'sub', (SELECT id::text FROM public.profiles WHERE email = 'admin@example.com'),
    'role', 'authenticated')::text;
  v_camp  uuid := (SELECT product_id FROM public.product_translations
                    WHERE locale = 'en' AND name = 'AI and Game Design Camp');
BEGIN
  FOR r IN SELECT p.id AS gamer_id, pg.parent_id
             FROM public.profiles p
             JOIN public.parent_gamer pg ON pg.gamer_id = p.id
            WHERE p.email IN ('nea@gamer.example.com', 'vaino@gamer.example.com',
                              'olivia@gamer.example.com', 'rasmus@gamer.example.com')
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.parent_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.join_product_waitlist(v_camp, r.gamer_id);
    PERFORM set_config('request.jwt.claims', v_admin_claims, true);
  END LOOP;
END;
$$;

COMMIT;

-- The two products whose seats an admin arranged off platform: last term's
-- municipality club and last winter's camp, both comped through the admin RPC.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Autumn Term Game Club', 'milo@gamer.example.com'),
    ('Autumn Term Game Club', 'otso@gamer.example.com'),
    ('Autumn Term Game Club', 'elias@gamer.example.com'),
    ('Autumn Term Game Club', 'aada@gamer.example.com'),
    ('Autumn Term Game Club', 'sanni@gamer.example.com'),
    ('Autumn Term Game Club', 'eino@gamer.example.com'),
    ('Autumn Term Game Club', 'leevi@gamer.example.com'),
    ('Autumn Term Game Club', 'oskari@gamer.example.com'),
    ('Autumn Term Game Club', 'hugo@gamer.example.com'),
    ('Autumn Term Game Club', 'pihla@gamer.example.com'),
    ('Roblox Winter Camp',   'venla@gamer.example.com'),
    ('Roblox Winter Camp',   'vaino@gamer.example.com'),
    ('Roblox Winter Camp',   'iida@gamer.example.com'),
    ('Roblox Winter Camp',   'lea@gamer.example.com'),
    ('Roblox Winter Camp',   'aarne@gamer.example.com'),
    ('Family Game Jam',      'milo@gamer.example.com'),
    ('Family Game Jam',      'nea@gamer.example.com'),
    ('Family Game Jam',      'otso@gamer.example.com'),
    ('Family Game Jam',      'parent@example.com'),
    ('Family Game Jam',      'elias@gamer.example.com'),
    ('Family Game Jam',      'venla@gamer.example.com'),
    ('Family Game Jam',      'onni@gamer.example.com'),
    ('Family Game Jam',      'sointu@gamer.example.com'),
    ('Family Game Jam',      'laura.korhonen@example.com'),
    ('Family Game Jam',      'petri.makinen@example.com')
  ) AS t(product_name, participant_email)
  LOOP
    PERFORM public.admin_enroll_participant(
      (SELECT product_id FROM public.product_translations
        WHERE locale = 'en' AND name = r.product_name),
      (SELECT id FROM public.profiles WHERE email = r.participant_email));
  END LOOP;
END;
$$;

-- Paid seats land in the unassigned inbox by design, so an admin still has to
-- place them. This is that placement, through the same batch RPC the panel uses:
-- alternate children between the Minecraft Java club's two groups, and put everybody
-- else in their product's only group.
DO $$
DECLARE
  r      record;
  v_moves jsonb;
BEGIN
  FOR r IN SELECT DISTINCT p.product_id FROM public.participations p
            WHERE p.group_id IS NULL AND p.status = 'active'
  LOOP
    WITH groups AS (
      SELECT id, (row_number() OVER (ORDER BY name)) - 1 AS idx,
             count(*) OVER () AS total
        FROM public.product_groups WHERE product_id = r.product_id
    ), seats AS (
      SELECT id, (row_number() OVER (ORDER BY signed_up_at, id)) - 1 AS idx
        FROM public.participations
       WHERE product_id = r.product_id AND group_id IS NULL AND status = 'active'
    )
    SELECT jsonb_agg(jsonb_build_object('participationId', s.id, 'toGroupId', g.id))
      INTO v_moves
      FROM seats s JOIN groups g ON g.idx = s.idx % g.total;

    IF v_moves IS NOT NULL THEN
      PERFORM public.apply_group_changes(r.product_id, p_participation_moves => v_moves);
    END IF;
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 9. What happened in the sessions
-- =============================================================================
-- Reports, notes and attendance for every past session of the running and
-- finished clubs, written by the educator who teaches the group — impersonated
-- one at a time, so `updated_by` and `recorded_by` read the way they would in
-- production rather than all pointing at an admin.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_admin_claims text := json_build_object(
    'sub', (SELECT id::text FROM public.profiles WHERE email = 'admin@example.com'),
    'role', 'authenticated')::text;
  grp      record;
  d        date;
  v_dates  date[];
  v_people uuid[];
  v_person uuid;
  v_report text;
  v_n      integer;
BEGIN
  FOR grp IN
    SELECT g.id AS group_id, a.gedu_id, p.start_date, p.end_date, s.weekday
      FROM public.product_groups g
      JOIN public.products p ON p.id = g.product_id
      JOIN public.gedu_group_assignments a
        ON a.group_id = g.id AND a.role = 'primary'
      JOIN public.schedule_slots s ON s.product_id = p.id
     WHERE p.product_type IN ('consumer_club', 'municipality_club')
       AND p.start_date <= current_date
  LOOP
    -- Both lists are read while the admin's claims are still in force; the
    -- educator's claims go on only around the writes, and come off again before
    -- the outer loop fetches its next row.
    -- Yesterday is the latest day taken: attendance marks do not open until a
    -- session's scheduled start has passed, and today's has not necessarily.
    v_dates := ARRAY(
      SELECT dd::date
        FROM generate_series(grp.start_date,
                             LEAST(current_date - 1,
                                   COALESCE(grp.end_date, current_date - 1)),
                             interval '1 day') dd
       WHERE EXTRACT(ISODOW FROM dd)::integer - 1 = grp.weekday
       ORDER BY dd DESC
       LIMIT 6);
    v_people := ARRAY(
      SELECT participant_id FROM public.participations
       WHERE group_id = grp.group_id AND status = 'active');

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', grp.gedu_id::text, 'role', 'authenticated')::text, true);

    v_n := 0;
    FOREACH d IN ARRAY v_dates LOOP
      v_n := v_n + 1;
      v_report := CASE v_n % 3
        WHEN 0 THEN 'We finished the redstone door project and started planning next week''s build. Everyone had something working by the end.'
        WHEN 1 THEN 'A quieter session. Two of the group worked on their own worlds while the rest built the shared village square together.'
        ELSE 'Good session. We covered how to plan a build before starting it, and the group voted on what to make next time.'
      END;

      PERFORM public.set_group_session_notes(
        grp.group_id, d, v_report,
        CASE WHEN v_n = 1
          THEN 'Two children need a reminder about the voice-chat rules next week.'
          ELSE NULL END);

      FOREACH v_person IN ARRAY COALESCE(v_people, ARRAY[]::uuid[]) LOOP
        PERFORM public.record_attendance(
          grp.group_id, d, v_person,
          CASE WHEN (v_n + abs(hashtext(v_person::text))) % 7 = 0
               THEN 'absent' ELSE 'present' END);
      END LOOP;
    END LOOP;

    PERFORM set_config('request.jwt.claims', v_admin_claims, true);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 10. Feedback
-- =============================================================================
-- Self-scoping: each row is written by the person it belongs to.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_admin_claims text := json_build_object(
    'sub', (SELECT id::text FROM public.profiles WHERE email = 'admin@example.com'),
    'role', 'authenticated')::text;
  r      record;
  v_id   uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('parent@example.com',          'Three children on three different clubs and one calendar that keeps them straight. The seat offers arriving by email are the part that changed our week.'),
    ('nea@gamer.example.com',       'im on the waiting list for the ai camp, is there a way to see how far up i am?'),
    ('laura.korhonen@example.com',  'Elias looks forward to his club all week. The report after each session is genuinely useful — thank you.'),
    ('hanna.salminen@example.com',  'Could the calendar show the session times in a slightly larger font? On a phone I keep mis-reading them.'),
    ('camille.dubois@example.com',  'Would it be possible to see the club materials in French as well? Léa reads English fine but I do not.'),
    ('venla@gamer.example.com',     'the roblox club is the best part of my week, can we do more scripting next time please'),
    ('aarne@gamer.example.com',     'I would like a way to show my builds to my friends who are not in the club.')
  ) AS t(email, message)
  LOOP
    v_id := (SELECT id FROM public.profiles WHERE email = r.email);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.submit_my_feedback(r.message);
    PERFORM set_config('request.jwt.claims', v_admin_claims, true);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 11. One absence, and one substitution an admin arranged
-- =============================================================================

-- The gedu files it for themselves, for the next session they are expected at.
-- The lookups run under the admin's claims; the filing runs under the gedu's.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_group uuid := (SELECT g.id FROM public.product_groups g
                     JOIN public.product_translations t
                       ON t.product_id = g.product_id AND t.locale = 'en'
                    WHERE t.name = 'Minecraft Java Club'
                      AND g.name = 'Ryhmä A');
  v_gedu  uuid := (SELECT id FROM public.profiles WHERE email = 'gedu@example.com');
  v_date  date := (SELECT dd::date
                     FROM generate_series(current_date, current_date + 14, interval '1 day') dd
                    WHERE EXTRACT(ISODOW FROM dd) = 2
                    ORDER BY dd LIMIT 1);
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_gedu::text, 'role', 'authenticated')::text, true);
  PERFORM public.request_session_substitution(
    v_group, v_date, 'sick'::public.substitution_reason,
    'Down with flu, should be back the following week.');
END;
$$;

COMMIT;

-- The admin seats a certified substitute. Sofia teaches no group on this
-- product, which is what makes her eligible.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_group uuid := (SELECT g.id FROM public.product_groups g
                     JOIN public.product_translations t
                       ON t.product_id = g.product_id AND t.locale = 'en'
                    WHERE t.name = 'Minecraft Java Club'
                      AND g.name = 'Ryhmä A');
  -- The same date the request above was filed for, derived the same way: the
  -- requests table carries no read grant for `authenticated`, so there is
  -- nothing to look the answer up in.
  v_date  date := (SELECT dd::date
                     FROM generate_series(current_date, current_date + 14, interval '1 day') dd
                    WHERE EXTRACT(ISODOW FROM dd) = 2
                    ORDER BY dd LIMIT 1);
BEGIN
  IF v_date IS NOT NULL THEN
    PERFORM public.set_session_substitution(
      v_group, v_date,
      (SELECT id FROM public.profiles WHERE email = 'gedu@example.com'),
      (SELECT id FROM public.profiles WHERE email = 'sofia.nieminen@example.com'));
  END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- 12. What landed
-- =============================================================================

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE 'rich-seed: profiles by role';
  FOR r IN SELECT role::text AS k, count(*) AS n FROM public.profiles
            GROUP BY 1 ORDER BY 1
  LOOP RAISE NOTICE '  % : %', r.k, r.n; END LOOP;

  RAISE NOTICE 'rich-seed: products by type and derived status';
  FOR r IN SELECT p.product_type::text || ' / ' || p.billing_mode::text || ' / '
                  || public.effective_status(p.id)::text
                  || CASE WHEN p.is_visible THEN '' ELSE ' (hidden)' END AS k,
                  count(*) AS n
             FROM public.products p GROUP BY 1 ORDER BY 1
  LOOP RAISE NOTICE '  % : %', r.k, r.n; END LOOP;

  RAISE NOTICE 'rich-seed: groups %, sessions %, attendance marks %, participations %, waitlisted %, substitutions %',
    (SELECT count(*) FROM public.product_groups),
    (SELECT count(*) FROM public.group_sessions),
    (SELECT count(*) FROM public.session_attendance),
    (SELECT count(*) FROM public.participations WHERE status = 'active'),
    (SELECT count(*) FROM public.participations WHERE status = 'waitlisted'),
    (SELECT count(*) FROM public.session_substitution_requests);
END;
$$;
