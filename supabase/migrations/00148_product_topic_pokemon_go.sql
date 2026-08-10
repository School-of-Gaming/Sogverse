-- Adds `pokemon_go` to the `product_topic` enum.
--
-- WHY
--
-- Pokémon GO joins the catalog as a new game topic. `product_topic` is a closed
-- Postgres enum (00078 introduced it, 00089 split Minecraft into its three
-- editions), so a new topic is a schema change rather than a row someone adds —
-- there is deliberately no admin CRUD for topics, and that is what keeps the set
-- small enough for code to switch on exhaustively.
--
-- The database learns nothing about the game beyond the fact that the value
-- exists. Everything a person sees lives in code: the game/subject split, the
-- brand label ("Pokémon GO" — a proper noun, identical in every locale and never
-- translated), the PEGI rating and the store link are all in
-- src/lib/products/topics.ts, and the parent-facing prose is in the
-- productDetail.gameInfo message namespace.
--
-- HOW
--
-- One ALTER TYPE ... ADD VALUE, and deliberately nothing else. Since PG12 that
-- statement is transaction-safe — which matters, because the CLI wraps each
-- migration in a transaction — but the new value may not be *used* in the same
-- transaction that adds it: any cast of 'pokemon_go' to product_topic would
-- raise "unsafe use of new value of enum type". So there is no backfill here, no
-- product retyped, and no default touched.
--
-- Nothing else needs recreating either. Unlike 00089 — which had to swap the
-- whole type, because Postgres can add an enum value but not remove one — this
-- migration only widens the existing type, so its OID never changes. The
-- create_product / update_product RPCs take `product_topic` by name and pick the
-- widened type up untouched.
--
-- IF NOT EXISTS keeps the statement idempotent, matching 00044 (the only other
-- ADD VALUE in this history).

ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'pokemon_go';

-- Assert the exact end state. ADD VALUE IF NOT EXISTS is conditional, and a
-- conditional whose predicate did not match looks exactly like one that did its
-- job — the same reasoning as 00145's post-drop checks. Pinning the full list
-- (rather than just "pokemon_go is in there") also catches the failure that
-- actually costs something: a typo'd label, which would not error anywhere, and
-- would instead ship as a topic no product can ever be filed under.
--
-- This reads pg_enum's catalog rows and compares `enumlabel` as *text*. It never
-- casts a string to product_topic, so it does not trip the same-transaction
-- restriction described above. Ordered by enumsortorder, so it also pins where
-- the appended value landed.
DO $$
DECLARE
  v_labels text[];
BEGIN
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_labels
    FROM pg_catalog.pg_enum e
    JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public'
     AND t.typname = 'product_topic';

  IF v_labels IS DISTINCT FROM ARRAY[
    'minecraft_java',
    'minecraft_education',
    'minecraft_bedrock',
    'fortnite',
    'webinar',
    'pokemon_go'
  ]::text[] THEN
    RAISE EXCEPTION 'product_topic is %, expected the six known topics', v_labels;
  END IF;
END;
$$;
