-- A municipality club names the customer it is invoiced to.
--
-- WHAT THIS IS FOR
--
-- The CFO raises each month's municipality invoices in Fennoa by importing one
-- Finvoice 3.0 XML file per Fennoa customer. Fennoa matches the buyer on
-- `BuyerPartyIdentifier` against that customer's own Fennoa customer number
-- (F0037 and the like), and the import demands a buyer postal address inside
-- the file even though the customer card in Fennoa already holds one. Fennoa
-- assigns the invoice number itself on send, so nothing about the export is
-- stateful: it is a pure function of the month and of the rows this migration
-- adds.
--
-- WHY THE BUYER IS A CUSTOMER AND NOT A MUNICIPALITY
--
-- Established with the CFO on 2026-09-15, and it is the whole reason this is a
-- table of its own rather than a few columns on `locations`:
--
--   * Tampere is TWO customers. Library clubs are billed to one Fennoa
--     customer and school clubs to another, because two departments of one city
--     buy them under two agreements.
--   * An association can be the customer. Folkhälsan buys clubs that run in
--     Espoo, so the buyer is not even in the municipality the club sits in.
--
-- So the link is per CLUB, never per municipality, and no arithmetic anywhere
-- may derive one from the other.
--
-- WHY IT NEVER REFERENCES `locations`
--
-- Owner rule: location data is GEOGRAPHY and has to keep working for every
-- country we ever operate in; invoicing data is FINNISH CONTRACT data. Coupling
-- the two would make a Finnish billing arrangement a property of the world map,
-- and the first non-Finnish site would then carry columns that mean nothing.
-- The tables are deliberately unjoined: `invoice_customers` holds its own
-- address, and the only edge between the two systems is `products`, which
-- points at a place and at a customer independently.
--
-- WHAT THE CFO NEEDS PER CUSTOMER, AND WHAT SHE DOES NOT
--
-- Stored here: the Fennoa customer number, the invoice name, the postal address
-- (street, postal code, city, country), an optional "your reference" (a PO
-- number or a contact person) and optional extra invoice text. Payment terms,
-- e-invoice routing addresses and department names stay on the Fennoa customer
-- card, because Fennoa owns them and a second copy here would be a second
-- answer nobody keeps current.
--
-- OPTIONAL AT CREATION, REFUSED AT INVOICING
--
-- The link is nullable, exactly like the municipality fee beside it: a club is
-- created before anybody has agreed who pays for it. The refusal lives where
-- the invoice is raised — the invoicing page flags a club with no customer and
-- blocks its file — rather than in a NOT NULL that would stop an admin saving a
-- club at all. This migration ships the database half; the picker and the
-- export land behind it.

-- ---------------------------------------------------------------------------
-- 1. The customers
-- ---------------------------------------------------------------------------

CREATE TABLE public.invoice_customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fennoa_customer_no  text NOT NULL,
  invoice_name        text NOT NULL,
  street              text NOT NULL,
  postal_code         text NOT NULL,
  city                text NOT NULL,
  country_code        text NOT NULL DEFAULT 'FI',
  your_reference      text,
  invoice_text        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoice_customers_fennoa_customer_no_key
    UNIQUE (fennoa_customer_no),
  -- Every required field is checked for a TRIMMED non-empty value, not merely
  -- for NOT NULL. An address line of three spaces satisfies NOT NULL and
  -- produces a Finvoice file Fennoa accepts and a human cannot post a letter
  -- to, which is the failure this class of CHECK exists to make impossible.
  CONSTRAINT chk_invoice_customers_fennoa_customer_no_present
    CHECK (btrim(fennoa_customer_no) <> ''),
  CONSTRAINT chk_invoice_customers_invoice_name_present
    CHECK (btrim(invoice_name) <> ''),
  CONSTRAINT chk_invoice_customers_street_present
    CHECK (btrim(street) <> ''),
  CONSTRAINT chk_invoice_customers_postal_code_present
    CHECK (btrim(postal_code) <> ''),
  CONSTRAINT chk_invoice_customers_city_present
    CHECK (btrim(city) <> ''),
  -- ISO 3166-1 alpha-2, uppercase. The shape only: which countries we bill in
  -- is contract data that changes as agreements land, so an enum or an FK here
  -- would need a migration per country and would turn an already-stored code
  -- into a violation the day one was dropped.
  CONSTRAINT chk_invoice_customers_country_code_shape
    CHECK (country_code ~ '^[A-Z]{2}$'),
  -- The two optional fields are ABSENT or real — never a blank string. "No
  -- reference" and "a reference of one space" would otherwise be two states the
  -- serializer has to tell apart, and only one of them is expressible in the UI.
  CONSTRAINT chk_invoice_customers_your_reference_present_if_set
    CHECK (your_reference IS NULL OR btrim(your_reference) <> ''),
  CONSTRAINT chk_invoice_customers_invoice_text_present_if_set
    CHECK (invoice_text IS NULL OR btrim(invoice_text) <> '')
);

COMMENT ON TABLE public.invoice_customers IS
  'One row per FENNOA CUSTOMER School of Gaming invoices for municipality '
  'clubs — the buyer a Finvoice 3.0 file is addressed to, matched by Fennoa on '
  'fennoa_customer_no. A buyer is a CUSTOMER and not a municipality: one city '
  'can be two customers (library clubs and school clubs bought by two '
  'departments under two agreements) and an association can be the customer for '
  'clubs running inside a municipality it is not. So the link is per CLUB — '
  'products.invoice_customer_id — and nothing may derive one from a club''s '
  'location. THIS TABLE NEVER REFERENCES `locations`, by owner rule: location '
  'data is geography and has to work for every country we operate in, while '
  'this is Finnish contract data, so the customer carries its own postal '
  'address rather than pointing at a place. What lives here is only what the '
  'FILE needs: the customer number, the invoice name, the address, an optional '
  '"your reference" (a PO number or a contact) and optional extra invoice text. '
  'Payment terms, e-invoice routing and department names stay on the Fennoa '
  'customer card, which owns them. Admin-only end to end: SELECT for '
  'authenticated behind an admin policy, and no write grant at all — the only '
  'writers are create_invoice_customer and update_invoice_customer. No delete '
  'in v1: a customer a club points at cannot go anyway, because that foreign '
  'key is ON DELETE RESTRICT.';

COMMENT ON COLUMN public.invoice_customers.fennoa_customer_no IS
  'The customer''s number in Fennoa, e.g. F0037. This is the join key between '
  'the exported file and Fennoa''s own ledger: it is written into '
  'BuyerPartyIdentifier and is how the import finds the buyer. UNIQUE, because '
  'two rows claiming one Fennoa customer would produce two files Fennoa would '
  'post to the same account with no way to tell which was meant.';

COMMENT ON COLUMN public.invoice_customers.invoice_name IS
  'The buyer''s name as it must read on the invoice — the legal or agreed '
  'billing name, which is not always the name anybody says out loud. Stored '
  'rather than derived from a municipality''s name for exactly that reason, and '
  'because a customer may be an association with no municipality name to derive '
  'from.';

COMMENT ON COLUMN public.invoice_customers.street IS
  'The buyer''s street address. Required even though Fennoa''s own customer card '
  'holds one, because the Finvoice import demands a buyer postal address INSIDE '
  'the file — a file without it is refused.';

COMMENT ON COLUMN public.invoice_customers.postal_code IS
  'The buyer''s postal code. Free text rather than a reference to the postal '
  'code table: this is the address printed on an invoice to a buyer who may be '
  'outside Finland, and validating it against Finnish geography would refuse a '
  'correct foreign address.';

COMMENT ON COLUMN public.invoice_customers.city IS
  'The buyer''s post town. Part of the address block, and unrelated to which '
  'municipality a club runs in — a customer''s billing address and a club''s '
  'location are two different facts and are allowed to disagree.';

COMMENT ON COLUMN public.invoice_customers.country_code IS
  'ISO 3166-1 alpha-2, uppercase, defaulting to FI because every customer today '
  'is Finnish. A CHECK on the SHAPE and nothing more: which countries we bill '
  'in is contract data that moves as agreements land, so an enum would need a '
  'migration per country.';

COMMENT ON COLUMN public.invoice_customers.your_reference IS
  'The buyer''s own reference for the invoice — a purchase-order number, or the '
  'person at the customer who owns the agreement. Optional: many customers ask '
  'for none, and the serializer omits the element when there is nothing to put '
  'in it. NULL or a real value, never a blank string.';

COMMENT ON COLUMN public.invoice_customers.invoice_text IS
  'Extra free text the customer wants on every invoice, as authored lines. '
  'Optional, and NULL or real for the same reason your_reference is. Not '
  'markdown and not rendered anywhere in the app: it is copy for a Finvoice '
  'document, so it travels as typed.';

COMMENT ON COLUMN public.invoice_customers.created_at IS
  'When the customer was recorded. Server-stamped.';

COMMENT ON COLUMN public.invoice_customers.updated_at IS
  'When the customer was last edited, maintained by the '
  'invoice_customers_updated_at trigger rather than by any writer — a timestamp '
  'a caller supplies proves nothing about when the row changed.';

ALTER TABLE public.invoice_customers ENABLE ROW LEVEL SECURITY;

-- One SELECT policy and no write policy, because there is no write grant for a
-- write policy to authorize: both writers are SECURITY DEFINER and bypass RLS
-- entirely. The `(SELECT …)` wrapper makes the predicate an InitPlan evaluated
-- once per statement rather than once per row.
CREATE POLICY admins_read_invoice_customers
  ON public.invoice_customers
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- SELECT and nothing more for `authenticated`; nothing at all for `anon`,
-- because a row is a customer's billing address. `service_role` gets the full
-- set, as on every other table the DB suite asserts against through the admin
-- client.
GRANT SELECT ON TABLE public.invoice_customers TO authenticated;
GRANT ALL    ON TABLE public.invoice_customers TO service_role;

CREATE TRIGGER invoice_customers_updated_at
  BEFORE UPDATE ON public.invoice_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. The two writers
-- ---------------------------------------------------------------------------
-- Model D, the §3.3 posture: the table carries no write grant for
-- `authenticated`, so the ONLY way a browser reaches it is one of these two
-- guarded functions. Both are guard-first on assert_admin(), SECURITY DEFINER
-- with an empty search_path, and deliberately not STRICT — a STRICT function
-- skips its body on NULL input, which would skip the guard.
--
-- Both normalise before they write: every text field is trimmed, the country
-- code is upper-cased, and a blank optional field folds to NULL. The CHECKs
-- above are the backstop rather than the normaliser, so a row that arrives some
-- other way (a migration, a service-role fixture) still cannot hold a blank.
--
-- The validation below MIRRORS those CHECKs and raises `check_violation` with a
-- sentence, because the admin form shows an RPC's own message verbatim and
-- "new row violates check constraint chk_invoice_customers_city_present" is not
-- a sentence anybody can act on.

CREATE FUNCTION public.create_invoice_customer(
  p_fennoa_customer_no text,
  p_invoice_name       text,
  p_street             text,
  p_postal_code        text,
  p_city               text,
  p_country_code       text DEFAULT 'FI',
  p_your_reference     text DEFAULT NULL,
  p_invoice_text       text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_id             uuid;
  v_customer_no    text;
  v_invoice_name   text;
  v_street         text;
  v_postal_code    text;
  v_city           text;
  v_country_code   text;
  v_your_reference text;
  v_invoice_text   text;
BEGIN
  PERFORM public.assert_admin();

  v_customer_no    := btrim(COALESCE(p_fennoa_customer_no, ''));
  v_invoice_name   := btrim(COALESCE(p_invoice_name, ''));
  v_street         := btrim(COALESCE(p_street, ''));
  v_postal_code    := btrim(COALESCE(p_postal_code, ''));
  v_city           := btrim(COALESCE(p_city, ''));
  v_country_code   := upper(btrim(COALESCE(p_country_code, '')));
  v_your_reference := NULLIF(btrim(COALESCE(p_your_reference, '')), '');
  v_invoice_text   := NULLIF(btrim(COALESCE(p_invoice_text, '')), '');

  -- Written out here and again in update_invoice_customer rather than factored
  -- into a shared assertion: a private helper would be a third function in the
  -- schema that no role may call, and the two copies are the same eight lines
  -- next to each other in one file.
  IF v_customer_no = '' THEN
    RAISE EXCEPTION 'A Fennoa customer number is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice_name = '' THEN
    RAISE EXCEPTION 'An invoice name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_street = '' OR v_postal_code = '' OR v_city = '' THEN
    RAISE EXCEPTION 'A street, postal code and city are required — the Finvoice import refuses a file with no buyer address'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'The country must be a two-letter ISO 3166-1 code (got %)', v_country_code
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.invoice_customers (
    fennoa_customer_no, invoice_name, street, postal_code, city,
    country_code, your_reference, invoice_text
  )
  VALUES (
    v_customer_no, v_invoice_name, v_street, v_postal_code, v_city,
    v_country_code, v_your_reference, v_invoice_text
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_invoice_customer(text, text, text, text, text, text, text, text) IS
  'Admin-gated create of a Fennoa invoice customer, and one of the two ways any '
  'row reaches invoice_customers at all: the table carries no write grant for '
  'authenticated, so a browser''s only path in is this function. SECURITY '
  'DEFINER with an empty search_path, guard-first on assert_admin() so the '
  'authorization decision is made before an argument is read, and deliberately '
  'not STRICT — a STRICT function skips its body on NULL input and would skip '
  'the guard with it. Returns the new row''s id. Every text field is trimmed and '
  'the country code upper-cased before the write, and a blank optional field '
  'folds to NULL, so "no reference" is one state rather than two; the table''s '
  'own CHECKs are the backstop for any row arriving another way. The validation '
  'mirrors those CHECKs and raises check_violation with a readable sentence, '
  'because the admin form shows an RPC''s message verbatim and a raw constraint '
  'name is not something an admin can act on. p_country_code defaults to FI, '
  'the column''s own default and the resting state of a Finnish contract '
  'system, so an omitting caller writes FI rather than failing; p_your_reference '
  'and p_invoice_text default NULL because null is their legal empty and '
  'codegen cannot express an explicit null for a non-defaulted argument — which '
  'is why the wire schema demands both fields, so omission stays deliberate.';

REVOKE EXECUTE ON FUNCTION public.create_invoice_customer(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_invoice_customer(text, text, text, text, text, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_invoice_customer(text, text, text, text, text, text, text, text) TO service_role;

CREATE FUNCTION public.update_invoice_customer(
  p_id                 uuid,
  p_fennoa_customer_no text,
  p_invoice_name       text,
  p_street             text,
  p_postal_code        text,
  p_city               text,
  p_country_code       text DEFAULT 'FI',
  p_your_reference     text DEFAULT NULL,
  p_invoice_text       text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_customer_no    text;
  v_invoice_name   text;
  v_street         text;
  v_postal_code    text;
  v_city           text;
  v_country_code   text;
  v_your_reference text;
  v_invoice_text   text;
BEGIN
  PERFORM public.assert_admin();

  v_customer_no    := btrim(COALESCE(p_fennoa_customer_no, ''));
  v_invoice_name   := btrim(COALESCE(p_invoice_name, ''));
  v_street         := btrim(COALESCE(p_street, ''));
  v_postal_code    := btrim(COALESCE(p_postal_code, ''));
  v_city           := btrim(COALESCE(p_city, ''));
  v_country_code   := upper(btrim(COALESCE(p_country_code, '')));
  v_your_reference := NULLIF(btrim(COALESCE(p_your_reference, '')), '');
  v_invoice_text   := NULLIF(btrim(COALESCE(p_invoice_text, '')), '');

  -- The same eight lines its create sibling carries, for the reason stated
  -- there: a private validator would be a third function no role may call.
  IF v_customer_no = '' THEN
    RAISE EXCEPTION 'A Fennoa customer number is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice_name = '' THEN
    RAISE EXCEPTION 'An invoice name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_street = '' OR v_postal_code = '' OR v_city = '' THEN
    RAISE EXCEPTION 'A street, postal code and city are required — the Finvoice import refuses a file with no buyer address'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'The country must be a two-letter ISO 3166-1 code (got %)', v_country_code
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, which is why a new column
  -- has to reach this statement in the same change that adds it: a column this
  -- function does not know about is cleared by the next admin edit. Both
  -- optional fields are exactly that shape — their parameters default NULL, so
  -- an omitting caller clears them, which IS how one is cleared, and the wire
  -- schema demanding the field is what stops it happening by accident.
  UPDATE public.invoice_customers SET
    fennoa_customer_no = v_customer_no,
    invoice_name       = v_invoice_name,
    street             = v_street,
    postal_code        = v_postal_code,
    city               = v_city,
    country_code       = v_country_code,
    your_reference     = v_your_reference,
    invoice_text       = v_invoice_text
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice customer not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.update_invoice_customer(uuid, text, text, text, text, text, text, text, text) IS
  'Admin-gated edit of a Fennoa invoice customer — the second and last way a '
  'row in invoice_customers changes, because the table carries no write grant '
  'for authenticated. SECURITY DEFINER with an empty search_path, guard-first '
  'on assert_admin(), not STRICT for the reason its create sibling is not, and '
  'returns the edited row''s id. It ASSIGNS EVERY EDITABLE COLUMN on every '
  'call, so a column added later has to reach this statement in the same change '
  'or the next admin edit clears it. Both optional fields have that shape '
  'already: their parameters default NULL, so omission is how one is cleared — '
  'the only expressible way — and the wire schema demanding the field on every '
  'save is what keeps a clearing deliberate. Normalisation and validation are '
  'its create sibling''s, unchanged: trimmed text, an upper-cased country code, '
  'a blank optional field folded to NULL, and check_violation carrying a '
  'sentence. An id no customer has raises no_data_found rather than silently '
  'affecting zero rows, because an edit that changed nothing and said so is a '
  'save the admin would believe.';

REVOKE EXECUTE ON FUNCTION public.update_invoice_customer(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_invoice_customer(uuid, text, text, text, text, text, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_invoice_customer(uuid, text, text, text, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The club's own link
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN invoice_customer_id uuid
    REFERENCES public.invoice_customers(id) ON DELETE RESTRICT;

ALTER TABLE public.products
  ADD CONSTRAINT chk_products_invoice_customer_only_for_muni
    CHECK (invoice_customer_id IS NULL OR product_type = 'municipality_club');

-- Partial, like the location index beside it: the column is null on every
-- product but a municipality club, and the reads that use it ask "which clubs
-- does this customer invoice" rather than "which have none".
CREATE INDEX idx_products_invoice_customer
  ON public.products USING btree (invoice_customer_id)
  WHERE (invoice_customer_id IS NOT NULL);

COMMENT ON COLUMN public.products.invoice_customer_id IS
  'The Fennoa customer this municipality club is invoiced to, or NULL where '
  'nobody has said yet. Per CLUB rather than per municipality on purpose: one '
  'city can be two customers (library clubs and school clubs under two '
  'agreements) and an association can be the customer for clubs running in a '
  'municipality it is not, so this may NEVER be derived from location_id. '
  'Nullable and refused later, exactly like municipality_fee_cents: a club is '
  'created before anybody has agreed who pays for it, so the invoicing page is '
  'what flags a club with no customer and blocks its file. Restricted to '
  'municipality clubs by chk_products_invoice_customer_only_for_muni, the same '
  'shape the fee column carries. ON DELETE RESTRICT, which is what makes "no '
  'delete in v1" free: a customer a club points at cannot be removed. NOTE ON '
  'EXPOSURE: `products` carries a table-level SELECT grant for `anon`, so this '
  'column joins the set an unauthenticated reader can select — known and '
  'accepted by the owner for the fee columns already, and what leaks is an '
  'opaque id, since invoice_customers itself is admin-only and holds everything '
  'that would say who the customer is.';

-- ---------------------------------------------------------------------------
-- 4. Both product writers take the link
-- ---------------------------------------------------------------------------
-- A new parameter is a new signature, so each function is DROPped and recreated
-- rather than replaced — a CREATE OR REPLACE would leave the old arity standing
-- beside the new one and make every existing call ambiguous. Both bodies below
-- are the ones in supabase/schema.sql (which reflects dev; nothing on this
-- branch had touched either), with the new argument added to the INSERT and to
-- the UPDATE respectively and nothing else changed — create_product is still
-- SECURITY INVOKER with assert_admin() as its first statement, update_product
-- is still SECURITY DEFINER taking the product gate lock.
--
-- p_invoice_customer_id is DEFAULTed for exactly the reason p_tag is: null is a
-- legal value, no CHECK backstops the absence of one, and codegen cannot
-- express an explicit null for a non-defaulted argument at all — so omission is
-- how "no customer" reaches the column, and the required-nullable wire schema
-- is what keeps an omission deliberate rather than accidental.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid) RETURNS uuid
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
    location_id, is_remote, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country,
    requires_gamer_creations, invoice_customer_id
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code,
    p_location_id, p_is_remote, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country,
    -- NOT coalesced: the column is NOT NULL, so an explicit null is refused
    -- loudly rather than silently becoming false.
    p_requires_gamer_creations,
    -- The Fennoa customer (00268). Null is the ordinary state and the CHECK
    -- refuses one on any product that is not a municipality club.
    p_invoice_customer_id
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

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and, since 00210, the consent documents enrolling on it requires. Since 00256 it takes NO status: a product''s lifecycle is derived from its dates, its signup threshold and the live count of active participations, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs (00210) is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations (00227) is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. p_invoice_customer_id (00268) is defaulted on the same argument as p_tag — null is legal, nothing backstops its absence, and codegen cannot express an explicit null — and names the FENNOA CUSTOMER a municipality club is invoiced to; it is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO service_role;

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid) RETURNS uuid
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
  -- `requires_gamer_creations` (00227) obeys the same rule with one difference:
  -- its parameter defaults FALSE, not null, because the column is NOT NULL — so
  -- an omitting caller UNFLAGS the product rather than failing, which is the
  -- same "omission clears it" semantics `tag` has, and the same required wire
  -- field is what keeps it deliberate.
  -- `invoice_customer_id` (00268) is `tag`'s shape exactly: a defaulted
  -- parameter whose omission clears the club's Fennoa customer, kept deliberate
  -- by a required-nullable wire field. Editable for a club's whole life, because
  -- who buys a club can genuinely change between terms.
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
    municipality_fee_cents   = p_municipality_fee_cents,
    requires_gamer_creations = p_requires_gamer_creations,
    invoice_customer_id      = p_invoice_customer_id
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

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, the staff-only material link and — since 00210 — the set of consent documents enrolling on it requires, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone. Since 00210 p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did. Since 00227 it assigns requires_gamer_creations, whose parameter defaults FALSE rather than null because the column is NOT NULL — so an omitting caller unflags the product, the same "omission clears it" semantics tag has, kept deliberate by the required wire field. Since 00268 it assigns invoice_customer_id, the FENNOA CUSTOMER a municipality club is invoiced to — tag''s shape exactly, a defaulted parameter whose omission clears the link, kept deliberate by a required-nullable wire field, and editable for the club''s whole life because who buys a club can change between terms. It is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type.';

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The month carries each club's customer
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE from the body in supabase/schema.sql, with one added key.
-- The whole customer row rides along rather than an id, because the caller is
-- building a file out of it and a second admin-gated round trip per club would
-- buy nothing: the page already refuses to answer a month it cannot invoice.
-- Null where the club has no customer — which the invoicing page flags and the
-- export refuses, the same way an unset fee is flagged and excluded.

CREATE OR REPLACE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_clubs     jsonb;
  v_orphans   text;
BEGIN
  PERFORM public.assert_admin();

  -- The month is named by its first day and nothing else. A mid-month argument
  -- is a caller that has not decided what it is asking for — the window would
  -- be a month-long span that matches no calendar month, and every total drawn
  -- from it would be wrong in a way nobody could see. Refused loudly, after the
  -- guard, so an unauthorized caller learns nothing about the argument shape.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH RECURSIVE candidate AS (
    SELECT p.*
      FROM public.products p
     WHERE p.product_type = 'municipality_club'
       AND (
             EXISTS (
               SELECT 1
                 FROM public.product_groups g
                 JOIN public.group_sessions gs ON gs.group_id = g.id
                WHERE g.product_id = p.id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
             )
          OR (
               p.start_date IS NOT NULL
               AND p.start_date <= v_month_end
               AND (p.end_date IS NULL OR p.end_date >= p_month_start)
             )
           )
  ),
  -- The ancestor-or-self walk, one chain per candidate's own location. It
  -- stops climbing the moment it has emitted a municipality, so the shortest
  -- chain wins by construction; `depth` is kept so the DISTINCT ON below picks
  -- the nearest one even if a tree ever nests two municipalities.
  walk AS (
    SELECT l.id AS origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           0 AS depth
      FROM public.locations l
     WHERE l.id IN (
             SELECT c.location_id FROM candidate c WHERE c.location_id IS NOT NULL
           )
     UNION ALL
    SELECT w.origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           w.depth + 1
      FROM walk w
      JOIN public.locations l ON l.id = w.parent_id
     -- Two stops, and each earns its place: the first is the answer, the second
     -- is a belt-and-braces bound on a tree the schema does not forbid a cycle
     -- in beyond a row parenting itself.
     WHERE w.type <> 'municipality'
       AND w.depth < 16
  ),
  municipality AS (
    SELECT DISTINCT ON (w.origin_id)
           w.origin_id,
           w.id,
           w.name,
           w.name_i18n
      FROM walk w
     WHERE w.type = 'municipality'
     ORDER BY w.origin_id, w.depth
  )
  SELECT COALESCE(jsonb_agg(club.doc ORDER BY club.id), '[]'::jsonb)
    INTO v_clubs
    FROM (
      SELECT c.id,
             jsonb_build_object(
               'id',                     c.id,
               'timezone',               c.timezone,
               'start_date',             c.start_date,
               'end_date',               c.end_date,
               'municipality_fee_cents', c.municipality_fee_cents,
               'product_translations',   tr.items,
               'schedule_slots',         sl.items,
               'location',
                 CASE WHEN l.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        l.id,
                             'name',      l.name,
                             'name_i18n', l.name_i18n,
                             'type',      l.type
                           )
                 END,
               'municipality',
                 CASE WHEN m.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        m.id,
                             'name',      m.name,
                             'name_i18n', m.name_i18n
                           )
                 END,
               -- The buyer of this club, whole rather than by id: the caller
               -- turns it into a Finvoice file, so a second admin-gated round
               -- trip per club would buy nothing. Null where nobody has said
               -- who pays yet — flagged by the page, refused by the export.
               'invoice_customer',
                 CASE WHEN ic.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',                 ic.id,
                             'fennoa_customer_no', ic.fennoa_customer_no,
                             'invoice_name',       ic.invoice_name,
                             'street',             ic.street,
                             'postal_code',        ic.postal_code,
                             'city',               ic.city,
                             'country_code',       ic.country_code,
                             'your_reference',     ic.your_reference,
                             'invoice_text',       ic.invoice_text
                           )
                 END,
               'sessions',               se.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
        -- The link is the club's own column and never the location's: one city
        -- can be two customers, and an association can buy clubs sited in a
        -- municipality it is not.
        LEFT JOIN public.invoice_customers ic ON ic.id = c.invoice_customer_id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        -- Raw rows, one per (group, date). The page collapses two groups on one
        -- date into the single session the club is paid for, and can still say
        -- which groups met — an aggregate here would have thrown that away.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     gs.group_id,
                              'session_date', gs.session_date
                            )
                            ORDER BY gs.session_date, gs.group_id
                          )
                     FROM public.group_sessions gs
                     JOIN public.product_groups g ON g.id = gs.group_id
                    WHERE g.product_id = c.id
                      AND gs.session_date >= p_month_start
                      AND gs.session_date <= v_month_end
                 ), '[]'::jsonb) AS items
        ) se
    ) club;

  -- Every club on the invoice belongs to a municipality, or there is no invoice.
  -- A municipality club whose chain reaches no municipality cannot be billed to
  -- anybody, and the reader of this document has no way to tell such a club from
  -- one whose location was mistyped an hour ago — so the read stops and names the
  -- products, which is the whole of the repair instruction. Checked against the
  -- document that was built rather than against a second walk of the tree,
  -- because what matters is what would have been emitted.
  --
  -- A missing invoice CUSTOMER is deliberately NOT refused here, and the
  -- difference is real: a club with no municipality has nobody to bill and
  -- cannot be rendered on a page that is organised by municipality, while a club
  -- with no customer renders perfectly well and simply cannot have a file
  -- produced for it yet. Refusing the month would take every other file down
  -- with it.
  SELECT string_agg(club.value ->> 'id', ', ' ORDER BY club.value ->> 'id')
    INTO v_orphans
    FROM jsonb_array_elements(v_clubs) AS club(value)
   WHERE jsonb_typeof(club.value -> 'municipality') = 'null';

  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: no municipality is an ancestor-or-self of the location of municipality club(s) % — repoint the location so the club can be invoiced',
      v_orphans
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
    'clubs',       v_clubs
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (a term that overlaps it), each with its timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots, its own location row, the nearest ancestor-or-self location of type municipality, the FENNOA INVOICE CUSTOMER it is billed to, and every stored group_sessions row in the month as a raw (group_id, session_date) pair. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A session RAN iff a group_sessions row exists — those rows are lazily materialized when an educator records a report, note or attendance, so a row is the evidence somebody was there — and the client counts one session per club per calendar date, because a club with two groups meeting on one day ran one session. The schedule ships so the client can project what was supposed to run and flag a scheduled date with no row; a projection is never counted and never billed, and a stored row on an unscheduled date still counts. Since 00256 the candidate test is the term alone and the document carries no lifecycle column: the second arm used to demand a stored running/completed state as well, which no club ever held, so a club with no recorded session never reached the invoice and nothing was ever flagged as missed. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality. Every club in the document HAS a municipality: a club whose chain reaches none cannot be invoiced to anybody, so the whole read raises check_violation naming those product ids rather than shipping a null the caller would have to render somewhere outside every total. Since 00268 each club also carries invoice_customer — the WHOLE customer row (number, invoice name, address, optional reference and invoice text) rather than an id, because the caller turns it into a Finvoice file — or null where nobody has said who pays yet. A null customer is NOT refused, unlike a null municipality: such a club renders on the page perfectly well and only its own file is blocked, so refusing the month would take every other file down with it. The link is the club''s own column and is never derived from its location, because one city can be two customers and an association can buy clubs sited in a municipality it is not. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. Every array ships as [] rather than null.';

-- ---------------------------------------------------------------------------
-- 6. Assert the end state.
-- ---------------------------------------------------------------------------
-- Section 5 replaced get_admin_municipality_invoicing with CREATE OR REPLACE,
-- so the invariants 00257 §3 pinned for it are RE-DERIVED below from the body
-- as this file leaves it. 00257 said in so many words why that is required: a
-- superseded migration's DO block is otherwise the last place those invariants
-- were ever checked. Sections (f) and (g) of 00256's block are carried the same
-- way for create_product, widened to cover update_product, which 00256 did not.

DO $$
DECLARE
  v_src       text;
  v_key       text;
  v_fn        text;
  v_prov      "char";
  v_strict    boolean;
  v_secdef    boolean;
  v_lang      text;
  v_grantees  text;
  v_sig constant text := 'public.get_admin_municipality_invoicing(date)';
BEGIN
  -- --- (a) The table exists, with RLS on and exactly one SELECT policy. -----
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'invoice_customers'
       AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'invoice_customers was not created';
  END IF;

  IF NOT (SELECT c.relrowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'invoice_customers') THEN
    RAISE EXCEPTION 'invoice_customers does not have RLS enabled';
  END IF;

  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'invoice_customers') <> 1 THEN
    RAISE EXCEPTION
      'invoice_customers carries % policies rather than the one admin SELECT policy',
      (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'invoice_customers');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'invoice_customers'
       AND policyname = 'admins_read_invoice_customers'
       AND cmd = 'SELECT'
       AND qual LIKE '%is_admin%'
  ) THEN
    RAISE EXCEPTION 'the invoice_customers read policy is not the admin predicate';
  END IF;

  -- --- (b) Its grants are exactly SELECT for authenticated, nothing for anon.
  IF NOT has_table_privilege('authenticated', 'public.invoice_customers', 'SELECT') THEN
    RAISE EXCEPTION 'invoice_customers is not readable by authenticated';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('authenticated', 'public.invoice_customers', v_key) THEN
      RAISE EXCEPTION
        'invoice_customers grants authenticated %, which would bypass its two guarded writers',
        v_key;
    END IF;
    IF has_table_privilege('anon', 'public.invoice_customers', v_key) THEN
      RAISE EXCEPTION 'invoice_customers grants anon %', v_key;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.invoice_customers', 'SELECT') THEN
    RAISE EXCEPTION 'invoice_customers is readable by anon — a row is a billing address';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.invoice_customers', v_key) THEN
      RAISE EXCEPTION 'invoice_customers does not grant service_role %', v_key;
    END IF;
  END LOOP;

  -- --- (c) Its updated_at is maintained by a trigger, not by a writer. ------
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'invoice_customers'
       AND t.tgname = 'invoice_customers_updated_at'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'invoice_customers has no updated_at trigger';
  END IF;

  -- --- (d) Both writers are guard-first, DEFINER, not STRICT, and granted. --
  FOREACH v_fn IN ARRAY ARRAY['create_invoice_customer', 'update_invoice_customer'] LOOP
    SELECT pr.prosrc, pr.proisstrict, pr.prosecdef,
           (SELECT l.lanname FROM pg_language l WHERE l.oid = pr.prolang)
      INTO v_src, v_strict, v_secdef, v_lang
      FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname = v_fn;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% was not created', v_fn;
    END IF;

    IF v_lang <> 'plpgsql' THEN
      RAISE EXCEPTION '% is LANGUAGE % — a sql body has no first statement to guard', v_fn, v_lang;
    END IF;

    -- Guard-first in the shape the authorization spine reads: assert_admin has
    -- to precede the first thing the body does with an argument.
    IF position('PERFORM public.assert_admin();' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not call assert_admin at all', v_fn;
    END IF;

    IF position('btrim' IN v_src) = 0 THEN
      RAISE EXCEPTION '% no longer normalises its text arguments', v_fn;
    END IF;

    IF position('assert_admin' IN v_src) > position('btrim' IN v_src) THEN
      RAISE EXCEPTION '% reads an argument before it gates on assert_admin', v_fn;
    END IF;

    IF v_strict THEN
      RAISE EXCEPTION '% is STRICT — it would skip its body, and its guard, on NULL input', v_fn;
    END IF;

    IF NOT v_secdef THEN
      RAISE EXCEPTION '% is not SECURITY DEFINER — invoice_customers has no write grant to run as the caller', v_fn;
    END IF;

    -- It validates rather than leaving the CHECKs to answer in constraint names.
    IF position('check_violation' IN v_src) = 0 THEN
      RAISE EXCEPTION '% raises no check_violation — its validation is gone', v_fn;
    END IF;

    SELECT coalesce(string_agg(DISTINCT g.rolname, ', ' ORDER BY g.rolname), '(none)')
      INTO v_grantees
      FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
      CROSS JOIN LATERAL aclexplode(pr.proacl) acl
      JOIN pg_roles g ON g.oid = acl.grantee
     WHERE n.nspname = 'public'
       AND pr.proname = v_fn
       AND acl.privilege_type = 'EXECUTE'
       AND acl.grantee <> pr.proowner;

    IF v_grantees <> 'authenticated, service_role' THEN
      RAISE EXCEPTION '% is executable by % rather than authenticated, service_role', v_fn, v_grantees;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_proc pr
        JOIN pg_namespace n ON n.oid = pr.pronamespace
        CROSS JOIN LATERAL aclexplode(pr.proacl) acl
       WHERE n.nspname = 'public' AND pr.proname = v_fn AND acl.grantee = 0
    ) THEN
      RAISE EXCEPTION '% is executable by PUBLIC', v_fn;
    END IF;
  END LOOP;

  -- --- (e) The club's link: column, FK, CHECK, index. ----------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products'
       AND column_name = 'invoice_customer_id' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'products.invoice_customer_id is missing or not nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_products_invoice_customer_only_for_muni'
       AND conrelid = 'public.products'::regclass
       AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'the municipality-only CHECK on products.invoice_customer_id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.products'::regclass
       AND contype = 'f'
       AND confrelid = 'public.invoice_customers'::regclass
       -- 'r' is RESTRICT in pg_constraint.confdeltype ('a' is NO ACTION, 'c'
       -- CASCADE); anything else would let a customer a club points at go.
       AND confdeltype = 'r'
  ) THEN
    RAISE EXCEPTION
      'products has no ON DELETE RESTRICT foreign key into invoice_customers — "no delete in v1" rests on it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'products'
       AND indexname = 'idx_products_invoice_customer'
  ) THEN
    RAISE EXCEPTION 'products.invoice_customer_id has no index';
  END IF;

  -- --- (f) Both product writers take the new argument and kept their grants.
  -- 00256's own block asserted create_product's guard and its authenticated /
  -- anon grants, and 00257 added the service_role one it had missed. Both are
  -- carried here, widened to update_product, which neither file checked.
  FOREACH v_fn IN ARRAY ARRAY['create_product', 'update_product'] LOOP
    IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
         WHERE n.nspname = 'public' AND pr.proname = v_fn) <> 1 THEN
      RAISE EXCEPTION
        '% is overloaded — the drop-and-recreate left the old signature standing', v_fn;
    END IF;

    SELECT pr.prosrc INTO v_src
      FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname = v_fn;

    IF position('PERFORM public.assert_admin();' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost its admin guard', v_fn;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = v_fn
         AND 'p_invoice_customer_id' = ANY (COALESCE(pr.proargnames, ARRAY[]::text[]))
    ) THEN
      RAISE EXCEPTION '% does not take p_invoice_customer_id', v_fn;
    END IF;

    -- Non-vacuity: taking the argument is worth nothing if the body never
    -- writes it, which is precisely the failure that looks like "the new club
    -- has no customer" — the ordinary state.
    IF position('invoice_customer_id' IN v_src) = 0 THEN
      RAISE EXCEPTION '% takes p_invoice_customer_id and never writes the column', v_fn;
    END IF;

    IF NOT has_function_privilege('authenticated', (
          SELECT pr.oid FROM pg_proc pr
            JOIN pg_namespace n ON n.oid = pr.pronamespace
           WHERE n.nspname = 'public' AND pr.proname = v_fn), 'EXECUTE')
       OR NOT has_function_privilege('service_role', (
          SELECT pr.oid FROM pg_proc pr
            JOIN pg_namespace n ON n.oid = pr.pronamespace
           WHERE n.nspname = 'public' AND pr.proname = v_fn), 'EXECUTE')
       OR has_function_privilege('anon', (
          SELECT pr.oid FROM pg_proc pr
            JOIN pg_namespace n ON n.oid = pr.pronamespace
           WHERE n.nspname = 'public' AND pr.proname = v_fn), 'EXECUTE') THEN
      RAISE EXCEPTION '% does not carry the grants it had before 00268', v_fn;
    END IF;
  END LOOP;

  -- --- (g) 00257 §3's invariants for the invoicing read, re-derived. -------
  SELECT pr.prosrc, pr.provolatile, pr.proisstrict
    INTO v_src, v_prov, v_strict
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public'
     AND pr.proname = 'get_admin_municipality_invoicing';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is missing after being replaced';
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'get_admin_municipality_invoicing') <> 1 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is overloaded — a call would be ambiguous';
  END IF;

  -- Guard-first, and reachable.
  IF position('assert_admin' IN v_src) = 0
     OR position('assert_admin' IN v_src) > position('check_violation' IN v_src) THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing does not gate on assert_admin before anything else';
  END IF;

  IF v_strict THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is STRICT — its guard would be skipped on NULL input';
  END IF;

  IF v_prov <> 's' THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is not STABLE';
  END IF;

  -- The month argument is validated, not assumed.
  IF position('date_trunc(''month''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer refuses a non-first-of-month argument';
  END IF;

  -- The candidate set is both halves of the union: a recorded session in the
  -- month, or a term that overlaps it. The overlap test is spelled out clause
  -- by clause because it is the WHOLE of the second half.
  IF position('product_type = ''municipality_club''' IN v_src) = 0
     OR position('public.group_sessions' IN v_src) = 0
     OR position('p.start_date IS NOT NULL' IN v_src) = 0
     OR position('p.start_date <= v_month_end' IN v_src) = 0
     OR position('p.end_date IS NULL OR p.end_date >= p_month_start' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost half of the set of clubs a month contains';
  END IF;

  -- And it does NOT ask about a stored lifecycle column. There is no such
  -- column to read and no such emitted key, so any occurrence of the word is a
  -- body that has regressed to the read 00256 was written to stop making.
  IF position('status' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing names a stored lifecycle column — the candidate test is the term alone';
  END IF;

  -- The municipality walk, and its refusal to filter retired rows.
  IF position('w.type <> ''municipality''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost the ancestor-or-self municipality walk';
  END IF;

  IF position('retired_at' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing filters retired locations — the walk must pass through them';
  END IF;

  -- A club with no municipality stops the read.
  IF position('jsonb_typeof(club.value -> ''municipality'') = ''null''' IN v_src) = 0
     OR position('ancestor-or-self of the location of municipality club' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer refuses a club with no municipality';
  END IF;

  -- A club with no CUSTOMER does not, and that asymmetry is deliberate: the
  -- sweep names one key and must go on naming exactly one.
  IF position('jsonb_typeof(club.value -> ''invoice_customer'') = ''null''' IN v_src) <> 0 THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing refuses a month for a club with no invoice customer — only that club''s own file is blocked, never the month';
  END IF;

  -- The customer is joined from the CLUB's own column, never from its location.
  IF position('ic.id = c.invoice_customer_id' IN v_src) = 0 THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing does not resolve the invoice customer from the club''s own column';
  END IF;

  -- Every key the client contract parses. Each is checked with its trailing
  -- comma so a key is not matched inside a longer one.
  FOREACH v_key IN ARRAY ARRAY['''month_start''', '''timezone'',', '''start_date'',',
                               '''end_date'',', '''municipality_fee_cents'',',
                               '''product_translations'',', '''schedule_slots'',',
                               '''location'',', '''municipality'',',
                               '''invoice_customer'',', '''fennoa_customer_no'',',
                               '''invoice_name'',', '''street'',', '''postal_code'',',
                               '''city'',', '''country_code'',', '''your_reference'',',
                               '''invoice_text'',', '''sessions'',',
                               '''group_id'',', '''session_date'''] LOOP
    IF position(v_key IN v_src) = 0 THEN
      RAISE EXCEPTION
        'get_admin_municipality_invoicing no longer emits %, which the client parses', v_key;
    END IF;
  END LOOP;

  -- Reachable by an admin's own session, and by nobody's anon one.
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost a grant it needs';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is executable by anon';
  END IF;
END $$;
