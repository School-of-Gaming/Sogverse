-- Where a family came from: the three standard UTM fields on their profile,
-- written once when the account is created and never again.
--
-- This replaces `referral_code` (00184) outright. The pipeline is unchanged —
-- a marketing link carries the values, the app reads them server-side, holds
-- them in memory for the visit, and passes them in the new user's auth
-- metadata; this migration is the storage half. What changes is the
-- vocabulary and the shape: three fields named the way every ad platform and
-- every partner already names them, instead of one code that had to be
-- translated in every conversation and every export.
--
-- EXISTING VALUES ARE DROPPED, NOT MIGRATED
--
-- Owner's decision. `referral_code` was never issued to a partner and the
-- column is empty of anything anyone reports on; carrying a handful of
-- test-shaped values across into `utm_campaign` would put values into a column
-- whose format rule they were never authored against, and the first real
-- campaign has not gone out yet. The column and its CHECK go with it.
--
-- THE FORMAT RULE, AND WHY IT IS SO MUCH WIDER THAN 00184's
--
-- `^[a-z0-9_-]{1,64}$` was authorable because *we* authored every code. UTM
-- values arrive from ad platforms: uppercase, dots, plus signs, spaces, and
-- Meta/TikTok macros that expand to an ad's own name. A pattern that rejects
-- those does not tidy the data, it deletes most of it. So the rule is stated
-- as four refusals and everything else is accepted verbatim:
--
--   * empty after trimming;
--   * longer than 200 characters;
--   * containing any control character;
--   * beginning `=`, `+`, `-`, `@`, tab or CR.
--
-- **Case is preserved.** Vercel reports UTM values case-sensitively, so folding
-- here would make our per-account numbers disagree with the traffic numbers
-- they are read beside.
--
-- The last refusal is the spreadsheet one, and it matters more here than it did
-- in 00184: these values reach a partner in a CSV export **we do not control**,
-- so no downstream escaping can be relied on, and a cell opening with any of
-- those characters executes when the file is opened. Tab and CR are on the list
-- because `btrim` strips spaces only — a tab-led value really can reach this
-- rule with the tab still in front of it.
--
-- WHY THE TRIGGER SANITISES AND THE CHECKS ARE ONLY A BACKSTOP
--
-- Unchanged from 00184's header, and still the important detail in the whole
-- change. handle_new_user() writes metadata values straight through, which
-- means a value violating a CHECK **raises inside the trigger and fails the
-- whole auth signup**. If these columns were added that way, a stranger's
-- malformed `utm_campaign` in a shared link would turn into "registration is
-- broken for this family". So the trigger applies the format rule itself and
-- degrades to NULL, and the CHECKs below exist only as a backstop that should
-- never be reached through any application path.
--
-- The rule is written out three times in the trigger and once per column in the
-- CHECKs, rather than extracted into a shared SQL function. That is deliberate:
-- a helper would be a new Data API object needing its own grants and its own
-- classification in the authorization spine, and a CHECK constraint depending
-- on a user function is a dependency `pg_dump` has to order correctly for the
-- rest of the schema's life. Six copies of a four-clause predicate in one
-- migration is the cheaper of the two.
--
-- NO UPDATE GRANT, DELIBERATELY
--
-- `profiles` is the one table in the schema with column-scoped UPDATE grants,
-- pinned by an exact-equality assertion in the DB authorization spine, so the
-- reflex when copying 00137 is to add one here too. Do not. These columns are
-- immutable provenance, not user-editable data: a grant would hand every user
-- the permanent ability to rewrite their own attribution — including
-- re-introducing exactly the payloads the sanitising above exists to keep out.
-- Table-wide SELECT already covers reads. **The mechanism is the absence of the
-- columns from the grant list, not a REVOKE**: there is nothing to revoke,
-- because a freshly added column carries no column-level grant of its own, and
-- writing one would suggest a grant had been considered and withdrawn.
--
-- The consequence is real and accepted: with no grant, **nobody but
-- `service_role` can ever alter or clear these values — an admin included**,
-- since an admin is also the `authenticated` DB role. That is also what keeps a
-- null path open: if counsel's answer on writing attribution for a visitor who
-- rejected the banner comes back the other way, clearing these columns is one
-- service-role statement rather than an unwind of a client-writable field.
--
-- Adding keys to this trigger is a deliberate act. It is the most sensitive
-- function in the schema — it assigns roles, it writes past RLS, and it has a
-- test suite whose entire subject is that client-supplied metadata cannot
-- influence what it grants. Nothing else is widened: the new keys affect three
-- nullable text columns and nothing more.

-- ---------------------------------------------------------------------------
-- 1. The referral code goes
-- ---------------------------------------------------------------------------
--
-- `user_search_index` selects this column, so the view is dropped first and
-- rebuilt in section 3 — "every profile column" is the view's own promise, and
-- it has to keep it against the new set.

DROP VIEW public.user_search_index;

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_referral_code_format;

ALTER TABLE public.profiles
  DROP COLUMN referral_code;

-- ---------------------------------------------------------------------------
-- 2. The three UTM columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN utm_source   text,
  ADD COLUMN utm_medium   text,
  ADD COLUMN utm_campaign text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_utm_source_format
  CHECK (
    (utm_source IS NULL)
    OR (
      btrim(utm_source) <> ''
      AND char_length(btrim(utm_source)) <= 200
      AND utm_source !~ '[[:cntrl:]]'
      AND left(btrim(utm_source), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
    )
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_utm_medium_format
  CHECK (
    (utm_medium IS NULL)
    OR (
      btrim(utm_medium) <> ''
      AND char_length(btrim(utm_medium)) <= 200
      AND utm_medium !~ '[[:cntrl:]]'
      AND left(btrim(utm_medium), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
    )
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_utm_campaign_format
  CHECK (
    (utm_campaign IS NULL)
    OR (
      btrim(utm_campaign) <> ''
      AND char_length(btrim(utm_campaign)) <= 200
      AND utm_campaign !~ '[[:cntrl:]]'
      AND left(btrim(utm_campaign), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
    )
  );

COMMENT ON COLUMN public.profiles.utm_source IS
  'Optional marketing provenance: the utm_source from the link this account '
  'arrived through, or NULL (the large majority). Written once by '
  'handle_new_user() from the signup metadata and never updatable — there is '
  'deliberately no UPDATE grant, at any level, for any role but service_role. '
  'Case is preserved, because Vercel reports UTM values case-sensitively. '
  'Labels only: it grants nothing, is never used for profiling or to decide '
  'what anyone is shown or charged, and gamer rows always hold NULL.';

COMMENT ON COLUMN public.profiles.utm_medium IS
  'Optional marketing provenance: the utm_medium from the link this account '
  'arrived through, or NULL. Same rules as utm_source — write-once, no UPDATE '
  'grant, case preserved, NULL on every gamer row.';

COMMENT ON COLUMN public.profiles.utm_campaign IS
  'Optional marketing provenance: the utm_campaign from the link this account '
  'arrived through, or NULL. Same rules as utm_source. This is the single '
  '"utm parameter" a partner data export reports on, and campaigns issued to '
  'or for a partner are prefixed with the partner''s slug and a hyphen '
  '(lynx-summer-a, rblx-launch) — a naming convention, not a constraint, and '
  'one that cannot be retrofitted because the value is immutable once written.';

-- ---------------------------------------------------------------------------
-- 3. user_search_index, rebuilt
-- ---------------------------------------------------------------------------
--
-- Verbatim from the current definition apart from the column swap,
-- security_invoker spelled exactly as the access-control sweep reads it out of
-- reloptions, with both comments and both grants back in place. The three new
-- columns take the position referral_code held, so "every profile column" stays
-- true and the admin search's row shape follows the table.

CREATE VIEW public.user_search_index WITH (security_invoker='true') AS
 SELECT p.id,
    p.email,
    p.email_verified_at,
    p.first_name,
    p.last_name,
    p.role,
    p.phone,
    p.currency,
    p.home_location_id,
    p.utm_source,
    p.utm_medium,
    p.utm_campaign,
    p.locale,
    p.spoken_languages,
    p.created_at,
    p.updated_at,
    concat_ws(' '::text, p.first_name, p.last_name, p.email, p.phone, mc.minecraft_username, rb.roblox_username) AS search_blob
   FROM ((public.profiles p
     LEFT JOIN public.minecraft_accounts mc ON ((mc.user_id = p.id)))
     LEFT JOIN public.roblox_accounts rb ON ((rb.user_id = p.id)));

COMMENT ON VIEW public.user_search_index IS 'Profiles as the admin user search matches them: every profile column, plus search_blob. Read by that one search and nothing else. SECURITY INVOKER, so RLS on profiles, minecraft_accounts and roblox_accounts governs every row exactly as it would a direct read — which also means a role granted SELECT here must hold SELECT on all three. The joins are on those tables'' primary key and so cannot multiply a profile into several rows; the search reads its match total from this view''s row count, so that is asserted rather than assumed. A future game platform is one more LEFT JOIN and one more argument to concat_ws, with no change anywhere outside the database.';

COMMENT ON COLUMN public.user_search_index.search_blob IS 'Every string a person can be found by — name, email, phone, and each game handle — space-joined. Derived, never written, and never selected: the search filters on it and reads the profile columns beside it, so it does not cross the wire. The three utm_* columns and email_verified_at are deliberately absent: those label where a family came from and when they verified, and neither is a name anyone should be findable by. The phone is the stored digits (E.164 without the +), which is why a needle reduced to its trailing digits matches a number typed either nationally or internationally without the search knowing any dialling rules.';

GRANT SELECT ON TABLE public.user_search_index TO authenticated;
GRANT SELECT ON TABLE public.user_search_index TO service_role;

-- ---------------------------------------------------------------------------
-- 4. handle_new_user(), repointed at the three keys
-- ---------------------------------------------------------------------------
--
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
  utm_source_raw       TEXT;
  utm_medium_raw       TEXT;
  utm_campaign_raw     TEXT;
  utm_source_value     TEXT;
  utm_medium_value     TEXT;
  utm_campaign_value   TEXT;
BEGIN
  profile_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    'New User'
  );

  profile_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    ''
  );

  -- Sanitise here, in the body, rather than letting the CHECKs decide: a
  -- malformed value must cost this family nothing at all, so it degrades to
  -- NULL and the signup succeeds. Trim first, then test the trimmed value —
  -- and store the trimmed value, so what the CHECK sees is what was tested.
  -- An absent key arrives NULL, `btrim(NULL)` is NULL, and every comparison
  -- below is then NULL, so the CASE falls through to ELSE without a special
  -- case for it.
  utm_source_raw   := NEW.raw_user_meta_data->>'utm_source';
  utm_medium_raw   := NEW.raw_user_meta_data->>'utm_medium';
  utm_campaign_raw := NEW.raw_user_meta_data->>'utm_campaign';

  utm_source_value := CASE
    WHEN btrim(utm_source_raw) <> ''
     AND char_length(btrim(utm_source_raw)) <= 200
     AND utm_source_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_source_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_source_raw)
    ELSE NULL
  END;

  utm_medium_value := CASE
    WHEN btrim(utm_medium_raw) <> ''
     AND char_length(btrim(utm_medium_raw)) <= 200
     AND utm_medium_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_medium_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_medium_raw)
    ELSE NULL
  END;

  utm_campaign_value := CASE
    WHEN btrim(utm_campaign_raw) <> ''
     AND char_length(btrim(utm_campaign_raw)) <= 200
     AND utm_campaign_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_campaign_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_campaign_raw)
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name,
    utm_source, utm_medium, utm_campaign
  )
  VALUES (
    NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name,
    utm_source_value, utm_medium_value, utm_campaign_value
  );

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Rather than trusting that the statements above took the branch they look like
-- they took. Apply-time protection: it says what was true when 00234 ran, and
-- nothing about later migrations.

DO $$
DECLARE
  utm_column TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'referral_code'
  ) THEN
    RAISE EXCEPTION 'profiles.referral_code survived — the column this migration replaces is still there';
  END IF;

  FOREACH utm_column IN ARRAY ARRAY['utm_source', 'utm_medium', 'utm_campaign'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'profiles'
         AND column_name = utm_column
         AND is_nullable = 'YES'
         AND data_type = 'text'
    ) THEN
      RAISE EXCEPTION 'profiles.% is missing, not nullable, or not text', utm_column;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
         AND t.relname = 'profiles'
         AND c.contype = 'c'
         AND c.conname = 'profiles_' || utm_column || '_format'
    ) THEN
      RAISE EXCEPTION 'profiles_%_format is missing — the backstop behind the trigger''s own sanitising', utm_column;
    END IF;

    -- The whole point of the columns, read back out of the catalog. A grant
    -- here would be invisible in application behaviour until someone rewrote
    -- their own attribution, which is the one thing this design refuses.
    IF has_column_privilege('authenticated', 'public.profiles', utm_column, 'UPDATE') THEN
      RAISE EXCEPTION 'authenticated can UPDATE profiles.% — these columns are immutable provenance and must carry no UPDATE grant', utm_column;
    END IF;

    IF has_column_privilege('anon', 'public.profiles', utm_column, 'UPDATE') THEN
      RAISE EXCEPTION 'anon can UPDATE profiles.%', utm_column;
    END IF;

    -- Reads are table-wide and unchanged; assert it so "no grant" is understood
    -- as "no WRITE grant" rather than a column nobody can see.
    IF NOT has_column_privilege('authenticated', 'public.profiles', utm_column, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated cannot SELECT profiles.% — the table-wide read grant did not reach the new column', utm_column;
    END IF;
  END LOOP;

  -- And the standing invariant 00137 also pins: the column-level UPDATE surface
  -- must never have arrived as a table-wide grant, which would carry `role`.
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE profiles.role — a table-wide grant leaked in';
  END IF;

  -- The view came back with its read grant. A DROP takes the ACL with it, and a
  -- recreate that forgot the GRANT would break the admin user search rather
  -- than fail here.
  IF NOT has_table_privilege('authenticated', 'public.user_search_index', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT user_search_index — the DROP took the grant and it was not restored';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_search_index'
       AND column_name = 'utm_campaign'
  ) THEN
    RAISE EXCEPTION 'user_search_index did not gain utm_campaign in the recreate';
  END IF;
END;
$$;
