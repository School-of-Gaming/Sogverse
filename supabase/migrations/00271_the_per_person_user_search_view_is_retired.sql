-- The per-person user search view is retired.
--
-- `user_list_entries` (00270) answers the admin user search with a family-wide
-- blob, and nothing reads `user_search_index` once the code that shipped with
-- that view is what is running. This file holds the drop alone, and the reason
-- it is a file of its own is operational rather than structural: staging is
-- shared and a migration reaches it before its branch merges, so a drop in
-- 00270 would have broken the search of every checkout still reading the old
-- view for as long as that branch stayed open. Pushed at landing time instead,
-- the gap is the minutes between a push and a deploy. On a database built from
-- `migrations/` the two files run back to back and the split is invisible.
--
-- Two applied migrations name the old view inside a guard's error message
-- (`00180` and `00181`, asserting `_list_views()` returns rows at all) and three
-- more created or recreated it. None of that is affected: those assertions ran
-- at *their* own version, when the view still existed, and a message is prose.
-- What does have to move is the DB suite's view registry, which moved with
-- 00270.

DROP VIEW public.user_search_index;

-- ---------------------------------------------------------------------------
-- End-state assertions.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_rows bigint;
BEGIN
  -- --- (a) The view this retires is gone. ----------------------------------
  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'user_search_index'
  ) THEN
    RAISE EXCEPTION 'user_search_index still exists — two views would answer the same question and only one of them has a family-wide blob';
  END IF;

  -- --- (b) Its replacement is still here. ----------------------------------
  -- A plain DROP VIEW refuses to take a dependent with it, so this can only
  -- fail if the two files were applied out of order — which is exactly the
  -- mistake a hand-applied migration makes, and the one worth a sentence.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'user_list_entries'
       AND c.relkind = 'v'
  ) THEN
    RAISE EXCEPTION 'user_list_entries does not exist — the old search view was dropped with nothing standing in for it; apply 00270 first';
  END IF;

  -- --- (c) The catalog helper still sees a view. ---------------------------
  -- 00180 and 00181 both assert `_list_views()` returns rows, naming
  -- user_search_index as the view that proves it. That view is gone as of this
  -- migration, so the claim is re-made here against the one that replaced it —
  -- otherwise the schema could arrive with no views at all and every check
  -- built on that helper would pass while verifying nothing.
  SELECT count(*) INTO v_rows FROM public._list_views();
  IF v_rows < 1 THEN
    RAISE EXCEPTION '_list_views returned no rows — user_list_entries exists by this migration, so the catalog filter is wrong and every view check built on it would pass while verifying nothing';
  END IF;
END;
$assert$;
