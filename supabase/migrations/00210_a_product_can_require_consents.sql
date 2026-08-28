-- A product can require consents, and enrolling is what records them.
--
-- WHY
--
-- The Roblox programme is sold under terms a parent must agree to BEFORE their
-- child takes a seat: a programme terms document and a privacy policy, both
-- published on our own site. Today the platform has no idea those documents
-- exist, so the only answer it can give to "did this family agree, to which
-- version, and when" is a shrug. That is the same gap 00201 closed for the gedu
-- contract, one audience over, and this migration is deliberately built to the
-- same shape: a document whitelist that only migrations write, a version per
-- document ordered by created_at, and an acceptance row stamped server-side by
-- the one RPC that can write it.
--
-- WHAT A REQUIRED CONSENT IS — AND WHAT IT IS NOT
--
-- These are NON-REVOCABLE ENROLMENT CONDITIONS. You consent and you are in the
-- product; the only way out is to leave the product. There is no revoke, no
-- withdraw, no "granted = false" — a row here is a statement that an agreement
-- happened at an instant, and a statement about the past cannot be un-made.
--
-- THIS IS NOT THE MARKETING/MEDIA CONSENT SYSTEM, and the two must never be
-- unified. A media-permission consent (may we photograph your child, may we
-- email you about other clubs) is REVOCABLE by law and by decency: it carries a
-- current state, it is toggled from a settings page, it needs a granted/revoked
-- history and a "what is true right now" read. None of that belongs on this
-- table, and bolting it on would quietly turn an enrolment condition into
-- something a parent could switch off while keeping the seat it bought them.
-- That system is a separate future one. If you have arrived here to add a
-- `revoked_at` column, stop: you are in the wrong table.
--
-- WHY ACCEPTANCE IS PER ENROLMENT AND NOT PER PERSON
--
-- The consent is a condition of ONE seat, so it is recorded once per seat.
-- Enrolling a second child produces a second row; leaving the club and joining
-- again next term produces another. There is deliberately NO unique constraint
-- across (customer, participant, product, document) — repeat rows are not
-- duplicates, they are history, and each one answers "what did this family
-- agree to at the moment they took THIS seat". A unique constraint would make
-- the second enrolment silently inherit the first one's agreement, which is
-- exactly the claim we must not make.
--
-- WHAT IS DELIBERATELY ABSENT
--
--   * No signature. The gedu contract snapshots a typed name because a
--     contractor signs one; a parent ticking an enrolment condition does not,
--     and a name copied out of `profiles` would add no evidence the uid does
--     not already carry.
--   * No locale. Both documents are published in one text.
--   * No draft/pending status. A row exists iff the agreement happened.
--   * No update or delete path for any Data API role. The table is insert-only,
--     and the only inserter is the enrolment RPC.
--
-- WHY THE WHITELIST IS TWO TABLES
--
-- `consent_documents` is the IDENTITY of a document — the slug a product points
-- at, stable across every revision of the text. `consent_document_versions` is
-- one row per published revision of that identity. A product requires the
-- DOCUMENT; an acceptance names the VERSION, which is the row with the greatest
-- created_at at the moment of enrolment. That split is what lets a new version
-- of the privacy policy ship as one INSERT without touching a single product,
-- and it is the same created_at-ordering convention `gedu_contract_versions`
-- uses (see 00201 for why a table rather than an enum).
--
-- WHERE ENFORCEMENT LIVES
--
-- In `record_required_consents`, called from BOTH enrolment doors —
-- `create_participation` (the shop's signup gate) and `join_waitlist` (the
-- queue). One function so the rule cannot drift between the two paths, and no
-- EXECUTE grant on it for anybody: it is reached only from inside the two
-- SECURITY DEFINER functions that already own enrolment.
--
-- The paid shape is the case worth naming. `create_participation` writes NO
-- participation row for a paid product — it validates, and the row arrives
-- later from the Stripe webhook — yet it records consent anyway. That is
-- deliberate: the parent ticked the box at checkout, so the agreement HAPPENED,
-- and an acceptance row belonging to an abandoned Checkout is a harmless true
-- statement about a moment that really occurred. The alternative — recording it
-- from the webhook — would put the record hours away from the click that made
-- it, on a code path the parent is not present for.

-- ---------------------------------------------------------------------------
-- 1. The document identities
-- ---------------------------------------------------------------------------

CREATE TABLE public.consent_documents (
  slug       text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_consent_documents_slug_not_empty CHECK (btrim(slug) <> '')
);

COMMENT ON TABLE public.consent_documents IS
  'One row per consent DOCUMENT the platform knows about — its identity, not '
  'any one revision of its text. A product points at a slug here to say "a '
  'parent must agree to this before enrolling", and that pointer survives every '
  'republication of the document. Rows arrive by MIGRATION only: there is no '
  'write grant for any Data API role, because a document is something that was '
  'drafted and published, not a value an app invents. Readable by anon as well '
  'as authenticated, because the public shop names a product''s required '
  'consents before anybody has signed in.';

COMMENT ON COLUMN public.consent_documents.slug IS
  'The document''s stable identifier, e.g. roblox-programme-terms. The primary '
  'key, the value product_required_consents points at, and the value '
  'consent_acceptances stores alongside a version.';

COMMENT ON COLUMN public.consent_documents.created_at IS
  'When this document identity was added to the platform. Not an ordering key '
  'for anything — versions carry that — just a record of when the slug started '
  'existing.';

ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;

-- One policy, SELECT only, and it admits anon. The table holds no personal
-- data at all — it is a list of published document slugs — and the shop's
-- product page has to render "enrolling requires agreeing to X and Y" to a
-- stranger who has not signed in yet.
CREATE POLICY public_reads_consent_documents ON public.consent_documents
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.consent_documents TO anon;
GRANT SELECT ON TABLE public.consent_documents TO authenticated;
GRANT ALL    ON TABLE public.consent_documents TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.consent_document_versions (
  document_slug text NOT NULL
                  REFERENCES public.consent_documents(slug) ON DELETE CASCADE,
  version       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_slug, version),
  CONSTRAINT chk_consent_document_versions_version_not_empty
    CHECK (btrim(version) <> '')
);

COMMENT ON TABLE public.consent_document_versions IS
  'One row per published revision of a consent document. Rows arrive by '
  'MIGRATION only — no Data API role holds a write grant — because a version is '
  'a document that was published, not a value an app invents. The CURRENT '
  'version OF A SLUG is the row with the greatest created_at for that slug, the '
  'same derivation gedu_contract_versions uses (00201), and that is the version '
  'an enrolment records. Publishing a new revision is therefore one INSERT and '
  'touches no product: existing acceptances go on naming the version that was '
  'live when they were made, which is the whole point of storing a version '
  'rather than a boolean.';

COMMENT ON COLUMN public.consent_document_versions.document_slug IS
  'Which document this is a revision of. ON DELETE CASCADE only because a slug '
  'that is gone has no revisions; nothing deletes one today.';

COMMENT ON COLUMN public.consent_document_versions.version IS
  'The version label as the published document carries it — the date under "Last '
  'updated" on the page a parent reads. The value consent_acceptances stores.';

COMMENT ON COLUMN public.consent_document_versions.created_at IS
  'When this revision was added to the platform. Ordering key and nothing else: '
  'the greatest created_at for a slug IS that document''s current version, which '
  'is the one question anything asks of this table.';

ALTER TABLE public.consent_document_versions ENABLE ROW LEVEL SECURITY;

-- Same reasoning as the identities above: document labels, no personal data,
-- and the public product page names the version a parent would be agreeing to.
CREATE POLICY public_reads_consent_document_versions
  ON public.consent_document_versions
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.consent_document_versions TO anon;
GRANT SELECT ON TABLE public.consent_document_versions TO authenticated;
GRANT ALL    ON TABLE public.consent_document_versions TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Which consents a product requires
-- ---------------------------------------------------------------------------

CREATE TABLE public.product_required_consents (
  product_id    uuid NOT NULL
                  REFERENCES public.products(id) ON DELETE CASCADE,
  document_slug text NOT NULL
                  REFERENCES public.consent_documents(slug),
  PRIMARY KEY (product_id, document_slug)
);

COMMENT ON TABLE public.product_required_consents IS
  'The admin-picked set: which consent documents a parent must agree to before '
  'enrolling on this product. Empty for almost every product — the Roblox '
  'programme is what this exists for. Written only by '
  'set_product_required_consents, which create_product and update_product both '
  'call; no Data API role holds a write grant, so the join table has exactly one '
  'writer. Readable through the product''s own read predicate, exactly as '
  'product_prices and schedule_slots are, because the shop has to tell a '
  'stranger what enrolling would commit them to. ON DELETE CASCADE from '
  'products: a requirement is a property of a product and means nothing without '
  'it. NO cascade from consent_documents, deliberately — a slug that products '
  'still require must not be deletable out from under them.';

COMMENT ON COLUMN public.product_required_consents.document_slug IS
  'The DOCUMENT, never a version. Which version a parent actually agreed to is '
  'resolved at the moment of enrolment and stored on the acceptance row, so a '
  'republished document reaches every product that requires it without a single '
  'row changing here.';

ALTER TABLE public.product_required_consents ENABLE ROW LEVEL SECURITY;

-- SELECT only, gated by the product's own read predicate — the same policy
-- shape product_prices, product_translations and schedule_slots carry, so a
-- requirement is exactly as visible as the product it belongs to and no more.
CREATE POLICY read_product_required_consents_via_product
  ON public.product_required_consents
  FOR SELECT
  TO anon, authenticated
  USING (public.can_read_product(product_id));

GRANT SELECT ON TABLE public.product_required_consents TO anon;
GRANT SELECT ON TABLE public.product_required_consents TO authenticated;
GRANT ALL    ON TABLE public.product_required_consents TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The acceptances
-- ---------------------------------------------------------------------------

CREATE TABLE public.consent_acceptances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL
                     REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_id   uuid NOT NULL
                     REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL
                     REFERENCES public.products(id) ON DELETE CASCADE,
  document_slug    text NOT NULL,
  document_version text NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_acceptances_document_fkey
    FOREIGN KEY (document_slug, document_version)
    REFERENCES public.consent_document_versions(document_slug, version)
);

COMMENT ON TABLE public.consent_acceptances IS
  'One row per (enrolment, required document): the whole of what the platform '
  'records about a parent agreeing to a product''s enrolment conditions. '
  'INSERT-ONLY — nothing updates or deletes a row here, and no Data API role '
  'holds a write grant, because every field a forger would want is stamped '
  'server-side by record_required_consents, which is the only writer and is '
  'reachable only from inside create_participation and join_waitlist. '
  'DELIBERATELY carries no unique constraint: enrolling a second child, or '
  'leaving and re-joining a term later, each produce fresh rows, and those are '
  'history rather than duplicates — a constraint would make the second '
  'enrolment silently inherit the first one''s agreement. These consents are '
  'NON-REVOCABLE enrolment conditions and are not the (future, separate) '
  'revocable marketing/media consent system; there is no revoked_at column and '
  'there must never be one on this table.';

COMMENT ON COLUMN public.consent_acceptances.customer_id IS
  'The adult who agreed — the purchasing customer, taken from the enrolment in '
  'hand rather than from anything the caller supplied separately. Same FK and '
  'same cascade as participations.customer_id.';

COMMENT ON COLUMN public.consent_acceptances.participant_id IS
  'Whose seat the agreement conditions: the child being enrolled, or the adult '
  'themselves on a product whose audience admits parents (participant_id = '
  'customer_id is what a self seat looks like, exactly as on participations).';

COMMENT ON COLUMN public.consent_acceptances.product_id IS
  'The product enrolled onto. ON DELETE CASCADE, matching participations: a '
  'deleted product takes its seats with it, and an agreement to conditions of an '
  'enrolment that no longer exists conditions nothing.';

COMMENT ON COLUMN public.consent_acceptances.document_version IS
  'The version that was CURRENT for this slug at the moment of enrolment, '
  'resolved server-side — never supplied by a caller. Together with '
  'document_slug it is a foreign key into consent_document_versions, so a row '
  'can only ever name a document the platform actually published.';

COMMENT ON COLUMN public.consent_acceptances.accepted_at IS
  'When the agreement was recorded, stamped by the server. A client never '
  'supplies it — a timestamp the agreeing party chooses proves nothing about '
  'when they agreed.';

CREATE INDEX idx_consent_acceptances_customer
  ON public.consent_acceptances (customer_id);

CREATE INDEX idx_consent_acceptances_product_participant
  ON public.consent_acceptances (product_id, participant_id);

ALTER TABLE public.consent_acceptances ENABLE ROW LEVEL SECURITY;

-- Two SELECT policies and no write policy, because there is no write grant for
-- a write policy to authorize — the inserts arrive through SECURITY DEFINER
-- functions, which bypass RLS entirely. The `(SELECT …)` wrapper on each
-- predicate is the standing form here: it makes the call an InitPlan evaluated
-- once per statement rather than once per row.
--
-- There is no participant arm on purpose. Agreeing to an enrolment condition is
-- an act of the adult who bought the seat, and the child sitting in it neither
-- performed it nor needs to read it; the parent's own row is where the record
-- is shown. Adding an arm later is a policy, not a schema change.
CREATE POLICY admins_read_consent_acceptances ON public.consent_acceptances
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY customers_read_own_consent_acceptances ON public.consent_acceptances
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

-- SELECT and nothing more for `authenticated`; nothing at all for `anon` — an
-- acceptance names two people, so it is the one table here with personal data
-- in it. `service_role` gets the full set as it does on every other table the
-- DB suite asserts against through the admin client.
GRANT SELECT ON TABLE public.consent_acceptances TO authenticated;
GRANT ALL    ON TABLE public.consent_acceptances TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The two documents that exist today
-- ---------------------------------------------------------------------------
--
-- Both are published at /roblox/terms and /roblox/privacy, and each version
-- label is that page's own "Last updated" date. They differ (the privacy policy
-- was revised three days after the terms) and that difference is the point of
-- versioning per slug rather than per programme: an acceptance has to name the
-- text the parent actually read.

INSERT INTO public.consent_documents (slug) VALUES
  ('roblox-programme-terms'),
  ('roblox-privacy-policy');

INSERT INTO public.consent_document_versions (document_slug, version) VALUES
  ('roblox-programme-terms', '2026-07-31'),
  ('roblox-privacy-policy',  '2026-08-03');

-- ---------------------------------------------------------------------------
-- 6. The one writer of an acceptance
-- ---------------------------------------------------------------------------
--
-- Both enrolment doors call this and nothing else does. Keeping the rule in one
-- function is what stops the shop path and the waitlist path from drifting
-- apart — a product that refuses an unconsented signup but accepts an
-- unconsented queue join would be worse than one that checked nowhere, because
-- it would look enforced.
--
-- No EXECUTE grant for anybody, exactly as join_waitlist carries none: it is
-- reached from inside two SECURITY DEFINER functions, which run as the owner
-- and therefore already hold the privilege.

CREATE FUNCTION public.record_required_consents(
  p_product_id          uuid,
  p_customer_id         uuid,
  p_participant_id      uuid,
  p_consented_documents text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_required text[];
  v_missing  text[];
BEGIN
  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  -- The overwhelmingly common case: a product with no required consents. It is
  -- not an error to send slugs anyway — an extra slug is a client that has not
  -- refreshed, not an attack — so nothing is written and nothing is refused.
  IF v_required IS NULL THEN
    RETURN;
  END IF;

  -- COALESCE rather than a NULL check: a caller who sent nothing and a caller
  -- who sent an empty array are making the same claim, and both must be refused
  -- with the same message naming what is missing.
  v_missing := ARRAY(
    SELECT r
      FROM unnest(v_required) AS r
     WHERE NOT (r = ANY (COALESCE(p_consented_documents, ARRAY[]::text[])))
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'this product requires consent to % before enrolling',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One row per REQUIRED document — never one per slug the caller sent, so a
  -- client that ticks a document the product does not require records nothing
  -- extra. The version is resolved here and never taken from the caller: the
  -- greatest created_at for that slug, with `version DESC` as a tiebreaker so
  -- two revisions published in one transaction pick deterministically rather
  -- than arbitrarily (an arbitrary answer to "what is current" is worse than a
  -- wrong one, because it changes between reads).
  --
  -- A required slug with NO published version yields NULL here and the NOT NULL
  -- on document_version aborts the enrolment. That is the intended handling: it
  -- is a data error only a migration could create, and enrolling somebody
  -- against a document that has never been published is not a lesser outcome
  -- than failing loudly.
  INSERT INTO public.consent_acceptances (
    customer_id, participant_id, product_id, document_slug, document_version
  )
  SELECT p_customer_id,
         p_participant_id,
         p_product_id,
         r,
         (SELECT cdv.version
            FROM public.consent_document_versions cdv
           WHERE cdv.document_slug = r
           ORDER BY cdv.created_at DESC, cdv.version DESC
           LIMIT 1)
    FROM unnest(v_required) AS r;
END;
$$;

COMMENT ON FUNCTION public.record_required_consents(uuid, uuid, uuid, text[]) IS
  'The enrolment-consent gate, and the only writer of consent_acceptances. '
  'Loads the product''s required document slugs, refuses the enrolment with '
  'check_violation unless the caller''s array covers ALL of them (naming the '
  'missing ones), and then writes one acceptance row per REQUIRED slug at that '
  'slug''s CURRENT version — the row with the greatest created_at, resolved '
  'server-side and never supplied by a caller. A product requiring nothing is a '
  'no-op, including when slugs are sent anyway. Called from create_participation '
  'and join_waitlist and from nowhere else, so the shop path and the queue path '
  'cannot drift apart; carries no EXECUTE grant for any role, because both '
  'callers are SECURITY DEFINER and already hold the privilege as the owner. '
  'These consents are NON-REVOCABLE enrolment conditions — see the '
  'consent_acceptances table comment.';

REVOKE EXECUTE ON FUNCTION
  public.record_required_consents(uuid, uuid, uuid, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 7. The one writer of a product's requirement set
-- ---------------------------------------------------------------------------
--
-- Wipe-and-replace, the same shape update_product already uses for prices,
-- slots and holiday calendars. It exists as its own function rather than as two
-- copies of an INSERT because create_product is SECURITY INVOKER: an inline
-- insert there would run as the admin's own session role and would need a table
-- write grant on product_required_consents, which is exactly the Data API
-- surface this migration is keeping at zero. One guarded SECURITY DEFINER
-- writer costs one spine entry and keeps the join table grant-free.

CREATE FUNCTION public.set_product_required_consents(
  p_product_id uuid,
  p_slugs      text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  DELETE FROM public.product_required_consents
   WHERE product_id = p_product_id
     AND NOT (document_slug = ANY (COALESCE(p_slugs, ARRAY[]::text[])));

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair above and below is a *set* replacement, and leaving an unchanged row
  -- in place keeps the delete from churning rows an admin did not touch. A slug
  -- the whitelist has never heard of is refused by the foreign key, which is
  -- the only validation this needs — admins are trusted, and a bad slug is a
  -- broken deploy rather than an attack.
  IF p_slugs IS NOT NULL AND array_length(p_slugs, 1) > 0 THEN
    INSERT INTO public.product_required_consents (product_id, document_slug)
    SELECT p_product_id, s
      FROM unnest(p_slugs) AS s
    ON CONFLICT (product_id, document_slug) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_product_required_consents(uuid, text[]) IS
  'Replace the set of consent documents a product requires, admin-only and '
  'guard-first on assert_admin. The only writer of product_required_consents: '
  'that table carries no write grant for any Data API role, and this function '
  'is what create_product and update_product both call so the join table has '
  'exactly one door. NULL and an empty array both mean "requires nothing", '
  'which is how a requirement is cleared. An unknown slug is refused by the '
  'foreign key into consent_documents — the only validation needed, since '
  'admins are trusted and a bad slug is a broken deploy rather than an attack.';

REVOKE EXECUTE ON FUNCTION public.set_product_required_consents(uuid, text[])
  FROM PUBLIC;
-- `authenticated` because create_product is SECURITY INVOKER and reaches this
-- as the admin's own session role; `service_role` for the admin client and the
-- DB suite.
GRANT EXECUTE ON FUNCTION public.set_product_required_consents(uuid, text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_required_consents(uuid, text[])
  TO service_role;

-- ---------------------------------------------------------------------------
-- 8. create_product carries the requirement set
-- ---------------------------------------------------------------------------
--
-- The body below is the LIVE definition from supabase/schema.sql with ONE
-- addition: the `set_product_required_consents` call at the end. Everything
-- else is verbatim.
--
-- Adding a parameter changes the argument list, so CREATE OR REPLACE would
-- leave a second overload behind and break PostgREST's candidate resolution.
-- The function is therefore DROPped with its full old signature and recreated,
-- which rebuilds its ACL from scratch — hence the REVOKE/GRANT pair re-issued
-- for both roles and the re-COMMENT (00172 proved on staging that a recreated
-- function can come back PUBLIC-executable regardless of 00099's
-- default-privilege entry).
--
-- The new parameter is appended to the DEFAULT tail, following `tag` (00178)
-- and `region_lock_country` (00193) exactly: NULL is a legal value meaning
-- "requires nothing", so omission is how that reaches the table, and the wire
-- schema upstream is what keeps an omission deliberate.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- image_path is absent from this INSERT on purpose (00198): a product's
  -- picture is the catalogue entry it points at, the route writes image_id in
  -- its own statement after this one, and the trigger on products derives the
  -- served path from it.
  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country
  )
  RETURNING id INTO v_product_id;

  -- Staff-only, so it lands in its own table. No row when there is no link.
  IF v_material_url IS NOT NULL THEN
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (v_product_id, v_material_url);
  END IF;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        v_product_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  -- The enrolment conditions (00210). Delegated rather than written inline
  -- because this function is SECURITY INVOKER and product_required_consents
  -- carries no write grant for `authenticated` — the guarded DEFINER writer is
  -- what makes that possible. Unconditional: NULL means "requires nothing",
  -- which on a create is the same as doing nothing, and calling it anyway keeps
  -- this function and update_product reading identically.
  PERFORM public.set_product_required_consents(v_product_id, p_required_consent_slugs);

  RETURN v_product_id;
END;
$$;

COMMENT ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) IS
  'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars, the staff-only material link and, since 00210, the consent documents enrolling on it requires. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs (00210) is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

REVOKE ALL ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. update_product replaces the requirement set
-- ---------------------------------------------------------------------------
--
-- Same drop-and-recreate for the same reason, and the body below is the LIVE
-- definition from supabase/schema.sql with ONE addition at the end: the
-- requirement set is replaced alongside prices, slots and holiday calendars.
-- Everything else is verbatim.
--
-- Wipe-and-replace, not merge: this function assigns every editable property of
-- a product on every call, and the requirement set is one of them. NULL clears
-- it, which is the only expressible way to clear one and is what makes the wire
-- schema's required-nullable field load-bearing.

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  -- The product gate lock, taken where the existence probe used to be: this
  -- function now deletes from the product's roster, so it serializes against
  -- the participation RPCs that write it (join_waitlist et al) exactly as they
  -- serialize against each other. FOUND is set by PERFORM, so the not-found
  -- error is unchanged in code and position.
  PERFORM 1 FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, which is why a new column
  -- has to reach this statement in the same change that adds it — a column this
  -- function does not know about is nulled by the next admin edit. `tag` is the
  -- one 00178 added, and it is the case that shows why the rule needs stating:
  -- its parameter is defaulted, so an omitting caller clears the tag silently
  -- and legally. That is the intended way to clear one; what stops it happening
  -- by accident is the wire schema demanding the field on every update.
  -- `region_lock_country` (00193) is the same shape for the same reasons, and a
  -- region lock is editable for a product's whole life on purpose: it gates
  -- future enrolments only and never revisits an existing seat.
  --
  -- `image_path` is the one editable-looking column this statement must NOT
  -- name, and 00198 removed the assignment along with the parameter that fed
  -- it. It is derived from image_id by trg_products_apply_image_path, which
  -- runs on this very UPDATE; assigning it here only ever wrote a value the
  -- trigger overwrote a moment later.
  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    for_gamers               = p_for_gamers,
    for_parents              = p_for_parents,
    tag                      = p_tag,
    region_lock_country      = p_region_lock_country,
    spoken_language_code     = p_spoken_language_code,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

  -- A product with no waitlist holds no queue. The admin form turns the flag
  -- off two ways — unticking the box, or choosing Unlimited seats, which
  -- derives it false — and the groups panel draws its waitlist column only
  -- while the flag is on, so anything left queued here would be invisible to
  -- every affordance that could promote or remove it. Deleting is the clean
  -- answer rather than the harsh one: the edit that got us here means the
  -- product has seats open, so a dropped family can re-enter through the front
  -- door and land in a BETTER state than the queue they were in (free products
  -- re-enroll instantly; paid ones check out, which is what creates the
  -- subscription a promotion could never have created for them). Promoting
  -- them here instead would grant a free seat on a subscription-billed club.
  --
  -- This is silent by owner decision: no confirmation, no warning, no email.
  -- The triggering edit is expected to be accidental, and the families are told
  -- nothing — a known, accepted impact, recorded here because it is the kind of
  -- thing a future reader will assume was an oversight.
  --
  -- Keyed to the flag's VALUE, not to it changing, so the same statement heals
  -- a queue stranded by an edit made before this rule existed: the next save of
  -- anything at all on the product clears it.
  --
  -- THE CARVE-OUT: never delete a row that carries a LIVE subscription
  -- (00170's predicate — a family_subscriptions row with status <>
  -- 'cancelled'; a dunning-dead one is not live and does not protect the row).
  -- The FK is ON DELETE CASCADE, so dropping such a row would delete our only
  -- record of a subscription Stripe keeps billing — the exact hazard
  -- demote_to_waitlist and admin_remove_participation refuse for. A waitlisted
  -- row with a live subscription is a webhook-race ghost (a demote landing
  -- between Checkout completing and the webhook's insert, or a manual
  -- sub-adoption), effectively unreachable, and it is skipped in silence:
  -- there is no surface here to report it on, and refusing the whole product
  -- edit over a row nobody can see would be worse than leaving it queued.
  IF NOT p_waitlist_enabled THEN
    DELETE FROM public.participations p
     WHERE p.product_id = p_id
       AND p.status = 'waitlisted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.family_subscriptions fs
          WHERE fs.participation_id = p.id
            AND fs.status <> 'cancelled'
       );
  END IF;

  -- Cleared means the row goes, so "no lesson material" stays the absence of a
  -- record rather than becoming a row holding NULL.
  IF v_material_url IS NULL THEN
    DELETE FROM public.product_staff_details WHERE product_id = p_id;
  ELSE
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (p_id, v_material_url)
    ON CONFLICT (product_id) DO UPDATE
      SET material_url = EXCLUDED.material_url;
  END IF;

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name              = EXCLUDED.name,
      short_description = EXCLUDED.short_description,
      long_description  = EXCLUDED.long_description,
      updated_at        = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- schedule_slots — wipe and replace.
  DELETE FROM public.schedule_slots WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        p_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_prices — wipe and replace.
  DELETE FROM public.product_prices WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_holiday_calendars — wipe and replace.
  DELETE FROM public.product_holiday_calendars WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  -- product_required_consents — wipe and replace (00210), through the join
  -- table's single guarded writer. NULL clears the set, which is the only
  -- expressible way to clear one and is why the wire schema demands the field
  -- on every update. Existing consent_acceptances are untouched: dropping a
  -- requirement changes what FUTURE enrolments must agree to and says nothing
  -- about what past ones did agree to.
  PERFORM public.set_product_required_consents(p_id, p_required_consent_slugs);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[]) IS
  'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars, the staff-only material link and — since 00210 — the set of consent documents enrolling on it requires, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone. Since 00210 p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did.';

REVOKE ALL ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. create_participation records the consents it required
-- ---------------------------------------------------------------------------
--
-- The body below is the LIVE definition from supabase/schema.sql with ONE
-- addition: the `record_required_consents` call, placed immediately after the
-- seat-cap gate. Everything else is verbatim.
--
-- WHY THERE AND NOT EARLIER. Every statement above the seat-cap gate is a
-- question about whether this enrolment may happen at all; the consent block
-- runs at the moment the answer turns out to be yes, which is the moment the
-- enrolment condition binds. A full product therefore returns kind='full'
-- without recording anything — nobody enrolled, so nobody agreed to anything —
-- and that ordering is deliberate rather than incidental.
--
-- WHY IT RUNS FOR THE PAID SHAPES TOO. Those branches write no participation
-- row at all: the seat arrives later, from the Stripe webhook. The consent
-- still happened here, at the click, so it is recorded here. A row belonging to
-- a Checkout the parent then abandoned is a harmless true statement about a
-- moment that really occurred, and it is a far better failure mode than a
-- record made hours later on a code path the parent is not present for.
--
-- Adding a parameter changes the argument list, so this is a DROP and recreate
-- rather than CREATE OR REPLACE — an overload would break PostgREST's candidate
-- resolution — and the ACL is rebuilt from scratch below.

DROP FUNCTION public.create_participation(uuid, uuid, uuid, text, text);

CREATE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_is_parent             BOOLEAN;
  v_auto_group_id         UUID;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- WHO IS IN THE SEAT, and whether this product admits them.
  --
  -- Plain `=`, deliberately not `IS NOT DISTINCT FROM`: two NULL ids are not a
  -- self seat, they are a caller with nothing to say, and the NULL comparison
  -- drops them into the ELSE branch where the parent-link check refuses them.
  -- Fail-closed falls out of the operator rather than out of a guard somewhere
  -- above.
  IF p_participant_id = p_customer_id THEN
    -- The adult's own seat. This function has no auth.uid() (service_role
    -- only), so "self" can only mean participant = the customer the route
    -- pinned to the session user — which is the same footing the parent-link
    -- check has always stood on.
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Somebody else's seat. The parent-link requirement is unchanged and is
    -- what keeps "a parent can never enroll another adult" true: an unlinked
    -- adult fails here exactly as an unlinked child does.
    SELECT EXISTS (
      SELECT 1 FROM public.parent_gamer
      WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
    ) INTO v_is_parent;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_product.for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'subscription_monthly', 'single_payment', 'free', 'external'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  -- The already-enrolled gate. Its status list has to match the one
  -- `confirm_paid_participation` conflicts on, or a signup can pass here, take
  -- the parent's money, and then be refused at confirmation with nothing to
  -- show for it. 'completed' is the member that was missing: nothing writes
  -- that status today, so the gap was unreachable rather than harmless.
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_participant_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup. A parent's
  -- own seat counts here like anybody else's: the cap is on seats, not on
  -- children.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  -- THE ENROLMENT CONDITIONS (00210). Every gate above has passed and a seat is
  -- available, so this signup is one the platform will accept — which is
  -- precisely when the product's required consents bind. Raises check_violation
  -- naming any document the caller did not agree to; otherwise writes one
  -- acceptance row per required document at that document's current version.
  -- Runs for EVERY purchase shape, the paid ones included: they write no
  -- participation row here, but the parent agreed here, so the record belongs
  -- here. A no-op for the overwhelming majority of products, which require
  -- nothing.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_consented_documents
  );

  -- AUTOMATIC PLACEMENT (00206), for the two branches below that seat somebody
  -- on the spot. A no-charge product with exactly one group has no placement
  -- decision left in it, so the seat goes straight into that group instead of
  -- into the unassigned inbox; zero groups has nowhere to put anyone, and two
  -- or more is a real decision that stays a human's. NULL out of this read is
  -- the unassigned inbox, which is what every enrollment did before.
  --
  -- Safe against a concurrent group edit because the product row is held FOR
  -- UPDATE above — the same lock the group editor takes. LIMIT 2 because the
  -- question is "exactly one?", not "how many?".
  IF public.is_no_charge(v_product.billing_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
    -- from group_id, and the table comment forbids writing it by hand.
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Municipality clubs are invoiced off-platform: no Stripe, nothing to
  -- confirm later. Mirrors the free branch (instant active), gated on
  -- billing_mode so a paid product can never be registered without payment.
  IF p_purchase_shape = 'external' THEN
    IF v_product.billing_mode <> 'external_contract' THEN
      RAISE EXCEPTION 'product is not externally contracted'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'external_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Paid shapes (subscription_monthly, single_payment). Everything above has
  -- passed, so this signup is one the platform would accept — but no row is
  -- written until the money arrives. The caller creates the Stripe Checkout
  -- Session next; if the parent abandons it, nothing was left behind to clean
  -- up. `confirm_paid_participation` writes the row from the webhook.
  RETURN jsonb_build_object('kind', 'validated');
END;
$$;

COMMENT ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) IS
  'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap) and then either writes the seat or reports that the caller may go and take the money. The two no-charge shapes — free and external (municipality, invoiced off-platform) — insert an active row here and now; the paid shapes return kind=''validated'' and nothing is written until confirm_paid_participation runs from the Stripe webhook, so an abandoned Checkout leaves nothing behind. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count and the group read below race-free against a concurrent signup or group edit. Since 00206 the two instant-active branches place the seat automatically when the product charges nothing AND has exactly one group: that combination has no placement decision left in it, so the row lands in that group rather than in the unassigned inbox. Zero groups, two or more groups, or any paid product still land group_id NULL — the inbox — and whether the single group has a gedu assigned is not consulted. group_joined_at is never written here; a trigger stamps it from group_id. Since 00210 it takes p_consented_documents and, just after the seat-cap gate, calls record_required_consents: an enrolment onto a product with required consent documents is refused with check_violation unless the array covers all of them, and otherwise records one acceptance row per required document at that document''s current version. That runs for EVERY purchase shape — the paid ones write no participation row here, but the parent agreed here, so the record is made here, and an acceptance behind an abandoned Checkout is a harmless true statement. A full product returns kind=''full'' before any of it, because nobody enrolled. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user.';

REVOKE ALL ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Joining the queue is an enrolment moment too
-- ---------------------------------------------------------------------------
--
-- A place in line is a promise of a seat, so it refuses exactly what the signup
-- path refuses — that is the standing argument for every gate `join_waitlist`
-- shares with `create_participation`, and the consent gate is no different. A
-- family that could queue without agreeing would meet the conditions for the
-- first time at promotion, which is the moment they are least able to say no.
--
-- The consent block sits AFTER the idempotency return, so only the call that
-- actually writes a queue row records an acceptance: a stale tab resubmitting
-- is one enrolment, not two, and the `idempotent` flag already exists to say so.
--
-- Both functions are dropped and recreated: `join_product_waitlist` because it
-- has to pass the new argument through, `join_waitlist` because it takes it.
-- Order matters only for readability — plpgsql resolves the inner call at run
-- time, not at creation.

DROP FUNCTION public.join_product_waitlist(uuid, uuid);
DROP FUNCTION public.join_waitlist(uuid, uuid, uuid);

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_ts       TIMESTAMPTZ;
  v_existing_status   public.participation_status;
  v_now               TIMESTAMPTZ;
  v_position          INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Same audience gate as create_participation, and for the same reason: a
  -- queue is a promise of a seat, so it has to refuse exactly the seats the
  -- signup path would. See that function for why `=` rather than
  -- `IS NOT DISTINCT FROM`, and for why the parent-link arm is what keeps a
  -- parent from enrolling another adult.
  IF p_participant_id = p_customer_id THEN
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.parent_gamer
      WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
    ) INTO v_is_parent;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_product.for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is,
  -- flagged so the caller can tell this apart from the INSERT below.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'waitlisted' THEN
      SELECT COUNT(*) INTO v_position
        FROM public.participations
        WHERE product_id = p_product_id AND status = 'waitlisted'
          AND (waitlisted_at < v_existing_ts
               OR (waitlisted_at = v_existing_ts AND id <= v_existing_id));
    ELSE
      -- Already holds a spot (active/reserving) — not on the waitlist.
      v_position := 0;
    END IF;
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_position,
      'status', v_existing_status::text,
      'idempotent', TRUE
    );
  END IF;

  -- THE ENROLMENT CONDITIONS (00210), below the idempotency return so a replay
  -- records nothing: the same enrolment agreed once. Raises check_violation
  -- naming any required document the caller did not agree to; otherwise writes
  -- one acceptance row per required document at its current version. Joining a
  -- queue IS the enrolment moment on this path — meeting the conditions for the
  -- first time at promotion would ask a family to agree at the moment they are
  -- least able to decline.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_consented_documents
  );

  -- Stamp the join time; order is derived from it, never stored as a rank.
  -- clock_timestamp(), NOT now(): now() is transaction_timestamp() (frozen at
  -- transaction start), so concurrent joins serialized on the gate lock can
  -- carry equal/inverted stamps and both compute rank 1. clock_timestamp()
  -- reads the wall clock at this statement — which runs under the lock, after
  -- the prior joiner committed — so stamps are monotonic with real join order.
  v_now := clock_timestamp();
  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  -- The one call that wrote a row. Everything that must happen exactly once per
  -- place in line keys on this.
  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted',
    'idempotent', FALSE
  );
END;
$$;

COMMENT ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]) IS
  'Waitlist engine behind join_product_waitlist: gates the audience, refuses a product with the waitlist off, and either writes a waitlisted participation stamped with clock_timestamp() or returns the waitlisted/reserving/active row already there. Returns participation_id, waitlist_position (0 when the row already holds a seat rather than a place in line), status, and idempotent — false only on the call that ran the INSERT, true on a call that recognised an existing row. Anything that must happen exactly once per place in line (the confirmation email) keys on idempotent=false; the flag is the only way to tell a replay apart, since both answers are otherwise identical. Since 00210 it takes p_consented_documents and calls record_required_consents just below the idempotency return, so joining a queue is held to the same enrolment conditions as taking a seat — a family that could queue unconsented would first meet the conditions at promotion, which is the moment they are least able to decline — and a replay records nothing, because it is the same enrolment agreed once. No EXECUTE grant to anyone: the guarded wrapper is the only caller.';

REVOKE ALL ON FUNCTION public.join_waitlist(uuid, uuid, uuid, text[]) FROM PUBLIC;

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the consent gate, the clock_timestamp() ordering stamp —
  -- is unchanged and lives in the engine. This function's whole job is
  -- authorization plus pinning the actor to the session.
  RETURN public.join_waitlist(
    p_product_id, p_participant_id, (SELECT auth.uid()), p_consented_documents
  );
END;
$$;

COMMENT ON FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[]) IS
  'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check and, since 00210, the required-consent gate both live in join_waitlist.';

REVOKE ALL ON FUNCTION public.join_product_waitlist(uuid, uuid, text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_product_waitlist(uuid, uuid, text[]) TO authenticated;
GRANT ALL ON FUNCTION public.join_product_waitlist(uuid, uuid, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 12. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Everything below runs against the database this file was just applied to, so
-- a silent no-op (an already-claimed version number, a grant that did not take,
-- a function that came back PUBLIC-executable) fails here rather than three
-- weeks later. Apply-time protection: it says what was true when 00210 ran, and
-- nothing about later migrations.

DO $assert$
DECLARE
  v_table text;
  v_src   text;
BEGIN
  -- --- (a) All four tables exist with RLS on, and none is writable. --------
  FOREACH v_table IN ARRAY ARRAY[
    'consent_documents',
    'consent_document_versions',
    'product_required_consents',
    'consent_acceptances'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION '% is missing or has RLS disabled', v_table;
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated cannot SELECT %', v_table;
    END IF;

    -- The whole write posture in one assertion: every row in this feature is
    -- written by a migration or by a guarded function, never through the Data
    -- API.
    IF has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
    THEN
      RAISE EXCEPTION 'authenticated holds a write grant on % — every write goes through an RPC', v_table;
    END IF;

    IF NOT has_table_privilege('service_role', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'service_role cannot read % — the DB suite asserts against it through the admin client', v_table;
    END IF;
  END LOOP;

  -- --- (b) The anon surface: the three catalogue tables, never the record. --
  IF NOT has_table_privilege('anon', 'public.consent_documents', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.consent_document_versions', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.product_required_consents', 'SELECT')
  THEN
    RAISE EXCEPTION 'anon cannot read the consent catalogue — the public shop names a product''s required consents before sign-in';
  END IF;

  IF has_table_privilege('anon', 'public.consent_acceptances', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read consent_acceptances — an acceptance names two people';
  END IF;

  -- --- (c) The seeded documents and their current versions. ----------------
  IF (SELECT count(*) FROM public.consent_documents
       WHERE slug IN ('roblox-programme-terms', 'roblox-privacy-policy')) <> 2 THEN
    RAISE EXCEPTION 'the two Roblox consent documents were not seeded';
  END IF;

  IF (
    SELECT v.version
      FROM public.consent_document_versions v
     WHERE v.document_slug = 'roblox-programme-terms'
     ORDER BY v.created_at DESC, v.version DESC
     LIMIT 1
  ) <> '2026-07-31' THEN
    RAISE EXCEPTION 'the current roblox-programme-terms version is not 2026-07-31';
  END IF;

  IF (
    SELECT v.version
      FROM public.consent_document_versions v
     WHERE v.document_slug = 'roblox-privacy-policy'
     ORDER BY v.created_at DESC, v.version DESC
     LIMIT 1
  ) <> '2026-08-03' THEN
    RAISE EXCEPTION 'the current roblox-privacy-policy version is not 2026-08-03';
  END IF;

  -- --- (d) The acceptance record's shape. ----------------------------------
  --
  -- The composite foreign key is what stops a row naming a version of a
  -- document that was never published under that slug; a pair of single-column
  -- keys would admit exactly that.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.consent_acceptances'::regclass
       AND contype = 'f'
       AND confrelid = 'public.consent_document_versions'::regclass
       AND array_length(conkey, 1) = 2
  ) THEN
    RAISE EXCEPTION 'consent_acceptances does not carry the composite (slug, version) foreign key';
  END IF;

  -- The ABSENCE of a unique constraint is a design decision, so it is asserted
  -- rather than left to be rediscovered: repeat enrolments are history, and a
  -- unique key here would make the second one inherit the first one's consent.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.consent_acceptances'::regclass
       AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'consent_acceptances grew a unique constraint — repeat enrolments are history, not duplicates';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'consent_acceptances'
       AND cmd <> 'SELECT'
  ) <> 0 THEN
    RAISE EXCEPTION 'consent_acceptances carries a non-SELECT policy — writes go through the RPC alone';
  END IF;

  -- --- (e) The two new functions. ------------------------------------------
  IF to_regprocedure('public.record_required_consents(uuid, uuid, uuid, text[])') IS NULL THEN
    RAISE EXCEPTION 'record_required_consents was not created';
  END IF;

  IF has_function_privilege('authenticated', 'public.record_required_consents(uuid, uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_required_consents(uuid, uuid, uuid, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'record_required_consents is reachable through the Data API — only the enrolment RPCs may call it';
  END IF;

  IF to_regprocedure('public.set_product_required_consents(uuid, text[])') IS NULL THEN
    RAISE EXCEPTION 'set_product_required_consents was not created';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_product_required_consents';

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_product_required_consents does not guard on assert_admin';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_product_required_consents(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE set_product_required_consents — create_product is SECURITY INVOKER and reaches it as the caller';
  END IF;

  IF has_function_privilege('anon', 'public.set_product_required_consents(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE set_product_required_consents — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- --- (f) The four recreated functions: one signature each, guards intact. -
  IF to_regprocedure('public.create_participation(uuid, uuid, uuid, text, text, text[])') IS NULL THEN
    RAISE EXCEPTION 'create_participation was not recreated with its consent argument';
  END IF;

  IF to_regprocedure('public.create_participation(uuid, uuid, uuid, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'the old create_participation signature survived — an overload breaks PostgREST candidate resolution';
  END IF;

  IF to_regprocedure('public.join_waitlist(uuid, uuid, uuid)') IS NOT NULL
     OR to_regprocedure('public.join_product_waitlist(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'an old waitlist signature survived — an overload breaks PostgREST candidate resolution';
  END IF;

  IF (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_product') <> 1
     OR (SELECT count(*) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'update_product') <> 1
  THEN
    RAISE EXCEPTION 'create_product/update_product is overloaded — the old signature was not dropped';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['create_participation', 'join_waitlist'] LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_table;

    IF position('public.record_required_consents' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not call record_required_consents', v_table;
    END IF;
  END LOOP;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'join_product_waitlist';

  IF position('PERFORM public.assert_role(''customer'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'join_product_waitlist lost its customer guard';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['create_product', 'update_product'] LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_table;

    IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost its assert_admin guard', v_table;
    END IF;

    IF position('public.set_product_required_consents' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not write the requirement set', v_table;
    END IF;

    -- The retyped bodies are the hazard a drop-and-recreate carries: a lost
    -- section reads as a feature quietly not happening rather than as an error.
    IF position('product_translations' IN v_src) = 0
       OR position('schedule_slots' IN v_src) = 0
       OR position('product_prices' IN v_src) = 0
       OR position('product_holiday_calendars' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost one of its child-table sections', v_table;
    END IF;
  END LOOP;

  -- --- (g) The recreated ACLs. ---------------------------------------------
  IF NOT has_function_privilege('service_role', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_participation lost its service_role grant';
  END IF;

  IF has_function_privilege('authenticated', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'create_participation became reachable by a client role — it has no auth.uid() and trusts its caller';
  END IF;

  IF has_function_privilege('authenticated', 'public.join_waitlist(uuid, uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.join_waitlist(uuid, uuid, uuid, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'join_waitlist became reachable directly — the guarded wrapper is its only caller';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.join_product_waitlist(uuid, uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'join_product_waitlist lost its authenticated grant';
  END IF;

  IF has_function_privilege('anon', 'public.join_product_waitlist(uuid, uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE join_product_waitlist — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_product lost its authenticated grant — it is SECURITY INVOKER and the admin calls it directly';
  END IF;

  IF has_function_privilege('anon', 'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'anon can EXECUTE a product writer — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'update_product lost its authenticated grant';
  END IF;
END
$assert$;
