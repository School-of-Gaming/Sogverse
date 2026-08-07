-- 00162: postal codes get a table of their own.
--
-- A postal code is not a level of the location hierarchy and never becomes one:
-- it is an alternative *key* onto a municipality that already exists, so a
-- parent can type "00100" instead of browsing Finland → Uusimaa → Helsinki.
-- This migration ships the table and its access posture; the rows arrive in the
-- generated seed migrations that follow, and the consuming UI is deliberately
-- later work.
--
-- WHY THE SHAPE IS A THREE-COLUMN PRIMARY KEY
--
-- Neither direction of the relationship is single-valued. A municipality has
-- many codes (Helsinki has dozens), and a code can span municipalities where a
-- delivery area straddles a boundary — which is why `location_id` is part of the
-- key rather than a unique column beside it. The row is the *fact* "this code
-- reaches this place", and the key is the whole fact.
--
-- WHY THIS TABLE MAY BE REBUILT AND `locations` MAY NOT
--
-- Nothing references a postal row. No product, no gedu claim, no family pick,
-- no FK anywhere points here — the arrows all run the other way. So refreshing
-- a country's codes is a plain DELETE-then-INSERT migration, and that is the
-- whole difference from `locations`, where `gedu_locations.location_id` is
-- ON DELETE CASCADE and a delete would silently erase a gedu's coverage. The
-- retire-never-delete discipline exists over there because the FK hazard forces
-- it; it is not forced here, which is exactly why postal data can track upstream
-- freely while the geography cannot.
--
-- WHERE THE ROWS COME FROM
--
-- GeoNames' postal dumps by default, joined to municipalities on
-- (country_code, type = 'municipality', external_code) — the official
-- statistical code, which GeoNames' admin-code columns supply. France is the one
-- country whose source is overridden: GeoNames' French postal file carries the
-- département+arrondissement code rather than the commune INSEE code and joins
-- zero of ~34,900 communes, so France reads La Poste's Base officielle des codes
-- postaux (Licence Ouverte 2.0) instead. Both are declared in
-- `scripts/lib/geonames/config.mjs` and consumed by
-- `scripts/generate-postal-seed.mjs`.
--
-- The consequence of joining on `external_code` is worth stating: a country
-- whose config maps no official code (the United Kingdom, whose GeoNames admin
-- codes are GeoNames' own invention) cannot be seeded through this join at all
-- and is deliberately out of postal scope until it gets a key of its own.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.postal_codes (
  country_code text NOT NULL,
  postal_code  text NOT NULL,
  location_id  uuid NOT NULL
               REFERENCES public.locations(id) ON DELETE CASCADE,
  PRIMARY KEY (country_code, postal_code, location_id)
);

COMMENT ON TABLE public.postal_codes IS
  'Postal code -> municipality, one row per (country, code, place) fact. An alternative key onto a locations row, never a level of the hierarchy. Nothing references this table, which is what makes a refresh a plain delete-and-reinsert rather than the retire-never-delete discipline locations lives under. Public reference data: anon and authenticated may SELECT, nobody may write from a client, and rows land through generated data migrations.';

COMMENT ON COLUMN public.postal_codes.country_code IS
  'ISO 3166-1 alpha-2, matching the locations row this points at. Part of the key rather than derivable from it because the lookup starts here: a caller has a country and a code and no id yet, and codes are not unique across countries.';

COMMENT ON COLUMN public.postal_codes.postal_code IS
  'The code exactly as the upstream source spells it — no normalization, no padding, no case folding. Every seeded country''s codes are fixed-width digits (Finland and France alike), so there is nothing to normalize yet; a country whose codes carry spaces or letters will need that decision made deliberately rather than inherited.';

COMMENT ON COLUMN public.postal_codes.location_id IS
  'The municipality the code reaches. ON DELETE CASCADE, and safe here precisely because nothing references postal rows: losing them costs a lookup, never a coverage claim or a stored pick. Seeds resolve it by joining (country_code, type = ''municipality'', external_code), so a country whose level maps no official code cannot be seeded this way.';

-- The PRIMARY KEY's btree is (country_code, postal_code, location_id), so the
-- one lookup this table exists for — a code in a country — is a leading-prefix
-- scan of it, and so is the per-country DELETE a refresh runs. A second index on
-- (country_code, postal_code) would be a strict duplicate of that prefix: write
-- cost on every row for a query the key already answers.
--
-- What the key does NOT cover is the other direction, which the FK needs: a
-- DELETE of a locations row has to find the postal rows referencing it, and
-- `location_id` is the trailing column of the key rather than a searchable one.
-- Without this index that is a sequential scan of every postal row per deleted
-- location.
CREATE INDEX idx_postal_codes_location_id
  ON public.postal_codes (location_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — public reference data, read by everyone, written by nobody
-- ---------------------------------------------------------------------------
--
-- The parent registration page is public and unauthenticated, and postal entry
-- is meant to be a shortcut on it, so `anon` reads this exactly as it already
-- reads `locations`. There is no write policy at all: a policy with no grant
-- behind it is a claim nobody can act on, and inventing one now would only
-- invite a future grant to arm it.

ALTER TABLE public.postal_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY postal_codes_are_public_reference_data
  ON public.postal_codes
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
--
-- Nothing is exposed by default, not even to service_role, so every role that
-- needs anything is named here and every role that is absent is a decision.
--
-- SELECT to anon and authenticated: the lookup runs on the caller's own client,
-- with no route and no RPC in front of it, because the answer does not depend on
-- who asks.
--
-- No write grant to anybody, service_role included. Rows land through data
-- migrations, which run as the database owner and are not subject to a Data API
-- grant at all — so a service_role grant here would widen the reachable surface
-- for no caller. If an admin surface ever needs to read this table on the
-- privileged client, the fix is to add the grant in that change, deliberately;
-- until then it fails closed, which is the intended answer.

GRANT SELECT ON TABLE public.postal_codes TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Assert the end state
-- ---------------------------------------------------------------------------
--
-- A missing grant fails closed somewhere far away, and a missing RLS enable
-- fails *open* — the louder of the two failures is the quieter one to notice.
-- Both are asserted at the moment this file runs.

DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.postal_codes'::regclass
  ) THEN
    RAISE EXCEPTION 'postal_codes has no row-level security';
  END IF;

  IF NOT has_table_privilege('anon', 'public.postal_codes', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.postal_codes', 'SELECT')
  THEN
    RAISE EXCEPTION 'postal_codes is not readable by anon/authenticated — the public postal lookup would fail closed';
  END IF;

  IF has_table_privilege('anon', 'public.postal_codes', 'INSERT')
     OR has_table_privilege('anon', 'public.postal_codes', 'UPDATE')
     OR has_table_privilege('anon', 'public.postal_codes', 'DELETE')
     OR has_table_privilege('authenticated', 'public.postal_codes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.postal_codes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.postal_codes', 'DELETE')
  THEN
    RAISE EXCEPTION 'a client role holds a write grant on postal_codes — this is seeded reference data, written only by migrations';
  END IF;
END;
$$;
