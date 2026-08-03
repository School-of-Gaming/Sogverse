-- Where a parent lives: one optional municipality-level `locations` reference on
-- their profile. Asked for on the registration form, edited from settings.
--
-- WHY A REAL FOREIGN KEY
--
-- The picker browses the `locations` table itself and hands back the row it was
-- looking at, so a pick is already a row id at the moment it is made. There is
-- nothing to resolve at save time and no class of place the UI can display but
-- not store, which is what a loose reference (a country code plus an official
-- statistical code) was there to work around back when the picker read shipped
-- catalogs and had never seen a row. A code pair is also ambiguous by
-- construction in France — every région code is also a département code — while
-- an id is not.
--
-- ON DELETE SET NULL, AND WHAT IT COSTS
--
-- Deliberately SET NULL rather than RESTRICT, and this IS a choice with a
-- downside rather than a free default. Communes merge and are retired between
-- annual releases of the official classifications, and reconciling a release is
-- a hand-written migration a human writes against the diff. A home location a
-- parent set months ago must never be the reason a superseded reference row
-- cannot be removed — that would let profile data hold seeded reference data
-- hostage, and the person doing the reconciliation is not the person who can
-- decide where that family should now point.
--
-- The accepted cost: a merge silently empties that parent's location instead of
-- failing loudly. Nothing tells them, and nothing tells us. That is tolerable
-- only because this field is optional, carries no entitlement, gates no
-- purchase, and is re-pickable from settings in two clicks. It would NOT be the
-- right answer for a column that decided what someone may buy or attend — for
-- those, RESTRICT and a loud failure is correct. Note the contrast with
-- `locations.parent_id`, which stays ON DELETE RESTRICT: orphaning the tree
-- corrupts every ancestor walk, so there the loud failure is the point.
--
-- Municipality level is a UI decision, not a constraint here. There is no CHECK
-- pinning the referenced row's type: `profiles` cannot see `locations.type`
-- without a trigger, and a trigger on the profile write is a lot of machinery to
-- defend a field with no privilege behind it. The picker asks for
-- `pickableTypes = ['municipality']` and that is the gate.

ALTER TABLE public.profiles
  ADD COLUMN home_location_id uuid
    REFERENCES public.locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.home_location_id IS
  'Optional municipality-level locations row: where this parent''s family lives. '
  'ON DELETE SET NULL by choice — a merged or retired reference row empties this '
  'reference rather than blocking its removal, at the cost of silently clearing '
  'the parent''s pick. Acceptable only because the field is optional and carries '
  'no entitlement.';

-- Backs the FK's own referential action. ON DELETE SET NULL makes Postgres scan
-- `profiles` for referencing rows on every `locations` delete, and a
-- reconciliation migration retiring a batch of merged communes is exactly the
-- workload that does that in a loop. Partial, because the overwhelming majority
-- of rows (every gamer, every gedu, every admin, and every parent who skipped
-- the field) hold NULL and are of no interest to either the FK check or a future
-- "who lives here" read.
CREATE INDEX idx_profiles_home_location_id
  ON public.profiles (home_location_id)
  WHERE home_location_id IS NOT NULL;

-- Column-level, matching every other self-editable profile field. `profiles`
-- deliberately has no table-wide UPDATE grant: a broad grant would reach `role`,
-- which is self-promotion to admin. The RLS policy users_update_own_profile
-- already scopes the statement to the caller's own row (actor and target are the
-- same check here), so the grant is the only thing that needed adding.
GRANT UPDATE(home_location_id) ON TABLE public.profiles TO authenticated;

-- Assert the end state rather than trusting that the statements above took the
-- branch they look like they took. Apply-time protection, not a standing
-- invariant: it says what was true when 00137 ran and nothing about later
-- migrations.
DO $$
DECLARE
  v_delete_rule text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'home_location_id'
       AND is_nullable = 'YES'
       AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'profiles.home_location_id is missing, not nullable, or not a uuid';
  END IF;

  -- The referential action is the whole judgement call above, so it is the one
  -- thing worth reading back out of the catalog. `a` is NO ACTION, `r` RESTRICT,
  -- `n` SET NULL, `d` SET DEFAULT, `c` CASCADE — a default-flavoured FK would
  -- report `a` here and look, from the DDL alone, exactly like this one.
  SELECT c.confdeltype
    INTO v_delete_rule
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
   WHERE n.nspname = 'public'
     AND t.relname = 'profiles'
     AND c.contype = 'f'
     AND a.attname = 'home_location_id';

  IF v_delete_rule IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION
      'profiles.home_location_id has no ON DELETE SET NULL foreign key (confdeltype %) — a retired location would block or corrupt instead of clearing',
      COALESCE(v_delete_rule, 'no FK at all');
  END IF;

  -- The grant, per role. The statements above run as the migration's owner,
  -- which holds everything, so a missing grant is invisible until a parent tries
  -- to save and gets a permission denial that looks like an application bug.
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'home_location_id', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot UPDATE profiles.home_location_id — every settings save of this field would fail';
  END IF;

  -- The other direction, and the one that matters more: the column grant must
  -- not have arrived as a table-wide UPDATE, which would carry `role` with it.
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE profiles.role — a table-wide grant leaked in alongside the column grant';
  END IF;

  IF has_column_privilege('anon', 'public.profiles', 'home_location_id', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can UPDATE profiles.home_location_id';
  END IF;
END;
$$;
