-- =============================================================================
-- Rich example seed — a realistic catalogue for reviewing UI on a local stack
-- =============================================================================
--
-- WHAT THIS IS FOR. `seed.sql` is the deliberately minimal fixture set the DB
-- tests are written against. This file is the opposite: it fills a local
-- database with enough of a catalogue that the admin, gedu and family
-- dashboards look like a real platform — products of every type and lifecycle
-- state, families with children, certified and uncertified educators, groups
-- with sessions, reports, attendance, feedback, substitutions, a few
-- cancelled sessions, municipality clubs and the customers they are invoiced
-- to, and Library articles in every state an admin can find one in. It exists
-- so a human can look at the UI. Nothing asserts anything here.
--
-- THE TWO SEEDS NEVER SHARE A DATABASE. What makes a good fixture for a DB test
-- — a handful of accounts at fixed ids, with whole-table claims written around
-- them — is not what makes a good example for a human to look at, so a stack
-- gets one seed or the other. The local stack script turns the CLI's `[db.seed]`
-- off on a stack that is getting this file, so `seed.sql` never runs there;
-- `up --no-rich-seed` leaves it on and applies nothing else. Everything below
-- therefore stands on its own: nothing here reads a row `seed.sql` wrote.
--
-- CI NEVER LOADS IT. It is not named in `config.toml` — `seed.sql` is the only
-- seed the CLI itself ever loads — and no CI job applies it. The local stack
-- script applies it once the database is up; by hand that is
--
--     psql -v ON_ERROR_STOP=1 -f supabase/rich-seed.sql
--
-- against a database built from `migrations/` and nothing else. It is written to
-- be applied ONCE to such a database: the guard below refuses anything else,
-- before a single row is written.
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
-- THE PICTURES ARE NOT IN HERE. A product's picture or a Library cover is a
-- `catalogue_images` entry naming an object in its purpose's storage bucket by
-- the sha256 of its bytes, so no amount of SQL can mint one — the bytes have to
-- be uploaded first. `scripts/local-db/rich-images.sh` does that, and the local
-- stack runs it straight after this file. Applying this file by hand leaves
-- every product on its placeholder, and every Library article without its
-- cover.
--
-- SIGNING IN. Three accounts are the ones to look at the app through, and they
-- share the password `password`:
--
--     admin@example.com    Admin Example    the admin who owns the catalogue
--     parent@example.com   Parent Example   three children, PIN 1111
--     gedu@example.com     Gedu Example     certified, the busiest teaching load
--
-- Every other account this file creates exists to fill lists, and they all
-- share the password `testpassword123`. These are the only accounts a stack
-- carrying this file has. Among them is a second admin, admin2@example.com
-- (Anni Salonen), so the admin UI has one admin viewing and editing another's
-- profile, and three more admins who make up the public team page's
-- leadership with the owner's: juha.makela@, helena.strand@ and
-- daniel.okafor@example.com. Another is the trainee, oliver.grant@example.com
-- (Oliver Grant): uncertified, shadowing the Minecraft Java club's Ryhmä A, so
-- the trainee's workspace can be looked at. Eight certified Gedus teach nothing
-- here and exist to fill the public team page: joonas.heinonen@,
-- veera.laaksonen@, tuomas.rautio@, priya.nair@, niklas.holmberg@,
-- lotta.saarinen@, ben.carter@ and ronja.kallio@example.com.
--
-- ONE CLUB IS LIVE WHEN THE STACK IS BUILT. The Minecraft Bedrock Club's one
-- weekly slot is placed on the build's own weekday, starting ten minutes before
-- the build and lasting three hours (Helsinki time), so its voice room is open
-- on a fresh stack: gedu@example.com teaches it, parent@example.com's Milo sits
-- in it with Elias, Eino and Leevi, and admin@example.com joins any room. It is
-- live only on the day of the build, for about three hours after it; after
-- that it is an ordinary weekly club, and `npm run db -- reset` makes it live
-- again.
--
-- LAST MONTH HAS A SUBSTITUTION EACH WAY. In the calendar month before the
-- build, gedu@example.com was away from a Minecraft Java Club afternoon that
-- mikko.lehtinen@example.com ran, and ran an Autumn Term Game Club afternoon for
-- sofia.nieminen@example.com, so the Invoicing page for that month shows a
-- settled line of each kind, one on each subtotal (section 11).
--
-- TWO SUBSTITUTIONS ARE COMING UP FOR gedu@example.com, so their My SOG has a
-- card for each kind of wait. They cover sofia.nieminen@example.com's online
-- Roblox Builders Club about two weeks after the build, a card still locked
-- until 48 hours before it, and aino.virtanen@example.com's in-person
-- Minecraft Redstone Club at Sellon kirjasto, Espoo, a day after the build,
-- a card already open. The Redstone club's one weekly slot is placed on the
-- day after the build at the build's own time of day (Helsinki time), the way
-- the live club's is placed on the day of it, so the second card is open on
-- a fresh stack whatever day it is built (section 11).
--
-- ONE REQUEST IS STILL OPEN. lucas.moreau@example.com is away from his online
-- Youth Centre Game Club about four days after the build; mikko.lehtinen@ has
-- offered to cover it and aino.virtanen@ has declined, so the admin's
-- Substitutions page has an offer to approve, and gedu@example.com, who has
-- not answered, finds it in their pool with Offer and Decline (section 11).
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
-- A database built from `migrations/` and holding no accounts at all, which is
-- one fact: `auth.users` is empty. Everyone this file is for arrives that way —
-- a local stack that gets the rich seed is created with the CLI's own seed
-- switched off — and the single check covers all three ways of being somewhere
-- else: a stack built for the DB tests carries seed.sql's fixtures, a second run
-- finds this file's own 52 accounts, and any real environment has users in it.
-- It stops the script before its first write.
--
-- It is a count and not a lookup for an account this file writes, because this
-- file writes no id it could recognise later and an email is a weaker fact than
-- an empty table: a database is either untouched or it is not this file's.

DO $$
DECLARE
  users bigint;
BEGIN
  SELECT count(*) INTO users FROM auth.users;
  IF users > 0 THEN
    RAISE EXCEPTION
      'rich-seed.sql wants a database built from migrations/ and seeded by nothing else, and this one already holds % account(s). A stack carrying this seed, a stack built with --no-rich-seed, and any real environment are all of them not that. Reset the database and apply it again.', users;
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

-- The owner's admin, and the first account on the database. Everything
-- admin-gated below runs as it, so the catalogue, the venues, the groups and
-- the comped seats all read as one person's work.
DO $$
DECLARE v_admin uuid := pg_temp.account('admin@example.com', 'Admin', 'Example', 'password');
BEGIN
  UPDATE public.profiles SET role = 'admin', email_verified_at = now()
   WHERE id = v_admin;
  DELETE FROM public.customer_profiles WHERE user_id = v_admin;
END;
$$;

-- A second admin, so the admin UI has one admin's profile for another admin
-- to view and edit.
DO $$
DECLARE v_admin2 uuid := pg_temp.account('admin2@example.com', 'Anni', 'Salonen', 'testpassword123');
BEGIN
  UPDATE public.profiles SET role = 'admin', email_verified_at = now()
   WHERE id = v_admin2;
  DELETE FROM public.customer_profiles WHERE user_id = v_admin2;
END;
$$;

-- Three more admins, whose public team profiles (section 13) make up the team
-- page's leadership with the owner's. Promoted the same way, with the locale
-- and spoken languages their profiles show.
DO $$
DECLARE
  r    record;
  v_id uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('juha.makela@example.com',   'Juha',   'Mäkelä', 'fi', ARRAY['fi','en']::public.spoken_language[]),
    ('helena.strand@example.com', 'Helena', 'Strand', 'sv', ARRAY['sv','fi','en']::public.spoken_language[]),
    ('daniel.okafor@example.com', 'Daniel', 'Okafor', 'en', ARRAY['en']::public.spoken_language[])
  ) AS t(email, first_name, last_name, locale, languages)
  LOOP
    v_id := pg_temp.account(r.email, r.first_name, r.last_name);
    UPDATE public.profiles
       SET role = 'admin', email_verified_at = now(),
           locale = r.locale, spoken_languages = r.languages
     WHERE id = v_id;
    DELETE FROM public.customer_profiles WHERE user_id = v_id;
  END LOOP;
END;
$$;

-- Educators. Thirteen are certified below, two are not: a brand-new hire whose
-- record check is in and an applicant with nothing recorded yet. The owner's
-- gedu is first and carries the heaviest teaching load. The last eight teach
-- nothing in this file; they are here for the public team page.
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
    ('oliver.grant@example.com',   'Oliver', 'Grant',     'testpassword123'),
    ('joonas.heinonen@example.com', 'Joonas', 'Heinonen',  'testpassword123'),
    ('veera.laaksonen@example.com', 'Veera',  'Laaksonen', 'testpassword123'),
    ('tuomas.rautio@example.com',   'Tuomas', 'Rautio',    'testpassword123'),
    ('priya.nair@example.com',      'Priya',  'Nair',      'testpassword123'),
    ('niklas.holmberg@example.com', 'Niklas', 'Holmberg',  'testpassword123'),
    ('lotta.saarinen@example.com',  'Lotta',  'Saarinen',  'testpassword123'),
    ('ben.carter@example.com',      'Ben',    'Carter',    'testpassword123'),
    ('ronja.kallio@example.com',    'Ronja',  'Kallio',    'testpassword123')
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
    ('oliver.grant@example.com',   'Oliver', 'Grant',     'en', '358501000006', ARRAY['en']::public.spoken_language[],      ARRAY[]::uuid[],            '',            '',            ''),
    ('joonas.heinonen@example.com', 'Joonas', 'Heinonen',  'fi', '358501000007', ARRAY['fi']::public.spoken_language[],      ARRAY[v_helsinki],          '',            '',            ''),
    ('veera.laaksonen@example.com', 'Veera',  'Laaksonen', 'fi', '358501000008', ARRAY['fi','en']::public.spoken_language[], ARRAY[v_tampere],           '',            '',            ''),
    ('tuomas.rautio@example.com',   'Tuomas', 'Rautio',    'fi', '358501000009', ARRAY['fi','en']::public.spoken_language[], ARRAY[v_helsinki, v_espoo], '',            '',            ''),
    ('priya.nair@example.com',      'Priya',  'Nair',      'en', '358501000010', ARRAY['en']::public.spoken_language[],      ARRAY[v_helsinki],          '',            '',            ''),
    ('niklas.holmberg@example.com', 'Niklas', 'Holmberg',  'fi', '358501000011', ARRAY['sv','fi','en']::public.spoken_language[], ARRAY[v_espoo],         '',            '',            ''),
    ('lotta.saarinen@example.com',  'Lotta',  'Saarinen',  'fi', '358501000012', ARRAY['fi','en']::public.spoken_language[], ARRAY[v_espoo],             '',            '',            ''),
    ('ben.carter@example.com',      'Ben',    'Carter',    'en', '358501000013', ARRAY['en']::public.spoken_language[],      ARRAY[v_helsinki],          '',            '',            ''),
    ('ronja.kallio@example.com',    'Ronja',  'Kallio',    'fi', '358501000014', ARRAY['fi','en']::public.spoken_language[], ARRAY[v_tampere],           '',            '',            '')
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
-- server-side. Thirteen certified; Emma has her record extract in but is not
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
    'sofia.nieminen@example.com', 'lucas.moreau@example.com',
    'joonas.heinonen@example.com', 'veera.laaksonen@example.com',
    'tuomas.rautio@example.com', 'priya.nair@example.com',
    'niklas.holmberg@example.com', 'lotta.saarinen@example.com',
    'ben.carter@example.com', 'ronja.kallio@example.com')
  LOOP
    PERFORM public.set_gedu_criminal_record_check(g, true);
    PERFORM public.set_gedu_certified(g, true);
  END LOOP;

  PERFORM public.set_gedu_criminal_record_check(
    (SELECT id FROM public.profiles WHERE email = 'emma.koskinen@example.com'), true);
END;
$$;
COMMIT;

-- Qualifications, admin-granted and stamped server-side. gedu@example.com
-- holds neuroinclusive and not consumer_products, so the admin user page shows
-- one qualification granted and one not.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.set_gedu_qualification(
  (SELECT id FROM public.profiles WHERE email = 'gedu@example.com'),
  'neuroinclusive', true);
COMMIT;

-- The contract each educator signs for themselves. Which version exists is
-- reference data a migration publishes, so the newest is read rather than
-- named. Thirteen sign: twelve certified educators and the one still awaiting
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
      'sofia.nieminen@example.com', 'emma.koskinen@example.com',
      'joonas.heinonen@example.com', 'veera.laaksonen@example.com',
      'tuomas.rautio@example.com', 'priya.nair@example.com',
      'niklas.holmberg@example.com', 'lotta.saarinen@example.com',
      'ben.carter@example.com', 'ronja.kallio@example.com'));
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
      -- A birth month that began more than a month ago, so the age shown is
      -- the one in the row above.
      EXTRACT(YEAR FROM current_date - make_interval(years => r.age, days => 40))::smallint,
      EXTRACT(MONTH FROM current_date - make_interval(years => r.age, days => 40))::smallint,
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
-- Nineteen products: every product type, every billing mode, and every lifecycle
-- state the derivation can produce — pending, running and completed, a hidden
-- draft, and one whose registration window has not opened — plus the live club,
-- whose one weekly session is in progress when the stack is built, an online
-- club small enough to need only one group, and an in-person club whose next
-- session is a day after the build. Dates are
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
--
-- THE MUNICIPALITY CLUBS ARE THERE FOR THE INVOICING PAGE. Six of them, and
-- five Fennoa customers they are invoiced to, written first so a club can name
-- its buyer as it is created. Between them they put every state of
-- /admin/municipality-invoicing on the page, and the month that shows the most
-- of it at once is the last month of the last FINISHED calendar quarter — on a
-- stack built in October, September:
--
--   * Espoo's one customer is monthly, and its file is ready: the Schools Game
--     Club's month holds sessions written up and one cancelled.
--   * Tampere is two customers, two departments under two agreements. The youth
--     services are quarterly, and the Autumn Term Game Club, which ran into
--     that quarter, makes their quarter's file ready. The education services
--     are monthly and bought a pilot whose every session that month was called
--     off (section 12), so their file is refused for having nothing to bill.
--   * Turku is quarterly and its quarter's file is refused: its Library Game
--     Club ran in the quarter's first month with no fee set, and stopped.
--   * An association buys the Vantaa club — a buyer that is not the
--     municipality — half-yearly, so the label says the half-year's file comes
--     in its last month. Nobody has written any of that club's sessions up
--     (section 9), so every past line is billed without a record.
--   * The Helsinki club has a fee and no customer.
--
-- The current month holds the upcoming lines. The periods are calendar-aligned,
-- so the clubs that have to sit inside one are dated from the start of the
-- current quarter rather than from today; the others keep their now()-relative
-- terms.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- The customers go through the admin RPC like every other write here. The
-- numbers and addresses are invented, plausible rather than anybody's: a page
-- naming a real customer's number looks like live data.
SELECT public.create_invoice_customer(
         v.no, v.invoice_name, v.street, v.postal_code, v.city,
         v.cadence::public.invoice_billing_cadence,
         p_your_reference => v.your_reference)
  FROM (VALUES
    ('F0204', 'Espoon kaupunki',
     'Virastokuja 1',     '02070', 'Espoo',   'monthly',     'TIL-2026-0418'),
    ('F0211', 'Tampereen kaupunki, nuorisopalvelut',
     'Kirjastokuja 5',    '33101', 'Tampere', 'quarterly',   'NUOR-2026-77'),
    ('F0212', 'Tampereen kaupunki, kasvatus- ja opetuspalvelut',
     'Opintie 14',        '33101', 'Tampere', 'monthly',     'KASVA-2026-310'),
    ('F0219', 'Föreningen Lekvänner rf',
     'Sjöstigen 12 A',    '01300', 'Vantaa',  'half_yearly', NULL),
    ('F0221', 'Turun kaupunki',
     'Raatihuoneenkuja 2','20101', 'Turku',   'quarterly',   NULL)
  ) AS v(no, invoice_name, street, postal_code, city, cadence, your_reference);

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
  -- The live club's session: it started ten minutes before this ran, on the
  -- product's own clock, so its weekday and start time are read in that zone.
  v_live     timestamp := date_trunc('minute', (now() AT TIME ZONE v_tz) - interval '10 minutes');
  -- The Redstone club's next session: this time tomorrow, on the same clock.
  v_next     timestamp := date_trunc('minute', now() AT TIME ZONE v_tz) + interval '1 day';
  -- The online municipality clubs point at their municipality itself.
  v_muni_helsinki uuid := (SELECT id FROM public.locations
                            WHERE country_code = 'FI' AND type = 'municipality'
                              AND name = 'Helsinki' AND geonames_id IS NOT NULL LIMIT 1);
  v_muni_tampere  uuid := (SELECT id FROM public.locations
                            WHERE country_code = 'FI' AND type = 'municipality'
                              AND name = 'Tampere' AND geonames_id IS NOT NULL LIMIT 1);
  v_muni_turku    uuid := (SELECT id FROM public.locations
                            WHERE country_code = 'FI' AND type = 'municipality'
                              AND name = 'Turku' AND geonames_id IS NOT NULL LIMIT 1);
  v_muni_vantaa   uuid := (SELECT id FROM public.locations
                            WHERE country_code = 'FI' AND type = 'municipality'
                              AND name = 'Vantaa' AND geonames_id IS NOT NULL LIMIT 1);
  -- The last finished calendar quarter, and its last month.
  v_quarter  date := (date_trunc('quarter', current_date) - interval '3 months')::date;
  v_q_last   date := (date_trunc('quarter', current_date) - interval '1 month')::date;
BEGIN

  -- 1. Running, listed, paid consumer club. The busiest thing in the catalogue,
  --    and seven months in, like the free club below, so the feedback page's
  --    timeline has history to draw.
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
    now() - interval '230 days', true, false,
    p_min_age => 8, p_max_age => 12, p_is_visible => true,
    p_start_date => current_date - 210,
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
    now() - interval '230 days', true, false,
    p_min_age => 8, p_max_age => 13, p_is_visible => true,
    p_start_date => current_date - 210,
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
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 180000,
    p_invoice_customer_id => (SELECT id FROM public.invoice_customers
                               WHERE fennoa_customer_no = 'F0204')
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
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 150000,
    p_invoice_customer_id => (SELECT id FROM public.invoice_customers
                               WHERE fennoa_customer_no = 'F0211')
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

  -- 13. The live club: running, online and free, with its one weekly slot
  --     placed on the build's own weekday, starting ten minutes before the
  --     build and lasting three hours, so a voice room is open on a fresh
  --     stack. It starts on the day of that session, which keeps section 9
  --     from writing up any history for it. On any other day it is an ordinary
  --     weekly club whose next session is days away.
  PERFORM public.create_product(
    'consumer_club', 'free',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Minecraft Bedrock Club',
        'short_description','A free online club for building together on Bedrock.',
        'long_description','A small online group on Bedrock, playing on tablets, phones and consoles alike, with the educator on voice chat throughout.'),
      jsonb_build_object('locale','fi','name','Minecraft Bedrock -kerho',
        'short_description','Maksuton verkkokerho yhdessä rakentamiseen Bedrockilla.',
        'long_description','Pieni verkkoryhmä Bedrockilla tableteilla, puhelimilla ja konsoleilla, ohjaaja mukana puhekanavalla koko ajan.')
    ),
    'minecraft_bedrock', 'fi', true, v_tz,
    now() - interval '14 days', true, false,
    p_min_age => 8, p_max_age => 12, p_is_visible => true,
    p_start_date => v_live::date,
    p_seat_count => 10,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', EXTRACT(ISODOW FROM v_live)::integer - 1,
                         'start_time', to_char(v_live, 'HH24:MI'),
                         'duration_minutes', 180)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000
  );

  -- 14. Running, paid and online, five months in, with ONE group: the admin
  --     feedback page's single-group product, whose group is the product. Its
  --     children are happy with it, against the Creator Studio Club's weak
  --     Ryhmä A.
  PERFORM public.create_product(
    'consumer_club', 'paid',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Roblox Builders Club',
        'short_description','A weekly online club for building and scripting in Roblox Studio.',
        'long_description','A small online group that builds its own Roblox worlds together, from the first block to a first script.\n\n- A new building or scripting challenge every week\n- Private servers with only the group on them\n- The educator on voice chat throughout'),
      jsonb_build_object('locale','fi','name','Roblox-rakentajien kerho',
        'short_description','Viikoittainen verkkokerho Roblox Studiossa rakentamiseen ja skriptaamiseen.',
        'long_description','Pieni verkkoryhmä rakentaa yhdessä omia Roblox-maailmojaan ensimmäisestä palikasta ensimmäiseen skriptiin.\n\n- Joka viikko uusi rakennus- tai skriptaushaaste\n- Yksityiset palvelimet, joilla on vain oma ryhmä\n- Ohjaaja mukana puhekanavalla koko ajan')
    ),
    'roblox_studio', 'fi', true, v_tz,
    now() - interval '170 days', true, false,
    p_min_age => 10, p_max_age => 15, p_is_visible => true,
    p_start_date => current_date - 150,
    p_seat_count => 8,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 4, 'start_time', '16:00', 'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',4900)),
    p_primary_gedu_fee_cents => 6000
  );

  -- 15. Running, free and in person, four weeks in, with its one weekly slot
  --     placed on the day after the build at the build's own time of day, so
  --     its next session is always about a day away on a fresh stack — the
  --     session section 11 seats gedu@example.com on as the sub, inside the
  --     48 hours that open a substitution's workspace.
  PERFORM public.create_product(
    'consumer_club', 'free',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Minecraft Redstone Club',
        'short_description','A free weekly club for building redstone machines side by side.',
        'long_description','A small group meets in person once a week to build doors, lifts and contraptions in Minecraft Java, with the educator in the room to help when a circuit will not fire.'),
      jsonb_build_object('locale','fi','name','Minecraft Redstone -kerho',
        'short_description','Maksuton viikkokerho redstone-koneiden rakentamiseen vierekkäin.',
        'long_description','Pieni ryhmä kokoontuu kerran viikossa paikan päällä rakentamaan Minecraft Javassa ovia, hissejä ja laitteita. Ohjaaja on samassa tilassa auttamassa, kun piiri ei toimi.')
    ),
    'minecraft_java', 'fi', false, v_tz,
    now() - interval '40 days', true, false,
    p_min_age => 8, p_max_age => 12, p_is_visible => true,
    p_location_id => v_espoo,
    p_start_date => v_next::date - 28,
    p_seat_count => 10,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', EXTRACT(ISODOW FROM v_next)::integer - 1,
                         'start_time', to_char(v_next, 'HH24:MI'),
                         'duration_minutes', 90)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000
  );

  -- 16. An online municipality club with NO FEE, for a quarterly customer. It
  --     ran from six weeks before the last finished quarter into that
  --     quarter's first month and stopped, so the quarter's file is refused
  --     naming that month.
  PERFORM public.create_product(
    'municipality_club', 'external_contract',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Library Game Club',
        'short_description','An online club run with the city of Turku. Free to families.',
        'long_description','Minecraft Education online, one afternoon a week, paid for by the city''s libraries.'),
      jsonb_build_object('locale','fi','name','Kirjaston pelikerho',
        'short_description','Turun kaupungin kanssa järjestettävä verkkokerho. Perheille maksuton.',
        'long_description','Minecraft Educationia verkossa kerran viikossa iltapäivällä, kaupungin kirjastojen kustantamana.')
    ),
    'minecraft_education', 'fi', true, v_tz,
    v_quarter - interval '60 days', true, false,
    p_min_age => 9, p_max_age => 12, p_is_visible => true,
    p_location_id => v_muni_turku,
    p_start_date => v_quarter - 42,
    p_end_date => v_quarter + 27,
    p_seat_count => 16,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 3, 'start_time', '15:00', 'duration_minutes', 60)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000,
    p_invoice_customer_id => (SELECT id FROM public.invoice_customers
                               WHERE fennoa_customer_no = 'F0221')
  );

  -- 17. A running online municipality club bought by an association that is
  --     not the municipality it runs in, invoiced half-yearly.
  PERFORM public.create_product(
    'municipality_club', 'external_contract',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Association Game Club',
        'short_description','An online club run with a Vantaa families'' association. Free to families.',
        'long_description','Minecraft Bedrock online, one afternoon a week, paid for by the association.'),
      jsonb_build_object('locale','fi','name','Yhdistyksen pelikerho',
        'short_description','Vantaalaisen perheyhdistyksen kanssa järjestettävä verkkokerho. Perheille maksuton.',
        'long_description','Minecraft Bedrockia verkossa kerran viikossa iltapäivällä, yhdistyksen kustantamana.')
    ),
    'minecraft_bedrock', 'sv', true, v_tz,
    v_quarter - interval '80 days', true, false,
    p_min_age => 8, p_max_age => 12, p_is_visible => true,
    p_location_id => v_muni_vantaa,
    p_start_date => v_quarter - 60,
    p_end_date => current_date + 75,
    p_seat_count => 12,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 2, 'start_time', '16:00', 'duration_minutes', 60)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 16500,
    p_invoice_customer_id => (SELECT id FROM public.invoice_customers
                               WHERE fennoa_customer_no = 'F0219')
  );

  -- 18. A one-month pilot in the last finished quarter's last month, bought by
  --     Tampere's second department. Every session it had was called off
  --     (section 12), so that month it has nothing to bill.
  PERFORM public.create_product(
    'municipality_club', 'external_contract',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Esports Pilot Club',
        'short_description','A month''s pilot with the city of Tampere''s schools. Finished.',
        'long_description','Four afternoons of esports online, to see whether the schools wanted a full term of it.'),
      jsonb_build_object('locale','fi','name','E-urheilun kokeilukerho',
        'short_description','Kuukauden kokeilu Tampereen kaupungin koulujen kanssa. Päättynyt.',
        'long_description','Neljä iltapäivää e-urheilua verkossa, jotta koulut näkivät, haluavatko ne siitä kokonaisen kauden.')
    ),
    'esports', 'fi', true, v_tz,
    v_q_last - interval '30 days', true, false,
    p_min_age => 10, p_max_age => 13, p_is_visible => true,
    p_location_id => v_muni_tampere,
    p_start_date => v_q_last,
    p_end_date => (v_q_last + interval '1 month')::date - 1,
    p_seat_count => 12,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 2, 'start_time', '14:00', 'duration_minutes', 60)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 17000,
    p_invoice_customer_id => (SELECT id FROM public.invoice_customers
                               WHERE fennoa_customer_no = 'F0212')
  );

  -- 19. A running online municipality club nobody has named a customer for
  --     yet, which blocks its own file and nothing else.
  PERFORM public.create_product(
    'municipality_club', 'external_contract',
    jsonb_build_array(
      jsonb_build_object('locale','en','name','Youth Centre Game Club',
        'short_description','An online club run with the city of Helsinki. Free to families.',
        'long_description','Roblox online, one afternoon a week, paid for by the city.'),
      jsonb_build_object('locale','fi','name','Nuorisotalon pelikerho',
        'short_description','Helsingin kaupungin kanssa järjestettävä verkkokerho. Perheille maksuton.',
        'long_description','Robloxia verkossa kerran viikossa iltapäivällä, kaupungin kustantamana.')
    ),
    'roblox_studio', 'fi', true, v_tz,
    v_quarter - interval '10 days', true, false,
    p_min_age => 9, p_max_age => 13, p_is_visible => true,
    p_location_id => v_muni_helsinki,
    p_start_date => v_quarter + 14,
    p_end_date => current_date + 60,
    p_seat_count => 14,
    p_schedule_slots => jsonb_build_array(
      jsonb_build_object('weekday', 3, 'start_time', '16:00', 'duration_minutes', 60)),
    p_prices => jsonb_build_array(jsonb_build_object('currency','eur','price_cents',0)),
    p_primary_gedu_fee_cents => 6000, p_municipality_fee_cents => 15500
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
    ('Minecraft Bedrock Club',                   'Ryhmä A',      v_gedu,  'primary', NULL,           NULL),
    ('Roblox Builders Club',                     'Ryhmä A',      v_sofia, 'primary', NULL,           NULL),
    ('Minecraft Redstone Club',                  'Ryhmä A',      v_aino,  'primary', NULL,           NULL),
    ('Schools Game Club',                        'Ryhmä 1',      v_gedu,  'primary', NULL,           NULL),
    ('Autumn Term Game Club',                    'Ryhmä 1',      v_sofia, 'primary', NULL,           NULL),
    ('Library Game Club',                        'Ryhmä 1',      v_mikko, 'primary', NULL,           NULL),
    ('Association Game Club',                    'Grupp 1',      v_aino,  'primary', NULL,           NULL),
    ('Esports Pilot Club',                       'Ryhmä 1',      v_sofia, 'primary', NULL,           NULL),
    ('Youth Centre Game Club',                   'Ryhmä 1',      v_lucas, 'primary', NULL,           NULL),
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

  -- And a trainee shadows the same group: Oliver, who has neither his
  -- certification nor his record check yet — a trainee seat asks for neither.
  PERFORM public.apply_group_changes(
    (SELECT product_id FROM public.product_translations
      WHERE locale = 'en' AND name = 'Minecraft Java Club'),
    p_trainees_added => jsonb_build_array(
      jsonb_build_object(
        'groupId', (SELECT g.id FROM public.product_groups g
                      JOIN public.product_translations t
                        ON t.product_id = g.product_id AND t.locale = 'en'
                     WHERE t.name = 'Minecraft Java Club'
                       AND g.name = 'Ryhmä A'),
        'geduId', (SELECT id FROM public.profiles
                    WHERE email = 'oliver.grant@example.com')))
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
    ('Minecraft Bedrock Club', 'milo@gamer.example.com',  'free'),
    ('Minecraft Bedrock Club', 'elias@gamer.example.com', 'free'),
    ('Minecraft Bedrock Club', 'eino@gamer.example.com',  'free'),
    ('Minecraft Bedrock Club', 'leevi@gamer.example.com', 'free'),
    -- The six children in no other online club's group, so the Roblox
    -- Builders Club's answers are nobody else's.
    ('Roblox Builders Club', 'venla@gamer.example.com',  'subscription_monthly'),
    ('Roblox Builders Club', 'vaino@gamer.example.com',  'subscription_monthly'),
    ('Roblox Builders Club', 'lea@gamer.example.com',    'subscription_monthly'),
    ('Roblox Builders Club', 'olivia@gamer.example.com', 'subscription_monthly'),
    ('Roblox Builders Club', 'aarne@gamer.example.com',  'subscription_monthly'),
    ('Roblox Builders Club', 'rasmus@gamer.example.com', 'subscription_monthly'),
    ('Minecraft Redstone Club', 'elias@gamer.example.com',  'free'),
    ('Minecraft Redstone Club', 'aada@gamer.example.com',   'free'),
    ('Minecraft Redstone Club', 'oskari@gamer.example.com', 'free'),
    ('Minecraft Redstone Club', 'eino@gamer.example.com',   'free'),
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

-- The Creator Studio Club splits into a second group, Mikko's, which three of
-- its children move to by name — so Otso and Nea stay together in Ryhmä A.
-- Section 9 gives this group sessions and attendance but no feedback at all:
-- the admin feedback page's "ran sessions, heard nothing back".
DO $$
DECLARE
  v_product uuid := (SELECT product_id FROM public.product_translations
                      WHERE locale = 'en' AND name = 'Creator Studio Club');
  v_group   uuid;
BEGIN
  PERFORM public.apply_group_changes(
    v_product,
    p_added_groups => jsonb_build_array(jsonb_build_object(
      'tempId', 'b', 'name', 'Ryhmä B',
      'gedus', jsonb_build_array(jsonb_build_object(
        'geduId', (SELECT id FROM public.profiles WHERE email = 'mikko.lehtinen@example.com'),
        'role', 'primary')))));
  v_group := (SELECT id FROM public.product_groups
               WHERE product_id = v_product AND name = 'Ryhmä B');
  PERFORM public.apply_group_changes(
    v_product,
    p_participation_moves => (
      SELECT jsonb_agg(jsonb_build_object('participationId', pa.id, 'toGroupId', v_group))
        FROM public.participations pa
        JOIN public.profiles pr ON pr.id = pa.participant_id
       WHERE pa.product_id = v_product AND pa.status = 'active'
         AND pr.email IN ('sointu@gamer.example.com', 'pihla@gamer.example.com',
                          'aada@gamer.example.com')));
END;
$$;

COMMIT;

-- =============================================================================
-- 9. What happened in the sessions
-- =============================================================================
-- Reports, notes and attendance for every past session of the running and
-- finished clubs, written by the educator who teaches the group — impersonated
-- one at a time, so `updated_by` and `recorded_by` read the way they would in
-- production rather than all pointing at an admin. The ten most recent sessions
-- of each in-person club are written up, and the thirty-one most recent of each
-- online one — seven months, back to their start, so the admin feedback page's
-- timeline has history to draw. Two municipality clubs are left out, for the
-- invoicing page: the Association Game Club, so its sessions bill without a
-- record, and the Esports Pilot Club, whose every session was called off.
--
-- On the ONLINE clubs, about seven in ten of the children marked present then
-- answer the feedback screen on the way out — written as the child, the way
-- the screen writes it, under the child's own claims — and so does one in four
-- of those marked absent, who joined late or left before the register. The
-- answers are shaped so the admin feedback page has something to find: the
-- Creator Studio Club's Ryhmä A is noticeably weaker on whether the group
-- listened, the Minecraft Java club's Ryhmä B rates its educator (Aino) higher
-- week by week, and the Creator Studio Club's Ryhmä B, Mikko's, holds its
-- sessions and never answers at all. About one answer in seven carries a note,
-- a few carry only a note, and a note says what the answers do: a child who
-- answered No or Not really to something writes about what went wrong.
--
-- The Roblox Builders Club, the one-group product, is the healthy contrast and
-- is scripted rather than rolled: every answer rated, nothing below A bit
-- except two, and three notes — one of them beside a Not really.

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
  v_total  integer;
  v_present  boolean;
  v_starts   timestamptz;
  v_roll     integer;
  v_answers  jsonb;
  v_key      text;
  v_level    integer;
  v_progress numeric;
  v_notes    text[];
  v_scripted boolean;
  v_negative_key text;
  v_note     text;
  -- What a child writes after answering No or Not really to something.
  v_negative_notes text[] := ARRAY[
    'it was hard to hear because everyone talked at once',
    'some people kept talking over me',
    'nobody listened when i explained my idea',
    'too short, i didnt get to finish my build',
    'someone broke my house and nobody said anything',
    'kind of boring we did the same thing as last time',
    'my internet was laggy and i missed half of it'];
  -- And after a session that went well, or with no answers beside it.
  v_happy_notes text[] := ARRAY[
    'the redstone door was SO cool',
    'can we build a castle next time??',
    'i learned how to make a piston elevator',
    'the teacher helped me fix my house thanks',
    'best club ever',
    'WE WON THE BUILD BATTLE',
    'i made a new friend today'];
BEGIN
  FOR grp IN
    SELECT g.id AS group_id, a.gedu_id, p.start_date, p.end_date, s.weekday,
           p.is_remote, p.timezone, s.start_time, s.duration_minutes,
           -- The groups whose answers lean, or never come, as the comment above says.
           (t.name = 'Creator Studio Club' AND g.name = 'Ryhmä A') AS weak_listening,
           (t.name = 'Minecraft Java Club' AND g.name = 'Ryhmä B') AS rising_gedu,
           (t.name = 'Creator Studio Club' AND g.name = 'Ryhmä B') AS silent,
           (t.name = 'Roblox Builders Club') AS healthy
      FROM public.product_groups g
      JOIN public.products p ON p.id = g.product_id
      JOIN public.product_translations t
        ON t.product_id = p.id AND t.locale = 'en'
      JOIN public.gedu_group_assignments a
        ON a.group_id = g.id AND a.role = 'primary'
      JOIN public.schedule_slots s ON s.product_id = p.id
     WHERE p.product_type IN ('consumer_club', 'municipality_club')
       AND p.start_date <= current_date
       -- Nobody has written up the association's club, so the invoicing page
       -- bills its every past session without a record; and the Esports Pilot
       -- Club never ran — section 12 calls off its every session.
       AND t.name NOT IN ('Association Game Club', 'Esports Pilot Club')
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
       LIMIT CASE WHEN grp.is_remote THEN 31 ELSE 10 END);
    v_total := COALESCE(array_length(v_dates, 1), 0);
    v_people := ARRAY(
      SELECT participant_id FROM public.participations
       WHERE group_id = grp.group_id AND status = 'active'
       ORDER BY participant_id);

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
        v_present := (v_n + abs(hashtext(v_person::text))) % 7 <> 0;
        PERFORM public.record_attendance(
          grp.group_id, d, v_person,
          CASE WHEN v_present THEN 'present' ELSE 'absent' END);

        -- The healthy group's few low answers and notes, placed by how many
        -- sessions back they are and which of the group's children (in id
        -- order) gave them. A scripted answer is given whatever the roll says.
        SELECT s.negative_key, s.note INTO v_negative_key, v_note
          FROM (VALUES
            (3,  1, 'learned',      'too short, i didnt get to finish my obby'),
            (6,  2, NULL,           'can we make a tycoon game next week??'),
            (10, 4, 'groupListens', NULL),
            (15, 5, NULL,           'i scripted a door that opens when you touch it!!')
          ) AS s(sessions_back, child, negative_key, note)
         WHERE grp.healthy AND s.sessions_back = v_n
           AND s.child = array_position(v_people, v_person);
        v_scripted := FOUND;

        CONTINUE WHEN NOT (grp.is_remote AND NOT grp.silent
                           AND (v_scripted
                                OR abs(hashtext('answered' || v_person || d)) % 100
                                   < CASE WHEN v_present THEN 70 ELSE 25 END));

        -- 0 at the oldest session written up, 1 at the latest.
        v_progress := CASE WHEN v_total > 1
                           THEN (v_total - v_n)::numeric / (v_total - 1) ELSE 1 END;
        -- The healthy group rolls neither a note nor a note-only answer.
        v_roll := CASE WHEN grp.healthy THEN 100
                       ELSE abs(hashtext('note' || v_person || d)) % 100 END;
        v_answers := '{}'::jsonb;
        -- Under 4: a note and nothing rated. Otherwise every statement, each
        -- skipped one time in ten, a level around the group's lean.
        IF v_roll >= 4 THEN
          FOREACH v_key IN ARRAY ARRAY['learned', 'fun', 'geduKnowledgeable', 'geduKind', 'groupListens'] LOOP
            CONTINUE WHEN abs(hashtext('skip' || v_key || v_person || d)) % 10 = 0
                      AND v_key IS DISTINCT FROM v_negative_key;
            v_level := CASE
                WHEN v_key = 'groupListens' AND grp.weak_listening THEN 2
                WHEN v_key IN ('geduKnowledgeable', 'geduKind') AND grp.rising_gedu
                  THEN 2 + round(2.5 * v_progress)::integer
                WHEN v_key = 'fun' THEN 5
                ELSE 4
              END + abs(hashtext('level' || v_key || v_person || d)) % 3 - 1;
            IF v_key = v_negative_key THEN
              v_level := 2;
            END IF;
            v_answers := v_answers || jsonb_build_object(v_key, greatest(1, least(5, v_level)));
          END LOOP;
        END IF;

        -- The screen writes on the way out, keyed by the instant the voice
        -- window opened: five minutes before the start, the voice constant.
        v_starts := (d + grp.start_time) AT TIME ZONE grp.timezone;
        v_notes := CASE
          WHEN EXISTS (SELECT 1 FROM jsonb_each(v_answers) WHERE value::integer <= 2)
            THEN v_negative_notes ELSE v_happy_notes END;
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_person::text, 'role', 'authenticated')::text, true);
        INSERT INTO public.session_feedback
          (group_id, participant_id, session_opens_at, answers, note, created_at, updated_at)
        VALUES (
          grp.group_id, v_person, v_starts - interval '5 minutes', v_answers,
          CASE WHEN grp.healthy THEN COALESCE(v_note, '')
               WHEN v_roll < 15
               THEN v_notes[1 + abs(hashtext('which' || v_person || d)) % array_length(v_notes, 1)]
               ELSE '' END,
          v_starts + make_interval(mins => grp.duration_minutes - abs(hashtext('left' || v_person || d)) % 15),
          v_starts + make_interval(mins => grp.duration_minutes - abs(hashtext('left' || v_person || d)) % 15));
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', grp.gedu_id::text, 'role', 'authenticated')::text, true);
      END LOOP;
    END LOOP;

    PERFORM set_config('request.jwt.claims', v_admin_claims, true);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 10. Help requests
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
    PERFORM public.submit_my_help_request(r.message);
    PERFORM set_config('request.jwt.claims', v_admin_claims, true);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 11. Absences, and the substitutions an admin arranged
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

-- Two coming sessions gedu@example.com covers as the sub, arranged by the
-- office, so their My SOG has a substitution card on each side of the 48 hours
-- that open a sub's access to the group: Sofia's online Roblox Builders Club
-- about two weeks out, still locked, and Aino's in-person Minecraft Redstone
-- Club about a day out, already open. gedu@example.com teaches neither product,
-- which is what makes them eligible.
--
-- Each date is the session the product's own schedule projects whose start
-- lies nearest the build plus that lead, read on the product's clock. The
-- Builders club meets once a week, so its nearest session to two weeks out is
-- between ten and eighteen days away on any day of the build. The Redstone
-- club's one slot is the day after the build at the build's time of day, so
-- its nearest session to a day out is that one. Neither absent educator has
-- filed anything, so the admin files for them, which needs a reason.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r       record;
  v_group uuid;
  v_date  date;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Roblox Builders Club',    'Ryhmä A', 'sofia.nieminen@example.com', interval '14 days',
     'other'::public.substitution_reason, 'At a training course in Tampere all that week.'),
    ('Minecraft Redstone Club', 'Ryhmä A', 'aino.virtanen@example.com',  interval '1 day',
     'sick'::public.substitution_reason, 'Fever since this morning, so not in tomorrow.')
  ) AS t(product_name, group_name, absent_email, ahead, reason, reason_note)
  LOOP
    v_group := (SELECT g.id FROM public.product_groups g
                  JOIN public.product_translations t
                    ON t.product_id = g.product_id AND t.locale = 'en'
                 WHERE t.name = r.product_name
                   AND g.name = r.group_name);
    v_date := (SELECT c.day
                 FROM (SELECT p.local_today + i AS day,
                              ((p.local_today + i) + s.start_time) AT TIME ZONE p.timezone AS starts
                         FROM (SELECT pp.id, pp.timezone, pp.start_date, pp.end_date,
                                      (now() AT TIME ZONE pp.timezone)::date AS local_today
                                 FROM public.products pp
                                 JOIN public.product_groups g ON g.product_id = pp.id
                                WHERE g.id = v_group) p
                         JOIN public.schedule_slots s ON s.product_id = p.id
                        CROSS JOIN generate_series(0, 28) i
                        WHERE EXTRACT(ISODOW FROM p.local_today + i)::integer - 1 = s.weekday
                          AND (p.start_date IS NULL OR p.local_today + i >= p.start_date)
                          AND (p.end_date   IS NULL OR p.local_today + i <= p.end_date)
                      ) c
                WHERE c.starts > now()
                ORDER BY abs(EXTRACT(EPOCH FROM c.starts - (now() + r.ahead)))
                LIMIT 1);

    IF v_group IS NULL OR v_date IS NULL THEN
      RAISE NOTICE 'rich-seed: no coming % session to substitute on', r.product_name;
      CONTINUE;
    END IF;

    PERFORM public.set_session_substitution(
      v_group, v_date,
      (SELECT id FROM public.profiles WHERE email = r.absent_email),
      (SELECT id FROM public.profiles WHERE email = 'gedu@example.com'),
      r.reason, r.reason_note);
  END LOOP;
END;
$$;

COMMIT;

-- One request still open, so the pool and the admin's Substitutions page each
-- have one waiting: Lucas files for his online Youth Centre Game Club session
-- nearest four days after the build, Mikko offers to take it and Aino declines,
-- and gedu@example.com has not answered. Their pool lists it with Offer and
-- Decline, and the admin's page shows Mikko's offer to approve above a
-- "Declined:" line naming Aino.
--
-- It has to be a municipality club, because those are the products that ask no
-- qualification: a consumer club, camp or event asks for one nobody seeded here
-- holds, so none of them can be in anybody's pool. gedu@example.com is in this
-- one's on all four tests — certified, not expected at the session, the club
-- run in Finnish, which they speak, and online, which every coverage area
-- reaches. So are Mikko and Aino. The date is read off the schedule the way
-- the block above reads its own: the club runs until two months after the
-- build and meets once a week, so its nearest session to four days out starts
-- between half a day and seven and a half days after the build, on any day.
--
-- Each of the three acts under their own claims: Lucas files with a reason, as
-- a gedu's own filing must, taking the role he holds on the group, and the two
-- answers go through the pool's own buttons.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_group   uuid := (SELECT g.id FROM public.product_groups g
                       JOIN public.product_translations t
                         ON t.product_id = g.product_id AND t.locale = 'en'
                      WHERE t.name = 'Youth Centre Game Club'
                        AND g.name = 'Ryhmä 1');
  -- Every account is read here, under the admin's claims: a gedu's own claims
  -- cannot see another gedu's profile.
  v_lucas   uuid := (SELECT id FROM public.profiles WHERE email = 'lucas.moreau@example.com');
  v_mikko   uuid := (SELECT id FROM public.profiles WHERE email = 'mikko.lehtinen@example.com');
  v_aino    uuid := (SELECT id FROM public.profiles WHERE email = 'aino.virtanen@example.com');
  v_date    date;
  v_request uuid;
BEGIN
  v_date := (SELECT c.day
               FROM (SELECT p.local_today + i AS day,
                            ((p.local_today + i) + s.start_time) AT TIME ZONE p.timezone AS starts
                       FROM (SELECT pp.id, pp.timezone, pp.start_date, pp.end_date,
                                    (now() AT TIME ZONE pp.timezone)::date AS local_today
                               FROM public.products pp
                               JOIN public.product_groups g ON g.product_id = pp.id
                              WHERE g.id = v_group) p
                       JOIN public.schedule_slots s ON s.product_id = p.id
                      CROSS JOIN generate_series(0, 28) i
                      WHERE EXTRACT(ISODOW FROM p.local_today + i)::integer - 1 = s.weekday
                        AND (p.start_date IS NULL OR p.local_today + i >= p.start_date)
                        AND (p.end_date   IS NULL OR p.local_today + i <= p.end_date)
                    ) c
              WHERE c.starts > now()
              ORDER BY abs(EXTRACT(EPOCH FROM c.starts - (now() + interval '4 days')))
              LIMIT 1);

  IF v_group IS NULL OR v_date IS NULL THEN
    RAISE NOTICE 'rich-seed: no coming Youth Centre Game Club session to leave open';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_lucas::text, 'role', 'authenticated')::text, true);
  v_request := (public.request_session_substitution(
                  v_group, v_date, 'other'::public.substitution_reason,
                  'Visiting family in Lyon that week.') ->> 'id')::uuid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_mikko::text, 'role', 'authenticated')::text, true);
  PERFORM public.offer_session_substitution(v_request);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_aino::text, 'role', 'authenticated')::text, true);
  PERFORM public.decline_session_substitution(v_request);
END;
$$;

COMMIT;

-- Last month, a substitution each way round gedu@example.com, so their
-- Invoicing page has a settled one of each on the month before the build: an
-- afternoon they were away from and Mikko ran (an "away" line naming him, and a
-- paid line on Mikko's page), and one they ran for Sofia on the municipality
-- club (a paid line naming her, on the municipality subtotal).
--
-- Both are past, and a gedu cannot file for a past session, so the admin records
-- them the way an off-platform substitution is recorded: through the seating RPC
-- with no request in place, which files one on the absent gedu's behalf, already
-- substituted, with the reason a filing needs. Each date is the group's latest
-- session in the previous calendar month, which section 9 has already written
-- up as the group's own educator. The sub then writes the report and takes the
-- register over again, so the record reads as theirs — but only while their
-- access to the group is still open, fifteen days from the session, so a stack
-- built late in a month keeps the absent educator's record of it. The session
-- pays the sub either way: what pays is that a record exists, not who wrote it.

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
  v_month_start date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_month_end   date := date_trunc('month', current_date)::date - 1;
  r        record;
  v_group  uuid;
  v_date   date;
  v_sub    uuid;
  v_people uuid[];
  v_person uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Minecraft Java Club',   'Ryhmä A', 'gedu@example.com',           'mikko.lehtinen@example.com',
     'other'::public.substitution_reason, 'Family wedding abroad, booked in the spring.',
     'Mikko here, covering for Gedu. We carried on with the redstone door project and everyone got theirs opening by the end.'),
    ('Autumn Term Game Club', 'Ryhmä 1', 'sofia.nieminen@example.com', 'gedu@example.com',
     'sick'::public.substitution_reason, 'Lost her voice, back the following week.',
     'Covering for Sofia today. The group finished their shared build for the end of term and showed it to each other.')
  ) AS t(product_name, group_name, absent_email, sub_email, reason, reason_note, report)
  LOOP
    v_group := (SELECT g.id FROM public.product_groups g
                  JOIN public.product_translations t
                    ON t.product_id = g.product_id AND t.locale = 'en'
                 WHERE t.name = r.product_name
                   AND g.name = r.group_name);
    v_date := (SELECT dd::date
                 FROM public.product_groups g
                 JOIN public.products p ON p.id = g.product_id
                 JOIN public.schedule_slots s ON s.product_id = p.id
                CROSS JOIN LATERAL generate_series(
                        GREATEST(p.start_date, v_month_start),
                        LEAST(v_month_end, current_date - 1,
                              COALESCE(p.end_date, v_month_end)),
                        interval '1 day') dd
                WHERE g.id = v_group
                  AND EXTRACT(ISODOW FROM dd)::integer - 1 = s.weekday
                ORDER BY dd DESC
                LIMIT 1);

    IF v_group IS NULL OR v_date IS NULL THEN
      RAISE NOTICE 'rich-seed: no % session last month to substitute on', r.product_name;
      CONTINUE;
    END IF;

    v_sub := (SELECT id FROM public.profiles WHERE email = r.sub_email);
    PERFORM public.set_session_substitution(
      v_group, v_date,
      (SELECT id FROM public.profiles WHERE email = r.absent_email),
      v_sub, r.reason, r.reason_note);

    v_people := ARRAY(
      SELECT participant_id FROM public.participations
       WHERE group_id = v_group AND status = 'active');

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_sub::text, 'role', 'authenticated')::text, true);

    IF public.gedu_substitutes_group(v_group) THEN
      PERFORM public.set_group_session_notes(v_group, v_date, r.report, NULL);
      FOREACH v_person IN ARRAY COALESCE(v_people, ARRAY[]::uuid[]) LOOP
        PERFORM public.record_attendance(v_group, v_date, v_person, 'present');
      END LOOP;
    ELSE
      RAISE NOTICE 'rich-seed: % % on % is past %''s access, so its record stays as the group''s educator wrote it',
        r.product_name, r.group_name, v_date, r.sub_email;
    END IF;

    PERFORM set_config('request.jwt.claims', v_admin_claims, true);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 12. Cancelled sessions
-- =============================================================================
-- Sessions an admin called off, through the admin's own RPC. Three are each on a
-- group one of parent@example.com's children sits in, so the family's My SOG,
-- the gedu's and the admin's all have one to show:
--
--   * a PAST session of the Schools Game Club that had already been written up
--     — the record is kept, frozen and hidden, and the date is never billed;
--   * an upcoming Minecraft Java Club session that is NOT the next one, so it
--     shows in its dated place on the feeds without touching the card's next
--     session (or the substitution section 11 seated on the next one);
--   * the NEXT session of the Creator Studio Club, the online club Otso and Nea
--     attend, so their cards name the session after it and say which is off.
--
-- And a fourth kind, for the municipality invoicing page: every session of the
-- Esports Pilot Club, the one-month pilot Tampere's education services bought,
-- so that customer's month has nothing to bill and its file is refused.
--
-- Every date is derived from the schedule rather than written out. `cancel_session`
-- itself refuses a date the schedule does not project and that holds no record.
-- group_sessions has no grant for `authenticated`, so the past date is derived
-- exactly as section 9 derived the dates it wrote up — the second most recent of
-- them — rather than looked up.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r       record;
  v_group uuid;
  v_date  date;
BEGIN
  -- The past one: the second most recent date up to yesterday, which section 9
  -- has already written up.
  v_group := (SELECT pa.group_id
                FROM public.participations pa
                JOIN public.profiles pr ON pr.id = pa.participant_id
                JOIN public.product_translations t
                  ON t.product_id = pa.product_id AND t.locale = 'en'
               WHERE t.name = 'Schools Game Club'
                 AND pr.email = 'milo@gamer.example.com'
                 AND pa.status = 'active');
  v_date := (SELECT dd::date
               FROM public.product_groups g
               JOIN public.products p ON p.id = g.product_id
               JOIN public.schedule_slots s ON s.product_id = p.id
              CROSS JOIN LATERAL generate_series(
                      p.start_date,
                      LEAST(current_date - 1, COALESCE(p.end_date, current_date - 1)),
                      interval '1 day') dd
              WHERE g.id = v_group
                AND EXTRACT(ISODOW FROM dd)::integer - 1 = s.weekday
              ORDER BY dd DESC
             OFFSET 1 LIMIT 1);
  IF v_group IS NULL OR v_date IS NULL THEN
    RAISE NOTICE 'rich-seed: no written-up Schools Game Club session to cancel';
  ELSE
    PERFORM public.cancel_session(v_group, v_date,
      'The school closed for an exam day. Logged by mistake; the city was told in advance.');
  END IF;

  -- The upcoming ones: the nth session still to finish, counted from
  -- product-local today on the product's own slots and term.
  FOR r IN SELECT * FROM (VALUES
    ('Minecraft Java Club', 'milo@gamer.example.com', 2,
     'The Java server is down for an upgrade that week.'),
    ('Creator Studio Club', 'otso@gamer.example.com', 1,
     'The educator is at a training day; the group meets again the week after.')
  ) AS t(product_name, gamer_email, nth, reason)
  LOOP
    v_group := (SELECT pa.group_id
                  FROM public.participations pa
                  JOIN public.profiles pr ON pr.id = pa.participant_id
                  JOIN public.product_translations t
                    ON t.product_id = pa.product_id AND t.locale = 'en'
                 WHERE t.name = r.product_name
                   AND pr.email = r.gamer_email
                   AND pa.status = 'active');
    v_date := (SELECT upcoming.day
                 FROM (SELECT DISTINCT p.local_today + i AS day
                         FROM (SELECT pp.id, pp.timezone, pp.start_date, pp.end_date,
                                      (now() AT TIME ZONE pp.timezone)::date AS local_today
                                 FROM public.products pp
                                 JOIN public.product_groups g ON g.product_id = pp.id
                                WHERE g.id = v_group) p
                         JOIN public.schedule_slots s ON s.product_id = p.id
                        CROSS JOIN generate_series(0, 70) i
                        WHERE EXTRACT(ISODOW FROM p.local_today + i)::integer - 1 = s.weekday
                          AND (p.start_date IS NULL OR p.local_today + i >= p.start_date)
                          AND (p.end_date   IS NULL OR p.local_today + i <= p.end_date)
                          AND ((p.local_today + i) + s.start_time
                                 + make_interval(mins => s.duration_minutes))
                                AT TIME ZONE p.timezone > now()
                      ) upcoming
                ORDER BY upcoming.day
               OFFSET r.nth - 1 LIMIT 1);
    IF v_group IS NULL OR v_date IS NULL THEN
      RAISE NOTICE 'rich-seed: no upcoming % session to cancel', r.product_name;
    ELSE
      PERFORM public.cancel_session(v_group, v_date, r.reason);
    END IF;
  END LOOP;

  -- The pilot: every date its one group was due, all of them past.
  FOR r IN
    SELECT g.id AS group_id, dd::date AS day
      FROM public.product_groups g
      JOIN public.products p ON p.id = g.product_id
      JOIN public.product_translations t
        ON t.product_id = p.id AND t.locale = 'en'
      JOIN public.schedule_slots s ON s.product_id = p.id
     CROSS JOIN LATERAL generate_series(p.start_date, p.end_date, interval '1 day') dd
     WHERE t.name = 'Esports Pilot Club'
       AND EXTRACT(ISODOW FROM dd)::integer - 1 = s.weekday
     ORDER BY dd
  LOOP
    PERFORM public.cancel_session(r.group_id, r.day,
      'The school''s computer room was not ready; the pilot moves to next term.');
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 13. Team profiles
-- =============================================================================
-- Every admin and Gedu this file made has a profile, and all but one are
-- public, so the public team page shows four leaders and fifteen Gedus. The
-- one that is not is the second admin's, ready and waiting for an admin to
-- make it public, in English and Finnish.
-- Aino's is public, in English only and with no pick, and exists for its
-- headline: "TheRedstoneArchitect" is twenty characters, the longest nickname
-- each surface is sized for, so a local stack shows a long name wrapping with
-- the nickname whole on its own line. With no pick, her card also shows the
-- neutral frame.
-- The rest vary what a reader's locale falls back over: several are written
-- in English alone, most in English and Finnish, three in Finnish alone, one
-- in English and Swedish and one in English and French; a few have no pick
-- and a few no fun fact.
-- Each is saved by its own person through save_team_profile, marked ready,
-- and the owner's admin then makes every one but the second admin's public
-- through set_team_profile_approval, as any profile goes public.
-- save_team_profile will not
-- take a checkbox that is on without a photo, nor a photo path the bucket
-- holds no object for — so each photo's object row is put in place here,
-- empty, and `scripts/local-db/rich-images.sh` replaces it with the real
-- upload straight after this file, from the drawn silhouettes in
-- `supabase/seed-images/team/`. Applying this file by hand leaves every photo
-- without its bytes.

BEGIN;
INSERT INTO storage.objects (bucket_id, name)
SELECT 'team-photos', p.id::text || '/seed.jpg'
  FROM public.profiles p
 WHERE p.role IN ('admin', 'gedu');

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_admin  uuid := (SELECT id FROM public.profiles WHERE email = 'admin@example.com');
  v_admin2 uuid := (SELECT id FROM public.profiles WHERE email = 'admin2@example.com');
  v_gedu   uuid := (SELECT id FROM public.profiles WHERE email = 'gedu@example.com');
  v_aino   uuid := (SELECT id FROM public.profiles WHERE email = 'aino.virtanen@example.com');
  v_id     uuid;
  r        record;
BEGIN
  PERFORM public.save_team_profile(
    p_user_id      => v_admin,
    p_translations => jsonb_build_array(jsonb_build_object(
      'locale', 'en',
      'short_description', 'I keep the catalogue, the calendar and the Gedus pointed the same way.',
      'long_description', E'I look after our clubs, camps and events from the first idea to the last session.\n\nMost of my week goes on:\n\n- **Planning** the calendar with schools and municipalities\n- **Training** new Gedus before their first session\n- **Answering** families when something needs sorting out',
      'fun_fact', 'I still have the first Minecraft world I ever built, and it still has no roof.')),
    p_nickname     => 'Blockkeeper',
    p_title        => 'Chief Engineer',
    p_pick         => 11::smallint,
    p_photo_path   => v_admin::text || '/seed.jpg',
    p_opted_in     => true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin2::text, 'role', 'authenticated')::text, true);

  PERFORM public.save_team_profile(
    p_user_id      => v_admin2,
    p_translations => jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'I plan the club calendar and keep our two campuses running smoothly.',
        'long_description', E'I coordinate club schedules, venues and the Gedus who run them.\n\nMost days I am:\n\n- **Booking** rooms and adjusting the calendar\n- *Checking in* with Gedus before a new term starts\n- Keeping the roster tidy so nothing double-books',
        'fun_fact', 'My desk plant has outlived three office moves.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Suunnittelen kerhojen aikataulut ja pidän kaksi toimipistettämme sujuvina.',
        'long_description', E'Koordinoin kerhojen aikatauluja, tiloja ja niitä ohjaavia Geduja.\n\nUseimpina päivinä minä:\n\n- **Varaan** tiloja ja päivitän kalenteria\n- *Käyn läpi* asioita Gedujen kanssa ennen uuden kauden alkua\n- Pidän listat siistinä, ettei mikään mene päällekkäin')),
    p_nickname     => 'Slotmaster',
    p_title        => 'Head of Clubs',
    p_pick         => 3::smallint,
    p_photo_path   => v_admin2::text || '/seed.jpg',
    p_opted_in     => true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_gedu::text, 'role', 'authenticated')::text, true);

  PERFORM public.save_team_profile(
    p_user_id      => v_gedu,
    p_translations => jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Redstone nerd, speedrun cheerleader and the Gedu with one more build challenge up his sleeve.',
        'long_description', E'I run Minecraft and Roblox sessions, mostly in Helsinki and Espoo.\n\n**In my sessions:**\n\n- Build challenges where every team finishes something they are proud of\n- Redstone doors, traps and the occasional very loud machine\n- Team games where the quiet players get the ball too',
        'fun_fact', 'I once built a working calculator out of redstone. It could add up to seven.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Punakivinörtti, speedrun-kannustaja ja Gedu, jolla on aina yksi rakennushaaste varalla.',
        'long_description', E'Vedän Minecraft- ja Roblox-sessioita, enimmäkseen Helsingissä ja Espoossa.\n\n**Sessioissani:**\n\n- Rakennushaasteita, joissa jokainen tiimi saa valmiiksi jotain, mistä on ylpeä\n- Punakiviovia, ansoja ja silloin tällöin hyvin äänekäs kone\n- Joukkuepelejä, joissa myös hiljaisemmat pelaajat pääsevät mukaan',
        'fun_fact', 'Rakensin kerran punakivestä toimivan laskimen. Se osasi laskea seitsemään asti.')),
    p_nickname     => 'Creeperhug',
    p_pick         => 6::smallint,
    p_photo_path   => v_gedu::text || '/seed.jpg',
    p_opted_in     => true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_aino::text, 'role', 'authenticated')::text, true);

  PERFORM public.save_team_profile(
    p_user_id      => v_aino,
    p_translations => jsonb_build_array(jsonb_build_object(
      'locale', 'en',
      'short_description', 'I design the builds our club teams spend a whole term finishing.',
      'long_description', E'I run Minecraft build clubs in Helsinki and Espoo.\n\n**What we make together:**\n\n- Towns planned street by street before the first block goes down\n- Redstone that opens, lights up or plays a tune\n- Showcases where every builder walks the others through their part',
      'fun_fact', NULL)),
    p_nickname     => 'TheRedstoneArchitect',
    p_photo_path   => v_aino::text || '/seed.jpg',
    p_opted_in     => true);

  -- Everyone else, each saving their own: three admins with a title and
  -- twelve Gedus without one. A translation is {locale, short_description,
  -- long_description, fun_fact}, exactly as save_team_profile takes it.
  FOR r IN SELECT * FROM (VALUES
    ('juha.makela@example.com', 'Kippari', 'CEO', 1::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'I started School of Gaming because every child who loves games deserves a club where that love counts for something.',
        'long_description', E'I grew up on a farm outside Seinäjoki with a slow internet connection and a very fast Nintendo 64. Games taught me English, teamwork and how to lose gracefully, mostly to my little sister.\n\nThese days I spend my time with the people who make our clubs happen: schools, municipalities, partners and, best of all, our Gedus. I still drop in on a session whenever I can, usually to be beaten at Mario Kart by a nine-year-old.\n\n**What I care about most:**\n\n- Clubs that feel like a team, not a classroom\n- Parents knowing what their child actually does in a session\n- Growing carefully, so every new town gets clubs as good as the first ones',
        'fun_fact', 'I have finished Ocarina of Time eleven times and I still get lost in the Water Temple.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Perustin School of Gamingin, koska jokainen pelejä rakastava lapsi ansaitsee kerhon, jossa se innostus otetaan tosissaan.',
        'long_description', E'Kasvoin maatilalla Seinäjoen lähellä hitaan nettiyhteyden ja hyvin nopean Nintendo 64:n parissa. Pelit opettivat minulle englantia, tiimityötä ja häviämisen taitoa, enimmäkseen pikkusiskoani vastaan.\n\nNykyään vietän aikani niiden ihmisten kanssa, jotka tekevät kerhoistamme totta: koulujen, kuntien, kumppaneiden ja ennen kaikkea Gedujemme. Piipahdan sessioissa aina kun ehdin, yleensä hävitäkseni Mario Kartissa yhdeksänvuotiaalle.\n\n**Mikä minulle on tärkeintä:**\n\n- Kerhot, jotka tuntuvat joukkueelta eivätkä luokkahuoneelta\n- Vanhemmat, jotka tietävät, mitä lapsi sessiossa oikeasti tekee\n- Harkittu kasvu, jotta jokainen uusi paikkakunta saa yhtä hyvät kerhot kuin ensimmäiset',
        'fun_fact', 'Olen pelannut Ocarina of Timen läpi yksitoista kertaa, ja eksyn silti Water Templeen.'))),
    ('helena.strand@example.com', 'Fyren', 'Head of Education', 9::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'I make sure what happens in a session is worth a child''s afternoon.',
        'long_description', E'Before School of Gaming I taught maths and crafts at a Swedish-speaking school in Vaasa for twelve years. The day a pupil explained fractions to me with Minecraft slabs, I knew where I wanted to work next.\n\nI write the session plans our Gedus run, and I keep improving them with everything Gedus and families tell us.\n\n- Every session has one thing to learn and plenty to play\n- Plans work just as well in Finnish, Swedish and English\n- Quieter gamers get a role that suits them, not whatever is left over',
        'fun_fact', 'I am knitting a scarf in the colours of every club I have visited. It is four metres long so far.'),
      jsonb_build_object(
        'locale', 'sv',
        'short_description', 'Jag ser till att det som händer under en session är värt ett barns eftermiddag.',
        'long_description', E'Innan School of Gaming undervisade jag i matematik och slöjd vid en svenskspråkig skola i Vasa i tolv år. Den dagen en elev förklarade bråk för mig med Minecraft-plattor visste jag var jag ville jobba härnäst.\n\nJag skriver sessionsplanerna som våra Geduer använder, och jag förbättrar dem hela tiden utifrån det som Geduer och familjer berättar för oss.\n\n- Varje session har en sak att lära sig och massor att spela\n- Planerna fungerar lika bra på finska, svenska och engelska\n- Tystare gamers får en roll som passar dem, inte det som blir över',
        'fun_fact', 'Jag stickar en halsduk i färgerna från varje klubb jag har besökt. Hittills är den fyra meter lång.'))),
    ('daniel.okafor@example.com', 'Loremaster', 'Community Lead', NULL::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'I look after our Discord, our events and the people who make both worth turning up to.',
        'long_description', E'I moved to Helsinki from Manchester for a job in mobile games and stayed for the saunas. Community has always been my thing: I ran a Pokémon league at my local library when I was fourteen and never really stopped organising.\n\nAt School of Gaming I run our online community and the events families come to in person, from LAN days to parents'' evenings.\n\n**Come and say hello at:**\n\n- Our seasonal tournaments, where I am usually on commentary\n- Parents'' evenings, where I promise to explain what a battle pass is\n- The Discord, where I read every suggestion, even the ones asking for a pizza channel',
        'fun_fact', 'My Pokémon card binder is older than most of our gamers, and I still know where every card is.'))),
    ('mikko.lehtinen@example.com', 'Revontuli', NULL, 2::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Rakennan mieluiten isoja juttuja yhdessä: linnoja, kaupunkeja ja joskus kokonaisen saariston.',
        'long_description', E'Olen vetänyt Minecraft-kerhoja Helsingissä kolme vuotta. Parasta on hetki, kun ryhmä huomaa, että yhteinen rakennelma on paljon hienompi kuin kenenkään oma.\n\n**Sessioissani:**\n\n- Suunnitellaan ensin paperilla ja rakennetaan sitten\n- Jokainen saa oman vastuualueen, vaikka se olisi vain kaivon katto\n- Lopuksi kierretään katsomassa, mitä muut saivat aikaan',
        'fun_fact', 'Olen pelannut samaa Minecraft-maailmaa vuodesta 2013. Sen keskellä seisoo yhä ensimmäinen multamajani.'))),
    ('sofia.nieminen@example.com', 'Paintbucket', NULL, 13::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Pixel artist, Roblox builder and the Gedu who will always ask what colour your castle should be.',
        'long_description', E'I studied graphic design in Tampere and found my way to School of Gaming through a summer camp. Now I run creative sessions where the art matters as much as the gameplay.\n\n- Pixel art and textures for our own resource packs\n- Roblox Studio builds with a proper colour palette\n- Showcases where everyone explains one choice they made',
        'fun_fact', 'I have a sticker on my laptop for every game jam I have entered. There are nineteen.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Pikselitaiteilija, Roblox-rakentaja ja se Gedu, joka kysyy aina, minkä värinen linnasi pitäisi olla.',
        'long_description', E'Opiskelin graafista suunnittelua Tampereella ja päädyin School of Gamingiin kesäleirin kautta. Nyt vedän luovia sessioita, joissa grafiikka on yhtä tärkeää kuin pelattavuus.\n\n- Pikselitaidetta ja tekstuureja omiin resurssipaketteihimme\n- Roblox Studio -rakennelmia kunnollisella väripaletilla\n- Esittelyjä, joissa jokainen kertoo yhdestä tekemästään valinnasta',
        'fun_fact', 'Läppärissäni on tarra jokaisesta game jamista, johon olen osallistunut. Niitä on yhdeksäntoista.'))),
    ('lucas.moreau@example.com', 'Wallrunner', NULL, 4::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Parkour maps, speedruns and terrible puns, in English or French.',
        'long_description', E'I grew up in Lyon and came to Finland to study game design. I run Minecraft parkour and Roblox obby sessions, which mostly means building jumps that are hard but fair, then watching gamers clear them faster than I can.\n\n**Expect:**\n\n- Courses we design and test together\n- Timed runs where everyone chases their own best time\n- A little French, if you want to learn how to say "one more go"',
        'fun_fact', 'I once finished a parkour map with my eyes closed. It was a very short map.'),
      jsonb_build_object(
        'locale', 'fr',
        'short_description', 'Des cartes de parkour, du speedrun et de très mauvais jeux de mots, en français ou en anglais.',
        'long_description', E'J’ai grandi à Lyon et je suis venu en Finlande pour étudier le game design. J’anime des sessions de parkour sur Minecraft et d’obby sur Roblox : je construis des sauts difficiles mais justes, puis je regarde les joueurs les franchir plus vite que moi.\n\n**Au programme :**\n\n- Des parcours que l’on imagine et teste ensemble\n- Des courses chronométrées où chacun bat son propre record\n- Un peu de français, si tu veux apprendre à dire « on refait un essai »',
        'fun_fact', 'J’ai terminé une carte de parkour les yeux fermés. C’était une toute petite carte.'))),
    ('emma.koskinen@example.com', 'Kettu', NULL, NULL::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'New to the team and already outnumbered by axolotls.',
        'long_description', E'I am studying to be a primary school teacher in Espoo and joined School of Gaming this autumn. I love cosy games: farming, building and looking after animals.\n\nIn my sessions we take it slowly, help each other out and always leave time to show off what we made.',
        'fun_fact', NULL),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Uusi tiimissä ja jo nyt aksolotlien piirittämä.',
        'long_description', E'Opiskelen luokanopettajaksi Espoossa ja aloitin School of Gamingissa tänä syksynä. Rakastan rauhallisia pelejä: maanviljelyä, rakentamista ja eläinten hoitamista.\n\nSessioissani edetään rauhassa, autetaan toisia ja jätetään aina aikaa esitellä, mitä saatiin aikaan.',
        'fun_fact', NULL))),
    ('oliver.grant@example.com', 'OllieOops', NULL, 8::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Helping out in the Minecraft Java club this term and learning something new from the gamers every week.',
        'long_description', E'I moved to Finland from Bristol last year and joined School of Gaming as a trainee. Right now I help out in the Minecraft Java club, where the gamers are very patient with my redstone.\n\nAt home I play a lot of Mario Kart and Stardew Valley, and I am slowly building a pixel art version of my street.',
        'fun_fact', 'I can name every Mario Kart track since the SNES, in order.'))),
    ('joonas.heinonen@example.com', 'Joonatron', NULL, 5::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Fortnite-rakentaja ja joukkuepelien ystävä. Minun sessioissani kukaan ei jää penkille.',
        'long_description', E'Olen pelannut Fortnitea sen ensimmäisestä kaudesta asti, ja nykyään rakennan Creative-tilassa omia kenttiä kerholaisille.\n\n**Mitä teemme:**\n\n- Joukkuepelejä, joissa voitetaan yhdessä ja hävitään yhdessä\n- Omia kenttiä, joita testataan ja parannetaan viikko viikolta\n- Reilua peliä: hyvä pelikaveri on tärkeämpi kuin voitto',
        'fun_fact', 'Olen pelannut salibandyä maalivahtina viisitoista vuotta, mikä selittää refleksini.'))),
    ('veera.laaksonen@example.com', 'Myrskylyhty', NULL, 15::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Vedän Minecraft Education -sessioita, joissa matikka ja historia piiloutuvat rakennushaasteisiin.',
        'long_description', E'Olen koulutukseltani historian opettaja, ja Minecraft Education on minulle paras tapa herättää menneisyys henkiin. Olemme rakentaneet keskiaikaisen linnan, viikinkikylän ja kerran koko Turun tuomiokirkon.\n\nSessioissani jokainen löytää oman tapansa osallistua: joku rakentaa, joku suunnittelee ja joku keksii tarinan, joka sitoo kaiken yhteen.',
        'fun_fact', NULL))),
    ('tuomas.rautio@example.com', 'Boostpad', NULL, 7::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Rocket League, racing games and anything with a scoreboard. I coach teamwork, not just aim.',
        'long_description', E'I have played Rocket League since 2016 and coached school esports teams in Vantaa for the last three seasons.\n\n**What we practise:**\n\n- Calling out plays so the whole team knows the plan\n- Rotating, so nobody is stuck in goal all match\n- Losing a game, shaking hands and queueing again',
        'fun_fact', 'I have spent more hours in Rocket League training packs than in actual matches.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Rocket League, ajopelit ja kaikki, missä on tulostaulu. Valmennan tiimityötä, en pelkkää tähtäämistä.',
        'long_description', E'Olen pelannut Rocket Leaguea vuodesta 2016 ja valmentanut koulujen e-urheilujoukkueita Vantaalla kolmen kauden ajan.\n\n**Mitä harjoittelemme:**\n\n- Pelikutsuja, jotta koko joukkue tietää suunnitelman\n- Kiertoa, ettei kukaan jumitu maaliin koko otteluksi\n- Häviämistä, kättelyä ja uutta yritystä',
        'fun_fact', 'Olen viettänyt Rocket Leaguen harjoituspakettien parissa enemmän tunteja kuin oikeissa otteluissa.'))),
    ('priya.nair@example.com', 'Nebula', NULL, 12::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Coder, game designer and proud space nerd. I help gamers turn the idea they keep doodling in class into a real game they can actually play.',
        'long_description', E'I came to Helsinki from Bangalore to study computer science, and I have been making small games ever since: puzzle games, a very buggy space shooter and one about a cat who runs a bakery.\n\nAt School of Gaming I run our Game Studio and AI sessions. We start with an idea on paper, turn it into rules and then into code, in Roblox Studio, Minecraft Education''s Code Builder or Scratch, depending on who is in the room.\n\n**What gamers leave with:**\n\n- A game they designed themselves, however small\n- The confidence to read an error message instead of panicking\n- A feel for how the games they love are actually made\n\nI also love talking to parents about where an interest in games can lead, so do come and say hello after a session.',
        'fun_fact', 'I have named every houseplant I own after a moon of Jupiter. There are nine so far.'))),
    ('niklas.holmberg@example.com', 'Holmy', NULL, 10::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Map maker, Minecraft Bedrock fan and the person to ask about command blocks.',
        'long_description', E'I make adventure maps in Minecraft Bedrock: hidden levers, secret rooms and a story you only understand at the end. In my sessions gamers build their own, then swap and play each other''s.\n\nI speak Finnish, Swedish and English, so ask me for help in whichever feels easiest.',
        'fun_fact', 'The final boss of my first adventure map was a very angry chicken.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Karttojen tekijä, Minecraft Bedrock -fani ja se, jolta kannattaa kysyä komentokuutioista.',
        'long_description', E'Teen Minecraft Bedrockiin seikkailukarttoja: piilotettuja vipuja, salahuoneita ja tarinan, jonka ymmärtää vasta lopussa. Sessioissani pelaajat rakentavat omansa ja pelaavat sitten toistensa karttoja.\n\nPuhun suomea, ruotsia ja englantia, joten voit pyytää apua sillä kielellä, joka tuntuu helpoimmalta.',
        'fun_fact', 'Ensimmäisen seikkailukarttani loppuvastus oli hyvin vihainen kana.'))),
    ('lotta.saarinen@example.com', 'Lumipallo', NULL, NULL::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Roblox obbies, Minecraft mini-games and a lot of cheering.',
        'long_description', E'I run Roblox and Minecraft sessions in Espoo, mostly for our younger gamers. We play together first, then build our own version and see whose turned out the trickiest.\n\nMy favourite moment is when a gamer who was too shy to talk in the first week is showing everyone their build by the last one.',
        'fun_fact', 'I have a cat called Creeper. She is exactly as sneaky as the name suggests.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Roblox-obbyja, Minecraft-minipelejä ja paljon kannustusta.',
        'long_description', E'Vedän Roblox- ja Minecraft-sessioita Espoossa, enimmäkseen nuorimmille pelaajillemme. Pelaamme ensin yhdessä, sitten rakennamme oman version ja katsomme, kenen radasta tuli kaikkein kinkkisin.\n\nLempihetkeni on se, kun ensimmäisellä viikolla liian ujo pelaaja esittelee viimeisellä kerralla rakennelmaansa kaikille.',
        'fun_fact', 'Minulla on Creeper-niminen kissa. Se on juuri niin salakavala kuin nimestä voi päätellä.'))),
    ('ben.carter@example.com', 'Benchmark', NULL, 14::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Fortnite, esports and good sportsmanship.',
        'long_description', E'I grew up in Leeds playing every football game going, and now I run esports sessions in Helsinki.\n\n- Squad tactics in Fortnite\n- Warm-ups that are actually fun\n- Saying "good game" and meaning it',
        'fun_fact', 'There is a framed screenshot of my first Victory Royale on my living room wall.'))),
    ('ronja.kallio@example.com', 'Ukkonen', NULL, 16::smallint, jsonb_build_array(
      jsonb_build_object(
        'locale', 'en',
        'short_description', 'Pixel art, music and indie games. I will help you make a game that sounds as good as it looks.',
        'long_description', E'I make chiptune music and pixel art, and I have released two tiny games of my own. In Game Studio sessions I help gamers give their games a look and a sound that are all theirs.\n\n**We try out:**\n\n- Drawing sprites one pixel at a time\n- Recording sound effects with our own voices\n- Building a short level that tells a story without words',
        'fun_fact', 'My band only plays songs from game soundtracks. Our best crowd ever was a school disco.'),
      jsonb_build_object(
        'locale', 'fi',
        'short_description', 'Pikselitaidetta, musiikkia ja indiepelejä. Autan tekemään pelin, joka kuulostaa yhtä hyvältä kuin näyttää.',
        'long_description', E'Teen chiptune-musiikkia ja pikselitaidetta, ja olen julkaissut kaksi omaa pientä peliä. Game Studio -sessioissa autan pelaajia antamaan peleilleen ihan oman näköisensä ilmeen ja äänen.\n\n**Kokeilemme:**\n\n- Hahmojen piirtämistä pikseli kerrallaan\n- Ääniefektien äänittämistä omalla äänellä\n- Lyhyttä tasoa, joka kertoo tarinan ilman sanoja',
        'fun_fact', 'Bändini soittaa pelkkiä pelien tunnusmusiikkeja. Paras yleisömme oli koulun disko.')))
  ) AS t(email, nickname, title, pick, translations)
  LOOP
    -- The id is read under the owner admin's claims: the previous person's
    -- would not let it see anyone else's profile row.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    v_id := (SELECT id FROM public.profiles WHERE email = r.email);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.save_team_profile(
      p_user_id      => v_id,
      p_translations => r.translations,
      p_nickname     => r.nickname,
      p_title        => r.title,
      p_pick         => r.pick,
      p_photo_path   => v_id::text || '/seed.jpg',
      p_opted_in     => true);
  END LOOP;

  -- The owner's admin makes every profile public but the second admin's,
  -- which stays waiting, so the user page shows Make public live.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  FOR v_id IN SELECT tp.user_id FROM public.team_profiles tp
               WHERE tp.user_id <> v_admin2
  LOOP
    PERFORM public.set_team_profile_approval(v_id, true);
  END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- 14. The Library
-- =============================================================================
-- Six articles, one per state the admin list and editor can show, and the
-- language versions a reader's fallback has to choose between:
--
--   Talking with your child about who they meet online   live, unchanged since;
--                                                        English and Finnish
--   Playing together: how to join your child's game     live, with unpublished changes
--   Minecraft, Roblox and Fortnite: what's the difference?   live, no cover;
--                                                        English and Finnish
--   What children learn when they build together        draft, ready to publish;
--                                                        Finnish begun, not complete
--   Getting ready for your child's first club session   draft, missing summary,
--                                                        category and cover
--   Pelikerho koulupäivän jälkeen                       live, Finnish only
--
-- Written through the admin RPCs, so each published copy is exactly what
-- publish_library_article makes of its working copy. The covers are not here,
-- for the reason the products' pictures are not: `rich-images.sh` uploads
-- them and links each to both copies of the articles in its category.

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'admin@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- 1. Live, and the working copy is what readers see.
  v_id := public.create_library_article(
    p_category => 'online_safety',
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale',  'en',
      'title',   'Talking with your child about who they meet online',
      'summary', 'Most of what children meet in online games is ordinary play. A few calm conversations help them spot the part that isn''t, and tell you about it.',
      'body',    $md$
Minecraft, Roblox, Fortnite and most of the games children love are social places. Your child may play alongside friends from school, and alongside people they have never met. That is not something to fear, but it is something to talk about: early, calmly and more than once.

## Start with curiosity, not rules

Ask your child to show you what they play and who they play with. **Watching a session together** tells you more than any settings menu, and it tells your child that games are something they can talk to you about.

## Three things every child should know

- **A stranger online is still a stranger**, however friendly they seem and however long they have shared a server.
- **Personal details stay private**: full name, school, address, phone number and photos.
- **They can always tell you** when something feels wrong, and telling you will not cost them their games.

That last point matters most. Children often keep quiet about a bad experience because they expect the console to be taken away. Say out loud that telling you will never be what gets them into trouble.

## Use the tools the platforms give you

### Parental controls

Consoles, and most games, have settings for chat, friend requests and spending. Set them up together with your child, so they understand what each one does and why it is there.

### Age ratings

A PEGI label tells you the age a game's content suits, and its descriptors say whether the game has in-game purchases. The [PEGI website](https://pegi.info/) explains every label.

## If something does go wrong

Stay calm, take a screenshot, and use the game's own report and block tools. The [UK Safer Internet Centre](https://saferinternet.org.uk/) has practical guides for parents on reporting and on what to do next. How we handle behaviour in our own clubs is set out in our [anti-bullying and discipline policy](/anti-bullying-and-discipline).
$md$), jsonb_build_object(
      'locale',  'fi',
      'title',   'Puhu lapsesi kanssa siitä, keitä hän tapaa verkossa',
      'summary', 'Suurin osa siitä, mitä lapset kohtaavat verkkopeleissä, on tavallista leikkiä. Muutama rauhallinen keskustelu auttaa heitä tunnistamaan sen, mikä ei ole, ja kertomaan siitä sinulle.',
      'body',    $md$
Minecraft, Roblox, Fortnite ja useimmat muut lasten suosikkipelit ovat sosiaalisia paikkoja. Lapsesi voi pelata koulukavereidensa kanssa ja myös sellaisten ihmisten kanssa, joita hän ei ole koskaan tavannut. Sitä ei tarvitse pelätä, mutta siitä kannattaa puhua: ajoissa, rauhallisesti ja useammin kuin kerran.

## Aloita uteliaisuudesta, älä säännöistä

Pyydä lastasi näyttämään, mitä hän pelaa ja kenen kanssa. **Yhdessä katsottu pelikerta** kertoo enemmän kuin mikään asetusvalikko, ja samalla lapsesi huomaa, että peleistä voi puhua kanssasi.

## Kolme asiaa, jotka jokaisen lapsen kannattaa tietää

- **Vieras verkossa on yhä vieras**, vaikka hän vaikuttaisi ystävälliseltä ja olisi pelannut samalla palvelimella pitkään.
- **Henkilötiedot pidetään omana tietona**: koko nimi, koulu, osoite, puhelinnumero ja kuvat.
- **Sinulle saa aina kertoa**, jos jokin tuntuu pahalta, eikä kertominen vie pelejä pois.

Viimeinen kohta on tärkein. Lapset jättävät usein ikävän kokemuksen kertomatta, koska pelkäävät menettävänsä konsolin. Sano ääneen, ettei kertominen koskaan ole se, mistä hän joutuu vaikeuksiin.

## Käytä pelialustojen omia työkaluja

Konsoleissa ja useimmissa peleissä on asetukset chatille, kaveripyynnöille ja ostoksille. Ottakaa ne käyttöön yhdessä, niin lapsesi ymmärtää, mitä kukin asetus tekee ja miksi.

## Jos jotain sattuu

Pysy rauhallisena, ota kuvakaappaus ja käytä pelin omia ilmoitus- ja estotoimintoja. Se, miten käytökseen puututaan omissa kerhoissamme, kerrotaan [kiusaamisen ja kurinpidon periaatteissamme](/anti-bullying-and-discipline).
$md$)));
  PERFORM public.publish_library_article(v_id);

  -- 2. Live, then retitled and extended without publishing again.
  v_id := public.create_library_article(
    p_category => 'screen_time',
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale',  'en',
      'title',   'Playing together: a parent''s guide to joining in',
      'summary', 'You don''t need to be good at your child''s favourite game to share it. Here is how an hour on a screen becomes an hour spent together.',
      'body',    $md$
Much of the advice about screens is about how long. This guide is about something else: what happens during that time, and who shares it.

## Ask for a tour

Let your child be the expert. Ask them to show you their world in Minecraft, their favourite experience in Roblox or the island they have been building in Fortnite. **Children love teaching adults**, and explaining a game out loud is real practice at explaining anything.

## Play, even badly

You do not need to be good at the game. Being terrible at it is often the best part: your child gets to help you, and you get to see how patient and inventive they can be.

- Pick a game with a co-operative mode, so you are on the same side
- Let your child set the goal for the session
- Agree beforehand how and when you will stop

## Talk about what happened

Afterwards, ask what they enjoyed, what was hard and what they would build next time. Those questions are what turn time on a screen into time together.

If your child would enjoy playing alongside other children with a Game Educator, have a look at our [clubs, camps and events](/shop).
$md$)));
  PERFORM public.publish_library_article(v_id);

  PERFORM public.save_library_article(
    p_id       => v_id,
    p_category => 'screen_time',
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale',  'en',
      'title',   'Playing together: how to join your child''s game',
      'summary', 'You don''t need to be good at your child''s favourite game to share it. Here is how an hour on a screen becomes an hour spent together.',
      'body',    $md$
Much of the advice about screens is about how long. This guide is about something else: what happens during that time, and who shares it.

## Ask for a tour

Let your child be the expert. Ask them to show you their world in Minecraft, their favourite experience in Roblox or the island they have been building in Fortnite. **Children love teaching adults**, and explaining a game out loud is real practice at explaining anything.

## Play, even badly

You do not need to be good at the game. Being terrible at it is often the best part: your child gets to help you, and you get to see how patient and inventive they can be.

- Pick a game with a co-operative mode, so you are on the same side
- Let your child set the goal for the session
- Agree beforehand how and when you will stop

## Make it a habit

### Keep a regular slot

The same evening each week gives everyone something to look forward to, and it is much easier to protect than a slot you have to negotiate every time.

### Take turns choosing

Let each person in the family pick the game in turn. **A parent's choice counts too**, even if it is a board game.

## Talk about what happened

Afterwards, ask what they enjoyed, what was hard and what they would build next time. Those questions are what turn time on a screen into time together.

If your child would enjoy playing alongside other children with a Game Educator, have a look at our [clubs, camps and events](/shop).
$md$)));

  -- 3. Live without a cover, so readers see the placeholder.
  v_id := public.create_library_article(
    p_category => 'games_explained',
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale',  'en',
      'title',   'Minecraft, Roblox and Fortnite: what''s the difference?',
      'summary', 'Three games your child probably talks about, what each one actually is, and what children do in them.',
      'body',    $md$
If your child's conversation is full of creepers, obbies and victory royales, this is a quick guide to the three games behind the words.

## Minecraft

A world made of blocks that players mine, gather and build with. In **Survival** mode they collect resources and keep themselves alive; in **Creative** mode they have unlimited blocks and simply build. There are two main editions, Java and Bedrock, which cannot always play together, and a version for classrooms, [Minecraft Education](https://education.minecraft.net/).

## Roblox

Less one game than a place full of them. Players join **experiences** that other players have made, from obstacle courses (obbies) to role-play towns, and can make their own in Roblox Studio. Its currency, Robux, is bought with real money, so it is worth agreeing on spending early.

## Fortnite

Best known for **Battle Royale**, where players drop onto an island and the last player or team standing wins. It also has creative and building modes where players make their own islands and games.

## What they have in common

- All three are played online with other people
- All three have settings for chat and spending
- All three reward building, planning and teamwork

Before your child starts a new game, check its label on the [PEGI website](https://pegi.info/). It tells you the age the content suits, not how difficult the game is.
$md$), jsonb_build_object(
      'locale',  'fi',
      'title',   'Minecraft, Roblox ja Fortnite: mitä eroa niillä on?',
      'summary', 'Kolme peliä, joista lapsesi luultavasti puhuu: mitä kukin niistä on ja mitä lapset niissä tekevät.',
      'body',    $md$
Jos lapsesi puheet ovat täynnä creepereitä, obbyja ja victory royaleja, tästä oppaasta näet nopeasti, mitkä kolme peliä sanojen takana ovat.

## Minecraft

Kuutioista koostuva maailma, jossa pelaajat louhivat, keräävät ja rakentavat. **Survival**-tilassa kerätään materiaaleja ja pidetään itsensä hengissä, **Creative**-tilassa kuutioita on rajattomasti ja keskitytään rakentamiseen. Peliä on kaksi pääversiota, Java ja Bedrock, jotka eivät aina toimi keskenään, sekä luokkahuoneisiin tehty [Minecraft Education](https://education.minecraft.net/).

## Roblox

Ennemmin paikka täynnä pelejä kuin yksi peli. Pelaajat liittyvät toisten pelaajien tekemiin **kokemuksiin**, esteradoista (obbyt) roolipelikaupunkeihin, ja voivat tehdä omiaan Roblox Studiossa. Sen valuutta Robux ostetaan oikealla rahalla, joten rahankäytöstä kannattaa sopia ajoissa.

## Fortnite

Tunnetuin pelimuodostaan **Battle Royale**, jossa pelaajat hyppäävät saarelle ja viimeinen pelaaja tai joukkue voittaa. Siinä on myös luovia ja rakentavia tiloja, joissa pelaajat tekevät omia saariaan ja pelejään.

## Mitä yhteistä niillä on

- Kaikkia kolmea pelataan verkossa muiden kanssa
- Kaikissa kolmessa on asetukset chatille ja rahankäytölle
- Kaikki kolme palkitsevat rakentamisesta, suunnittelusta ja yhteistyöstä

Ennen kuin lapsesi aloittaa uuden pelin, tarkista sen merkintä [PEGIn verkkosivuilta](https://pegi.info/). Merkintä kertoo, minkä ikäisille sisältö sopii, ei sitä, kuinka vaikea peli on.
$md$)));
  PERFORM public.publish_library_article(v_id);

  -- 4. A complete draft, ready to publish, with a Finnish version begun.
  PERFORM public.create_library_article(
    p_category => 'learning',
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale',  'en',
      'title',   'What children learn when they build together',
      'summary', 'Building in a shared world asks for planning, compromise and patience. Here is what that looks like, and how to notice it at home.',
      'body',    $md$
When children build together in Minecraft, Roblox Studio or Fortnite's creative modes, they are practising things that are hard to teach from the front of a room.

## Planning before building

A shared build falls apart without a plan. Children quickly learn to **agree on a goal**, divide the work and decide who builds what.

## Compromise

Two players rarely want the same castle. Building together means listening to an idea that isn't yours and finding a version everyone can live with.

## Solving problems

### When something breaks

A bridge collapses, a machine doesn't work, a door opens the wrong way. Working out why, and trying again, is the same loop engineers use.

### When someone is stuck

Children who have just solved a problem are often the best at explaining it to a friend.

## How to notice it at home

- Ask your child who did what in their last build
- Ask what went wrong, and how they fixed it
- Ask what they would do differently next time

If your child would enjoy building with others, have a look at our [clubs, camps and events](/shop).
$md$), jsonb_build_object(
      'locale',  'fi',
      'title',   'Mitä lapset oppivat rakentaessaan yhdessä',
      'summary', 'Yhteisessä maailmassa rakentaminen vaatii suunnittelua, kompromisseja ja kärsivällisyyttä. Näin se näkyy, ja näin huomaat sen kotona.')));

  -- 5. A draft begun and left: a title and half a body, nothing else.
  PERFORM public.create_library_article(
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale', 'en',
      'title',  'Getting ready for your child''s first club session',
      'body',   $md$
A first session in one of our [clubs](/shop) goes more smoothly with a little preparation.

## The day before

- Check the device is charged and its game is up to date
- Make sure your child knows their username
- **Find a quiet spot** with a table and good light

## On the day

Log in a few minutes early, so there is time for a last-minute update.
$md$)));

  -- 6. Live in Finnish alone, so every other locale's reader meets the
  --    fallback's last step: the first version written.
  v_id := public.create_library_article(
    p_category => 'for_schools',
    p_versions => jsonb_build_array(jsonb_build_object(
      'locale',  'fi',
      'title',   'Pelikerho koulupäivän jälkeen',
      'summary', 'Koulun tiloissa kokoontuva pelikerho tarvitsee vähemmän valmistelua kuin moni luulee. Tähän on koottu, mitä koululta tarvitaan.',
      'body',    $md$
Iltapäivän pelikerho sopii koulun omiin tiloihin: atk-luokkaan, kirjastoon tai mihin tahansa tilaan, jossa on pöydät ja sähköpistokkeet.

## Mitä koululta tarvitaan

- **Tila** samana iltapäivänä joka viikko
- **Laitteet**, joilla peliä pelataan, tai lupa käyttää koulun koneita
- **Verkkoyhteys**, joka päästää pelin palvelimille

## Ennen ensimmäistä kertaa

Kokeilkaa yhteyttä ja kirjautumista etukäteen samalla koneella, jota kerhossa käytetään. Päivitykset vievät usein enemmän aikaa kuin itse kirjautuminen.

Lisätietoa kouluille tarjoamistamme kerhoista löydät [kerhojen sivulta](/shop).
$md$)));
  PERFORM public.publish_library_article(v_id);
END;
$$;
COMMIT;

-- The RPCs stamp every copy with this moment, so the dates are moved back
-- over the past four weeks: the list then reads in the order the articles
-- were written. updated_at's trigger would stamp the backdating itself as a
-- save, so it is held off for that one statement.
BEGIN;
ALTER TABLE public.library_articles DISABLE TRIGGER library_articles_updated_at;

UPDATE public.library_articles a
   SET created_at = d.created_at, updated_at = d.updated_at
  FROM public.library_article_translations t
  JOIN (VALUES
    ('Talking with your child about who they meet online',     timestamptz '2026-09-01 09:20+03', timestamptz '2026-09-03 08:45+03'),
    ('Minecraft, Roblox and Fortnite: what''s the difference?', timestamptz '2026-09-08 13:10+03', timestamptz '2026-09-10 14:05+03'),
    ('Playing together: how to join your child''s game',       timestamptz '2026-09-12 10:30+03', timestamptz '2026-09-24 16:20+03'),
    ('What children learn when they build together',          timestamptz '2026-09-20 11:00+03', timestamptz '2026-09-26 11:05+03'),
    ('Getting ready for your child''s first club session',     timestamptz '2026-09-27 15:40+03', timestamptz '2026-09-28 10:15+03'),
    ('Pelikerho koulupäivän jälkeen',                          timestamptz '2026-09-29 09:10+03', timestamptz '2026-09-29 09:40+03')
  ) AS d(title, created_at, updated_at) ON d.title = t.title
 WHERE t.article_id = a.id;

ALTER TABLE public.library_articles ENABLE TRIGGER library_articles_updated_at;

UPDATE public.library_article_publications p
   SET first_published_at = d.published_at, published_at = d.published_at
  FROM public.library_article_translations t
  JOIN (VALUES
    ('Talking with your child about who they meet online',     timestamptz '2026-09-03 09:00+03'),
    ('Minecraft, Roblox and Fortnite: what''s the difference?', timestamptz '2026-09-10 14:30+03'),
    ('Playing together: how to join your child''s game',       timestamptz '2026-09-15 09:00+03'),
    ('Pelikerho koulupäivän jälkeen',                          timestamptz '2026-09-29 10:00+03')
  ) AS d(title, published_at) ON d.title = t.title
 WHERE p.article_id = t.article_id;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.library_articles
       WHERE created_at > now() - interval '1 hour') > 0 THEN
    RAISE EXCEPTION 'A Library article kept its seeding date: its title no longer matches the backdating above.';
  END IF;
  IF (SELECT count(*) FROM public.library_article_publications
       WHERE published_at > now() - interval '1 hour') > 0 THEN
    RAISE EXCEPTION 'A published Library article kept its seeding date: its title no longer matches the backdating above.';
  END IF;
END;
$$;
COMMIT;

-- =============================================================================
-- 14a. A linked Discord account
-- =============================================================================
-- mikko.lehtinen@example.com has his Discord account linked, so a fresh stack
-- shows the linked state on his settings and on the admin user page.
-- gedu@example.com is left unlinked on purpose: it is the account for trying the
-- /link flow by hand.
--
-- The bot writes the token row with the service role, so the direct insert (as
-- the seed's own role, before any impersonation) is the real path; the link
-- itself is made by the RPC under Mikko's claims. The token is stored as the
-- hex SHA-256 of the raw token.

INSERT INTO public.discord_link_tokens (token_hash, discord_user_id, discord_username)
VALUES (encode(extensions.digest('rich-seed-mikko-link-token', 'sha256'), 'hex'),
        '412345678901234567', 'mikko.lehtinen');

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.profiles
                             WHERE email = 'mikko.lehtinen@example.com'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT public.consume_discord_link_token('rich-seed-mikko-link-token');

COMMIT;

-- =============================================================================
-- 15. What landed
-- =============================================================================

DO $$
DECLARE
  r record;
  live_club record;
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

  RAISE NOTICE 'rich-seed: groups %, sessions %, attendance marks %, feedback answers %, participations %, waitlisted %, substitutions %, cancelled sessions %',
    (SELECT count(*) FROM public.product_groups),
    (SELECT count(*) FROM public.group_sessions),
    (SELECT count(*) FROM public.session_attendance),
    (SELECT count(*) FROM public.session_feedback),
    (SELECT count(*) FROM public.participations WHERE status = 'active'),
    (SELECT count(*) FROM public.participations WHERE status = 'waitlisted'),
    (SELECT count(*) FROM public.session_substitution_requests),
    (SELECT count(*) FROM public.session_cancellations);

  RAISE NOTICE 'rich-seed: coming sessions gedu@example.com covers as the sub';
  FOR r IN SELECT t.name || ' ' || g.name || ', ' || to_char(sr.session_date, 'Dy DD Mon')
                  || ' at ' || to_char(s.start_time, 'HH24:MI') AS k,
                  'for ' || ab.email AS n
             FROM public.session_substitution_requests sr
             JOIN public.profiles sub ON sub.id = sr.substitute_id
             JOIN public.profiles ab  ON ab.id = sr.requested_by
             JOIN public.product_groups g ON g.id = sr.group_id
             JOIN public.product_translations t
               ON t.product_id = g.product_id AND t.locale = 'en'
             JOIN public.schedule_slots s
               ON s.product_id = g.product_id
              AND s.weekday = EXTRACT(ISODOW FROM sr.session_date)::integer - 1
            WHERE sub.email = 'gedu@example.com'
              AND sr.status = 'substituted'
              AND sr.session_date >= current_date
            ORDER BY sr.session_date
  LOOP RAISE NOTICE '  % : %', r.k, r.n; END LOOP;

  RAISE NOTICE 'rich-seed: requests still open, in gedu@example.com''s pool';
  FOR r IN SELECT t.name || ' ' || g.name || ', ' || to_char(sr.session_date, 'Dy DD Mon')
                  || ' at ' || to_char(s.start_time, 'HH24:MI') AS k,
                  'for ' || ab.email AS n
             FROM public.session_substitution_requests sr
             JOIN public.profiles ab  ON ab.id = sr.requested_by
             JOIN public.product_groups g ON g.id = sr.group_id
             JOIN public.product_translations t
               ON t.product_id = g.product_id AND t.locale = 'en'
             JOIN public.schedule_slots s
               ON s.product_id = g.product_id
              AND s.weekday = EXTRACT(ISODOW FROM sr.session_date)::integer - 1
            WHERE sr.status = 'open'
            ORDER BY sr.session_date
  LOOP RAISE NOTICE '  % : %', r.k, r.n; END LOOP;

  SELECT to_char(DATE '2024-01-01' + s.weekday, 'FMDay') AS weekday,
         to_char(s.start_time, 'HH24:MI') AS starts,
         s.duration_minutes,
         p.timezone,
         to_char(s.start_time + make_interval(mins => s.duration_minutes + 5), 'HH24:MI') AS open_until
    INTO live_club
    FROM public.schedule_slots s
    JOIN public.products p ON p.id = s.product_id
    JOIN public.product_translations t ON t.product_id = p.id AND t.locale = 'en'
   WHERE t.name = 'Minecraft Bedrock Club';
  RAISE NOTICE 'rich-seed: live club Minecraft Bedrock Club, % % for % minutes (%), voice room open until about % today',
    live_club.weekday, live_club.starts, live_club.duration_minutes,
    live_club.timezone, live_club.open_until;

  RAISE NOTICE 'rich-seed: library articles %, live %, drafts %, versions by language %, live versions by language %',
    (SELECT count(*) FROM public.library_articles),
    (SELECT count(*) FROM public.library_article_publications),
    (SELECT count(*) FROM public.library_articles a
      WHERE NOT EXISTS (SELECT 1 FROM public.library_article_publications p
                         WHERE p.article_id = a.id)),
    (SELECT string_agg(locale || ' ' || n, ', ' ORDER BY locale)
       FROM (SELECT locale, count(*) AS n FROM public.library_article_translations
              GROUP BY locale) v),
    (SELECT string_agg(locale || ' ' || n, ', ' ORDER BY locale)
       FROM (SELECT locale, count(*) AS n FROM public.library_article_publication_translations
              GROUP BY locale) v);

  RAISE NOTICE 'rich-seed: team profiles';
  FOR r IN SELECT p.email || ' (' || p.role::text || ')' AS k,
                  CASE WHEN tp.approved THEN 'public'
                       WHEN tp.opted_in THEN 'ready, waiting to be made public'
                       ELSE 'private' END AS n
             FROM public.team_profiles tp
             JOIN public.profiles p ON p.id = tp.user_id
            ORDER BY p.email
  LOOP RAISE NOTICE '  % : %', r.k, r.n; END LOOP;
END;
$$;
