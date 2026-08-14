-- Where a family came from: one optional short code on their profile, written
-- once when the account is created and never again.
--
-- A marketing link carries `?ref=<code>` (e.g. /roblox?ref=paris-nord). The app
-- reads it server-side, holds it in memory for the visit, and passes it in the
-- new user's auth metadata; this migration is the storage half — the column, its
-- format rule, and the trigger key that fills it.
--
-- NO UPDATE GRANT, DELIBERATELY
--
-- `profiles` is the one table in the schema with column-scoped UPDATE grants,
-- pinned by an exact-equality assertion in the DB authorization spine, so the
-- reflex when copying 00137 is to add one here too. Do not. This column is
-- immutable provenance, not user-editable data: a grant would hand every user
-- the permanent ability to rewrite their own attribution — including
-- re-introducing exactly the payloads the sanitising below exists to keep out.
-- Table-wide SELECT already covers reads.
--
-- The consequence is real and accepted: with no grant, **nobody but
-- `service_role` can ever alter or clear this value — an admin included**, since
-- an admin is also the `authenticated` DB role. Erasure of this field is part of
-- the manual, service_role account deletion an admin already performs.
--
-- WHY THE TRIGGER SANITISES AND THE CHECK IS ONLY A BACKSTOP
--
-- This is the important detail in the whole change, and the CHECK does not
-- substitute for it. handle_new_user() writes metadata values straight through,
-- which means a value violating a CHECK **raises inside the trigger and fails
-- the whole auth signup**. If referral_code were added that way, a stranger's
-- malformed `?ref=` in a shared link would turn into "registration is broken for
-- this family". So the trigger applies the format rule itself and degrades to
-- NULL, and the CHECK below exists only as a backstop that should never be
-- reached.
--
-- Note the ordering inside the CASE: lower(btrim(v)) is tested, not v. The
-- natural-looking `CASE WHEN v ~ '^[a-z0-9_-]{1,64}$' THEN lower(v)` tests the
-- raw value against a lowercase-only pattern, so `Paris-Nord` would fail and
-- degrade to NULL instead of being normalised. That matters more than it looks:
-- the trigger is the only sanitiser the DB tests exercise, because they create
-- users through the admin API and nothing lowercases the value on the way in.
--
-- Adding a key to this trigger is a deliberate act. It is the most sensitive
-- function in the schema — it assigns roles, it writes past RLS, and it has a
-- test suite whose entire subject is that client-supplied metadata cannot
-- influence what it grants. Nothing else is widened: the new key affects one
-- nullable text column and nothing more.

ALTER TABLE public.profiles
  ADD COLUMN referral_code text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referral_code_format
  CHECK (
    (referral_code IS NULL)
    OR (referral_code ~ '^[a-z0-9_-]{1,64}$')
  );

COMMENT ON COLUMN public.profiles.referral_code IS
  'Optional marketing provenance: the short code from the ?ref= param on the '
  'link this account arrived through, or NULL (the large majority). Written '
  'once by handle_new_user() from the signup metadata and never updatable — '
  'there is deliberately no UPDATE grant, at any level, for any role but '
  'service_role. Labels only: it grants nothing, is never used for profiling or '
  'to decide what anyone is shown or charged, and gamer rows always hold NULL.';

-- CREATE OR REPLACE preserves the function's existing privileges (set in
-- 00095), and this migration deliberately neither widens nor narrows them: a
-- trigger function is not a callable Data API surface — PostgREST cannot invoke
-- one, and the authorization spine's catalog helper excludes them for that
-- reason — so its ACL is not what stands between a caller and this table.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  profile_first_name   TEXT;
  profile_last_name    TEXT;
  profile_referral_raw TEXT;
  profile_referral     TEXT;
BEGIN
  profile_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    'New User'
  );

  profile_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    ''
  );

  -- Sanitise here, in the body, rather than letting the CHECK decide: a
  -- malformed code must cost this family nothing at all, so it degrades to NULL
  -- and the signup succeeds. Normalise first, then test the normalised value.
  profile_referral_raw := NEW.raw_user_meta_data->>'referral_code';
  profile_referral := CASE
    WHEN lower(btrim(profile_referral_raw)) ~ '^[a-z0-9_-]{1,64}$'
      THEN lower(btrim(profile_referral_raw))
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, email, role, first_name, last_name, referral_code)
  VALUES (NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name, profile_referral);

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- Assert the end state rather than trusting that the statements above took the
-- branch they look like they took. Apply-time protection: it says what was true
-- when 00184 ran, and nothing about later migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'referral_code'
       AND is_nullable = 'YES'
       AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'profiles.referral_code is missing, not nullable, or not text';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'profiles'
       AND c.contype = 'c'
       AND c.conname = 'profiles_referral_code_format'
  ) THEN
    RAISE EXCEPTION 'profiles_referral_code_format is missing — the backstop behind the trigger''s own sanitising';
  END IF;

  -- The whole point of the column, read back out of the catalog. A grant here
  -- would be invisible in application behaviour until someone rewrote their own
  -- attribution, which is the one thing this design refuses.
  IF has_column_privilege('authenticated', 'public.profiles', 'referral_code', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE profiles.referral_code — this column is immutable provenance and must carry no UPDATE grant';
  END IF;

  IF has_column_privilege('anon', 'public.profiles', 'referral_code', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can UPDATE profiles.referral_code';
  END IF;

  -- Reads are table-wide and unchanged; assert it so "no grant" is understood as
  -- "no WRITE grant" rather than a column nobody can see.
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'referral_code', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT profiles.referral_code — the table-wide read grant did not reach the new column';
  END IF;

  -- And the standing invariant 00137 also pins: the column-level UPDATE surface
  -- must never have arrived as a table-wide grant, which would carry `role`.
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE profiles.role — a table-wide grant leaked in';
  END IF;
END;
$$;
