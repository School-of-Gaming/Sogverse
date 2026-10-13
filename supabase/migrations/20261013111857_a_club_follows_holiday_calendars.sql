-- A club follows holiday calendars.
--
-- A holiday calendar is a named list of breaks — inclusive date ranges, bare
-- dates read in each product's own zone — that lasts across years. A club
-- (consumer or municipality) selects any number of calendars, and every date
-- inside one of their breaks is removed from its plan: never planned.
--
-- Anything that is nevertheless ON a holiday date — a stored session record, a
-- substitution request — counts as not running, exactly as a cancellation
-- does: frozen, hidden, not paid and not billed, and back as it was when the
-- break is removed. That falls out of the one predicate every reader and writer
-- already asks, group_session_is_cancelled, which gains a holiday arm here;
-- nothing else learns about holidays.
--
-- The calendar's name is admin-only. Each break carries a name per locale, as
-- a product carries its translations, and the readers of a club's plan (anon
-- included) see the breaks of attached calendars and their names, never a
-- calendar's own name and never an unattached calendar's breaks. Calendars
-- are not deleted — they are detached — so a product's link to one is
-- ON DELETE RESTRICT. Edits are live: changing a break changes every month it
-- touches, past ones included.


-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.holiday_calendars (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_holiday_calendars_name_present CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX holiday_calendars_name_key
  ON public.holiday_calendars (lower(btrim(name)));

COMMENT ON TABLE public.holiday_calendars IS
  'A named list of holiday breaks a club can follow — a school''s or a '
  'municipality''s term holidays, say — lasting across years. The name is the '
  'admin''s handle for it and is shown to nobody else: families read the breaks '
  'of a calendar their club follows, and each break''s own names, never this '
  'row. Admin-only: SELECT for authenticated behind an admin policy, nothing '
  'for anon, and no write grant at all — the only writers are '
  'create_holiday_calendar and update_holiday_calendar. Never deleted: a '
  'calendar a club no longer wants is detached from it, and the link from '
  'product_holiday_calendars is ON DELETE RESTRICT.';

COMMENT ON COLUMN public.holiday_calendars.name IS
  'The admin''s name for the calendar. Unique ignoring case and surrounding '
  'space, because two calendars an admin cannot tell apart in a picker are one '
  'calendar too many.';

CREATE TABLE public.holiday_breaks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id  uuid NOT NULL
               REFERENCES public.holiday_calendars (id) ON DELETE CASCADE,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_holiday_breaks_end_not_before_start
    CHECK (end_date >= start_date)
);

CREATE INDEX idx_holiday_breaks_calendar_start
  ON public.holiday_breaks (calendar_id, start_date);

COMMENT ON TABLE public.holiday_breaks IS
  'One break of a holiday calendar: every date from start_date to end_date, '
  'both inclusive, is a holiday for each club following the calendar. The '
  'dates are bare calendar dates, read in each product''s own zone, so one '
  'calendar serves clubs in different zones. Breaks of one calendar never '
  'overlap — the writers refuse it, there being no btree_gist for an exclusion '
  'constraint — while breaks of two calendars may, and a club following both '
  'is off on their union. No length limit, by owner decision. Readable by '
  'anyone, anon included, for a calendar some product follows, and by an admin '
  'for every calendar: planned_session_dates reads them as its caller, and the '
  'dates a club does not meet are as public as the dates it does. No write '
  'grant; written only by the calendar writers.';

CREATE TABLE public.holiday_break_translations (
  break_id    uuid NOT NULL
              REFERENCES public.holiday_breaks (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT holiday_break_translations_pkey PRIMARY KEY (break_id, locale),
  CONSTRAINT chk_holiday_break_translations_name_present
    CHECK (btrim(name) <> '')
);

COMMENT ON TABLE public.holiday_break_translations IS
  'A holiday break''s name in one locale — "Autumn break", "Syysloma" — one row '
  'per break per locale, as product_translations is for a product. Every break '
  'has at least one: the writers refuse a break with none. Readable exactly '
  'where its break is.';

CREATE TABLE public.product_holiday_calendars (
  product_id   uuid NOT NULL
               REFERENCES public.products (id) ON DELETE CASCADE,
  calendar_id  uuid NOT NULL
               REFERENCES public.holiday_calendars (id) ON DELETE RESTRICT,

  CONSTRAINT product_holiday_calendars_pkey PRIMARY KEY (product_id, calendar_id)
);

CREATE INDEX idx_product_holiday_calendars_calendar
  ON public.product_holiday_calendars (calendar_id);

COMMENT ON TABLE public.product_holiday_calendars IS
  'The holiday calendars a club follows: every date inside one of their breaks '
  'is missing from the club''s plan. Clubs only — consumer_club and '
  'municipality_club; a camp or an event has its own dates — which '
  'set_product_holiday_calendars enforces. Written only by that function, which '
  'create_product and update_product both call; no Data API role holds a write '
  'grant. Readable through the product''s own read predicate, exactly as '
  'product_required_consents is, because the plan reads it as its caller. '
  'ON DELETE CASCADE from products; ON DELETE RESTRICT from holiday_calendars, '
  'so a calendar a club follows cannot go out from under it.';


-- ---------------------------------------------------------------------------
-- 2. Who reads them
-- ---------------------------------------------------------------------------
-- No write policy anywhere, because there is no write grant for one to
-- authorize: every writer below is SECURITY DEFINER. The admin arms are
-- policies of their own, TO authenticated, rather than an OR inside the shared
-- policy: anon holds no EXECUTE on is_admin().

ALTER TABLE public.holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_break_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_holiday_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_holiday_calendars
  ON public.holiday_calendars
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY read_product_holiday_calendars_via_product
  ON public.product_holiday_calendars
  FOR SELECT
  TO anon, authenticated
  USING (public.can_read_product(product_id));

CREATE POLICY read_holiday_breaks_of_followed_calendars
  ON public.holiday_breaks
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.product_holiday_calendars phc
       WHERE phc.calendar_id = holiday_breaks.calendar_id
    )
  );

CREATE POLICY admins_read_holiday_breaks
  ON public.holiday_breaks
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY read_holiday_break_translations_of_followed_calendars
  ON public.holiday_break_translations
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.holiday_breaks b
        JOIN public.product_holiday_calendars phc
          ON phc.calendar_id = b.calendar_id
       WHERE b.id = holiday_break_translations.break_id
    )
  );

CREATE POLICY admins_read_holiday_break_translations
  ON public.holiday_break_translations
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.holiday_calendars TO authenticated;
GRANT ALL    ON TABLE public.holiday_calendars TO service_role;

GRANT SELECT ON TABLE public.holiday_breaks TO anon;
GRANT SELECT ON TABLE public.holiday_breaks TO authenticated;
GRANT ALL    ON TABLE public.holiday_breaks TO service_role;

GRANT SELECT ON TABLE public.holiday_break_translations TO anon;
GRANT SELECT ON TABLE public.holiday_break_translations TO authenticated;
GRANT ALL    ON TABLE public.holiday_break_translations TO service_role;

GRANT SELECT ON TABLE public.product_holiday_calendars TO anon;
GRANT SELECT ON TABLE public.product_holiday_calendars TO authenticated;
GRANT ALL    ON TABLE public.product_holiday_calendars TO service_role;

CREATE TRIGGER holiday_calendars_updated_at
  BEFORE UPDATE ON public.holiday_calendars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER holiday_breaks_updated_at
  BEFORE UPDATE ON public.holiday_breaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER holiday_break_translations_updated_at
  BEFORE UPDATE ON public.holiday_break_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON FUNCTION public.can_read_product(uuid) IS 'Read predicate behind the products SELECT policy and the seven satellite tables that defer to it: translations, prices, schedule slots, marketing consents, gamer photo consents, required consents, holiday calendars. True for ANY product that exists; false only for an id no product has. Every product is readable by direct link forever, by owner decision (2026-09-15): a parent following a link to a term that ended should land on the product''s page and read that it is over, with the product''s own picture in the link preview, rather than meet a not-found page and the site''s default card — and the crawler that renders that preview holds no session either. is_visible governs LISTING alone — the browse queries apply it, alongside their own date filters — so a finished or unlisted product is absent from the shop and present at its URL. Whether a place can be BOUGHT is decided somewhere else entirely: the term dates, the seat cap and the registration window. The former arms — an admin, a party to an active or waitlisted participation, an assigned gedu, and the term test that used to bound the public one — are removed rather than left dormant: with the public answer true for every product none of them could decide anything, and a security predicate whose branches cannot decide is one the next reader has to reason about for nothing. It remains a function rather than a USING (true) written into each policy, so those eight policies keep ONE predicate to tighten if the decision is ever revisited, and it remains SECURITY DEFINER because it runs inside the products SELECT policy and must not depend on the caller''s own RLS. Wrapped in COALESCE so it answers a total boolean whatever a future arm returns.';


-- ---------------------------------------------------------------------------
-- 3. The calendar writers
-- ---------------------------------------------------------------------------
-- The §3.3 posture invoice_customers has: no table carries a write grant, so a
-- browser's only way in is one of these guarded functions. Both are
-- guard-first on assert_admin(), SECURITY DEFINER with an empty search_path,
-- and deliberately not STRICT — a STRICT function skips its body on NULL input,
-- which would skip the guard.
--
-- A save carries the calendar whole: its name and every break it should hold
-- afterwards, each `{id, start_date, end_date, names: [{locale, name}]}`. A
-- break with an id is that stored break, edited; one without is new; a stored
-- break the payload leaves out is deleted. Everything is validated before
-- anything is written, and every refusal is a check_violation carrying a
-- sentence, because the admin form shows an RPC's message verbatim.

CREATE FUNCTION public.save_holiday_calendar(
  p_id     uuid,
  p_name   text,
  p_breaks jsonb
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
DECLARE
  v_id     uuid := p_id;
  v_name   text := btrim(COALESCE(p_name, ''));
  v_breaks jsonb := COALESCE(p_breaks, '[]'::jsonb);
  v_clash  record;
  v_entry  record;
  v_break  uuid;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'A calendar needs a name'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
       SELECT 1
         FROM public.holiday_calendars c
        WHERE lower(btrim(c.name)) = lower(v_name)
          AND c.id IS DISTINCT FROM p_id
     ) THEN
    RAISE EXCEPTION 'Another calendar is already called "%"', v_name
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(v_breaks) <> 'array' THEN
    RAISE EXCEPTION 'The breaks must be a list'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The payload as rows, once, so every check below reads the same values.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.holiday_calendar_payload (
    ordinal    integer,
    break_id   uuid,
    start_date date,
    end_date   date,
    names      jsonb
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.holiday_calendar_payload;

  INSERT INTO pg_temp.holiday_calendar_payload
  SELECT e.ordinal,
         NULLIF(e.value->>'id', '')::uuid,
         NULLIF(e.value->>'start_date', '')::date,
         NULLIF(e.value->>'end_date', '')::date,
         COALESCE(e.value->'names', '[]'::jsonb)
    FROM jsonb_array_elements(v_breaks) WITH ORDINALITY AS e(value, ordinal);

  FOR v_entry IN SELECT * FROM pg_temp.holiday_calendar_payload ORDER BY ordinal
  LOOP
    IF v_entry.start_date IS NULL OR v_entry.end_date IS NULL THEN
      RAISE EXCEPTION 'Every break needs a first and a last day'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_entry.end_date < v_entry.start_date THEN
      RAISE EXCEPTION 'A break cannot end (%) before it begins (%)',
                      v_entry.end_date, v_entry.start_date
        USING ERRCODE = 'check_violation';
    END IF;

    IF jsonb_typeof(v_entry.names) <> 'array'
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_entry.names)) THEN
      RAISE EXCEPTION 'The break from % to % needs a name in at least one language',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
         SELECT 1
           FROM jsonb_array_elements(v_entry.names) AS n(value)
          WHERE btrim(COALESCE(n.value->>'locale', '')) = ''
             OR btrim(COALESCE(n.value->>'name', '')) = ''
       ) THEN
      RAISE EXCEPTION 'A name of the break from % to % is blank, or has no language',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
         SELECT 1
           FROM jsonb_array_elements(v_entry.names) AS n(value)
          GROUP BY btrim(n.value->>'locale')
         HAVING count(*) > 1
       ) THEN
      RAISE EXCEPTION 'The break from % to % has two names in one language',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;

    -- A stored break is edited only by its own calendar's save: an id from
    -- another calendar, or one no break has, is refused rather than moved or
    -- recreated.
    IF v_entry.break_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.holiday_breaks b
              WHERE b.id          = v_entry.break_id
                AND b.calendar_id = v_id
           ) THEN
      RAISE EXCEPTION 'The break from % to % is not one of this calendar''s breaks',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF EXISTS (
       SELECT 1
         FROM pg_temp.holiday_calendar_payload
        WHERE break_id IS NOT NULL
        GROUP BY break_id
       HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'A break appears twice in the list'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The payload is the calendar's whole set of breaks afterwards, so checking
  -- it against itself is checking the calendar.
  SELECT a.start_date AS a_start, a.end_date AS a_end,
         b.start_date AS b_start, b.end_date AS b_end
    INTO v_clash
    FROM pg_temp.holiday_calendar_payload a
    JOIN pg_temp.holiday_calendar_payload b
      ON a.ordinal < b.ordinal
     AND a.start_date <= b.end_date
     AND b.start_date <= a.end_date
   ORDER BY a.ordinal, b.ordinal
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'The breaks from % to % and from % to % overlap',
                    v_clash.a_start, v_clash.a_end, v_clash.b_start, v_clash.b_end
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validated; now written.
  IF v_id IS NULL THEN
    INSERT INTO public.holiday_calendars (name)
    VALUES (v_name)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.holiday_calendars
       SET name = v_name
     WHERE id = v_id;
  END IF;

  DELETE FROM public.holiday_breaks b
   WHERE b.calendar_id = v_id
     AND NOT EXISTS (
           SELECT 1
             FROM pg_temp.holiday_calendar_payload e
            WHERE e.break_id = b.id
         );

  FOR v_entry IN SELECT * FROM pg_temp.holiday_calendar_payload ORDER BY ordinal
  LOOP
    IF v_entry.break_id IS NULL THEN
      INSERT INTO public.holiday_breaks (calendar_id, start_date, end_date)
      VALUES (v_id, v_entry.start_date, v_entry.end_date)
      RETURNING id INTO v_break;
    ELSE
      v_break := v_entry.break_id;
      UPDATE public.holiday_breaks
         SET start_date = v_entry.start_date,
             end_date   = v_entry.end_date
       WHERE id = v_break
         AND (start_date, end_date)
             IS DISTINCT FROM (v_entry.start_date, v_entry.end_date);
    END IF;

    -- The names are replaced: the payload's set, and nothing else.
    INSERT INTO public.holiday_break_translations (break_id, locale, name)
    SELECT v_break, btrim(n.value->>'locale'), btrim(n.value->>'name')
      FROM jsonb_array_elements(v_entry.names) AS n(value)
    ON CONFLICT (break_id, locale) DO UPDATE
      SET name = EXCLUDED.name
      WHERE holiday_break_translations.name IS DISTINCT FROM EXCLUDED.name;

    DELETE FROM public.holiday_break_translations t
     WHERE t.break_id = v_break
       AND NOT EXISTS (
             SELECT 1
               FROM jsonb_array_elements(v_entry.names) AS n(value)
              WHERE btrim(n.value->>'locale') = t.locale
           );
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.save_holiday_calendar(uuid, text, jsonb) IS
  'Internal: the body both calendar writers share — validate a whole calendar '
  '(its name, and every break it should hold afterwards), then write it. NULL '
  'p_id creates; otherwise that calendar is edited, and its caller has already '
  'checked it exists and locked it. A break with an id is that stored break, '
  'its dates updated only when they changed; one without is inserted; a stored '
  'break missing from the payload is deleted; each break''s names are replaced '
  'by the payload''s. Refuses with a check_violation sentence: a blank or '
  'taken name, a break with a missing day, ending before it begins, with no '
  'name or a blank one or two in one language, an id that is not one of this '
  'calendar''s breaks or appears twice, and two breaks of the calendar that '
  'overlap. Makes no role test and is granted to nobody: '
  'create_holiday_calendar and update_holiday_calendar are its only callers, '
  'and each guards first.';

REVOKE EXECUTE ON FUNCTION public.save_holiday_calendar(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_holiday_calendar(
  p_name   text,
  p_breaks jsonb
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN public.save_holiday_calendar(NULL, p_name, p_breaks);
END;
$$;

COMMENT ON FUNCTION public.create_holiday_calendar(text, jsonb) IS
  'Admin-gated create of a holiday calendar with its breaks, each '
  '{id: null, start_date, end_date, names: [{locale, name}]}; returns the new '
  'calendar''s id. One of the two ways a row reaches holiday_calendars, '
  'holiday_breaks or holiday_break_translations: none carries a write grant. '
  'SECURITY DEFINER with an empty search_path, guard-first on assert_admin(), '
  'not STRICT so a NULL argument cannot skip the guard. The validation and the '
  'write are save_holiday_calendar''s; a break carrying an id is refused here, '
  'since a new calendar has no breaks of its own yet.';

REVOKE EXECUTE ON FUNCTION public.create_holiday_calendar(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_holiday_calendar(text, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_holiday_calendar(text, jsonb) TO service_role;

CREATE FUNCTION public.update_holiday_calendar(
  p_id     uuid,
  p_name   text,
  p_breaks jsonb
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  -- Two saves of one calendar serialize here, so each validates the breaks
  -- the other left rather than the ones it read before.
  PERFORM 1 FROM public.holiday_calendars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday calendar not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.save_holiday_calendar(p_id, p_name, p_breaks);
END;
$$;

COMMENT ON FUNCTION public.update_holiday_calendar(uuid, text, jsonb) IS
  'Admin-gated save of a holiday calendar whole: its name and every break it '
  'holds afterwards. A break with an id is that stored break, edited (its '
  'dates only when they changed); one without is new; a stored break the '
  'payload leaves out is deleted; each break''s names are replaced. An id '
  'belonging to another calendar is refused. The edit is live: every club '
  'following the calendar gains or loses the dates at once, in past months as '
  'in future ones, and whatever is stored on a date that becomes a holiday '
  'counts as not running until the date stops being one. Locks the calendar '
  'row, so concurrent saves serialize. An id no calendar has raises '
  'no_data_found. SECURITY DEFINER, guard-first on assert_admin(), not STRICT; '
  'the validation and the write are save_holiday_calendar''s.';

REVOKE EXECUTE ON FUNCTION public.update_holiday_calendar(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_holiday_calendar(uuid, text, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_holiday_calendar(uuid, text, jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. Which calendars a club follows
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_product_holiday_calendars(
  p_product_id   uuid,
  p_calendar_ids uuid[]
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_product_type public.product_type;
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused for the reason set_product_required_consents
  -- refuses one: the replacing DELETE below would otherwise quietly become a
  -- merge. NULL as the whole array means "follows none".
  IF EXISTS (SELECT 1 FROM unnest(p_calendar_ids) AS c WHERE c IS NULL) THEN
    RAISE EXCEPTION
      'the holiday calendar list contains a NULL entry, which is not a calendar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(cardinality(p_calendar_ids), 0) > 0 THEN
    SELECT p.product_type INTO v_product_type
      FROM public.products p
     WHERE p.id = p_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found'
        USING ERRCODE = 'no_data_found';
    END IF;
    IF v_product_type NOT IN ('consumer_club', 'municipality_club') THEN
      RAISE EXCEPTION 'Only a club follows holiday calendars — a camp or an event keeps its own dates'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  DELETE FROM public.product_holiday_calendars phc
   WHERE phc.product_id = p_product_id
     AND NOT EXISTS (
           SELECT 1
             FROM unnest(COALESCE(p_calendar_ids, ARRAY[]::uuid[])) AS c
            WHERE c = phc.calendar_id
         );

  -- An unknown calendar is refused by the foreign key.
  IF COALESCE(cardinality(p_calendar_ids), 0) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_product_id, c
      FROM unnest(p_calendar_ids) AS c
    ON CONFLICT (product_id, calendar_id) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_product_holiday_calendars(uuid, uuid[]) IS
  'Replace the set of holiday calendars a club follows, admin-only and '
  'guard-first on assert_admin. The only writer of product_holiday_calendars — '
  'no Data API role holds a write grant — and what create_product and '
  'update_product both call. NULL and an empty array both mean "follows none", '
  'which is how the set is cleared. A non-empty set on a product that is not a '
  'club (consumer_club or municipality_club) is refused with check_violation, '
  'and on a product that does not exist with no_data_found; an unknown '
  'calendar is refused by the foreign key. A NULL element is refused with '
  'check_violation, and the replacing DELETE is a two-valued NOT EXISTS, as in '
  'set_product_required_consents.';

REVOKE EXECUTE ON FUNCTION public.set_product_holiday_calendars(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_product_holiday_calendars(uuid, uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_product_holiday_calendars(uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The product writers take the calendars
-- ---------------------------------------------------------------------------
-- Both are dropped and recreated from their current bodies with one more
-- defaulted argument, handed to set_product_holiday_calendars beside the
-- consents. A new signature carries no privileges, so every grant is issued
-- again.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[]) RETURNS uuid
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

  -- image_path is absent from this INSERT on purpose: a product's
  -- picture is the catalogue entry it points at, the route writes image_id in
  -- its own statement after this one, and the trigger on products derives the
  -- served path from it.
  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code,
    location_id, is_remote,
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
    p_location_id, p_is_remote,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country,
    -- NOT coalesced: the column is NOT NULL, so an explicit null is refused
    -- loudly rather than silently becoming false.
    p_requires_gamer_creations,
    -- The Fennoa customer. Null is the ordinary state and the CHECK
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

  -- The enrolment conditions. Delegated rather than written inline
  -- because this function is SECURITY INVOKER and product_required_consents
  -- carries no write grant for `authenticated` — the guarded DEFINER writer is
  -- what makes that possible. Unconditional: NULL means "requires nothing",
  -- which on a create is the same as doing nothing, and calling it anyway keeps
  -- this function and update_product reading identically.
  PERFORM public.set_product_required_consents(v_product_id, p_required_consent_slugs);

  -- The holiday calendars the club follows, through that join table's single
  -- guarded writer for the reason the consents above go through theirs. NULL
  -- follows none; a non-empty set on a camp or an event is refused there.
  PERFORM public.set_product_holiday_calendars(v_product_id, p_holiday_calendar_ids);

  RETURN v_product_id;
END;
$$;

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and the consent documents enrolling on it requires. It takes NO status: a product''s lifecycle is derived from its dates, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. p_start_date is defaulted like every other optional argument, but the column behind it is NOT NULL — an omitting caller is refused by the column rather than creating a product with no day it begins. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. p_invoice_customer_id is defaulted on the same argument as p_tag — null is legal, nothing backstops its absence, and codegen cannot express an explicit null — and names the FENNOA CUSTOMER a municipality club is invoiced to; it is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. This function does NOT take a picture: a product''s picture is the catalogue_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table. p_holiday_calendar_ids names the holiday calendars a club follows and is NOT written inline either: it goes through set_product_holiday_calendars, product_holiday_calendars'' single guarded writer, which refuses a non-empty set on a product that is not a club. NULL, the default, follows none.';

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) TO service_role;

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false, p_invoice_customer_id uuid DEFAULT NULL::uuid, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[]) RETURNS uuid
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
  -- case that shows why the rule needs stating: its parameter is defaulted, so
  -- an omitting caller clears the tag silently and legally. That is the
  -- intended way to clear one; what stops it happening by accident is the wire
  -- schema demanding the field on every update.
  -- `region_lock_country` is the same shape for the same reasons, and a region
  -- lock is editable for a product's whole life on purpose: it gates future
  -- enrolments only and never revisits an existing seat.
  -- `requires_gamer_creations` obeys the same rule with one difference: its
  -- parameter defaults FALSE, not null, because the column is NOT NULL — so an
  -- omitting caller UNFLAGS the product rather than failing, which is the same
  -- "omission clears it" semantics `tag` has, and the same required wire field
  -- is what keeps it deliberate.
  -- `invoice_customer_id` is `tag`'s shape exactly: a defaulted parameter whose
  -- omission clears the club's Fennoa customer, kept deliberate by a
  -- required-nullable wire field. Editable for a club's whole life, because who
  -- buys a club can genuinely change between terms.
  --
  -- `start_date` is the one editable column omission cannot clear: the column
  -- is NOT NULL, so an omitting caller is refused by the column rather than
  -- quietly blanking the date on a club that is already running.
  --
  -- `image_path` is the one editable-looking column this statement must NOT
  -- name: it is derived from image_id by trg_products_apply_image_path, which
  -- runs on this very UPDATE, so assigning it here would only ever write a
  -- value the trigger overwrote a moment later.
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
  -- (a family_subscriptions row with status <> 'cancelled'; a dunning-dead one
  -- is not live and does not protect the row).
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

  -- product_required_consents — wipe and replace, through the join
  -- table's single guarded writer. NULL clears the set, which is the only
  -- expressible way to clear one and is why the wire schema demands the field
  -- on every update. Existing consent_acceptances are untouched: dropping a
  -- requirement changes what FUTURE enrolments must agree to and says nothing
  -- about what past ones did agree to.
  PERFORM public.set_product_required_consents(p_id, p_required_consent_slugs);

  -- The holiday calendars the club follows — replaced through that join
  -- table's single guarded writer. NULL clears the set, the consents' shape
  -- exactly, so the wire schema demands the field on every update.
  PERFORM public.set_product_holiday_calendars(p_id, p_holiday_calendar_ids);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) IS 'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, the staff-only material link and the set of consent documents enrolling on it requires, under the product gate lock. It also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so a queue left stranded on a product whose waitlist is already off is cleared by the next save. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'') is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. It assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. It also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. It assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. start_date is the one editable column omission CANNOT clear: it is NOT NULL, so an omitting caller is refused by the column rather than quietly blanking the date on a live product. It does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so an assignment here would be overwritten a moment later. p_spoken_language_code is public.spoken_language, an enum rather than a text key into a reference table. p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did. It assigns requires_gamer_creations, whose parameter defaults FALSE rather than null because the column is NOT NULL — so an omitting caller unflags the product, the same "omission clears it" semantics tag has, kept deliberate by the required wire field. It assigns invoice_customer_id, the FENNOA CUSTOMER a municipality club is invoiced to — tag''s shape exactly, a defaulted parameter whose omission clears the link, kept deliberate by a required-nullable wire field, and editable for the club''s whole life because who buys a club can change between terms. It is per club and never derived from a location, and chk_products_invoice_customer_only_for_muni refuses one on any other product type. p_holiday_calendar_ids replaces the set of holiday calendars the club follows through set_product_holiday_calendars — NULL clears it, the shape p_required_consent_slugs has, kept deliberate by a required wire field. The plan follows at once, past months included.';

REVOKE EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean, uuid, uuid[]) TO service_role;


-- ---------------------------------------------------------------------------
-- 6. The plan leaves the holidays out
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.product_holiday_breaks(
  p_product_id uuid,
  p_from       date,
  p_to         date
) RETURNS TABLE(break_id uuid, calendar_id uuid, start_date date, end_date date)
  LANGUAGE sql STABLE
  SET search_path TO ''
  AS $$
  SELECT b.id, b.calendar_id, b.start_date, b.end_date
    FROM public.product_holiday_calendars phc
    JOIN public.holiday_breaks b ON b.calendar_id = phc.calendar_id
   WHERE phc.product_id = p_product_id
     AND b.start_date  <= p_to
     AND b.end_date    >= p_from
   ORDER BY b.start_date, b.id;
$$;

COMMENT ON FUNCTION public.product_holiday_breaks(uuid, date, date) IS
  'The breaks of every holiday calendar the product follows that touch '
  '[p_from, p_to], both ends inclusive, ordered by first day then id. Breaks '
  'of two calendars may overlap, and both are returned. No rows when either '
  'bound is NULL. SECURITY INVOKER over product_holiday_calendars and '
  'holiday_breaks, whose read policies admit every followed calendar''s breaks '
  'to anon and authenticated alike, so it answers every caller identically — '
  'which is what lets planned_session_dates stay INVOKER and identical too.';

REVOKE EXECUTE ON FUNCTION public.product_holiday_breaks(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.product_holiday_breaks(uuid, date, date) TO anon;
GRANT  EXECUTE ON FUNCTION public.product_holiday_breaks(uuid, date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.product_holiday_breaks(uuid, date, date) TO service_role;

-- A new argument and a new return column are a new signature: the old one is
-- dropped and the grants issued again. Every SQL caller selects the columns it
-- needs by name and passes three arguments, so each resolves to this one.
DROP FUNCTION public.planned_session_dates(uuid, date, date);

CREATE FUNCTION public.planned_session_dates(
  p_product_id       uuid,
  p_from             date,
  p_to               date,
  p_include_holidays boolean DEFAULT false
) RETURNS TABLE(session_date date, starts_at timestamp with time zone, ends_at timestamp with time zone, holiday_break_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- The product's breaks over the span, read once.
  WITH breaks AS (
    SELECT hb.break_id, hb.start_date, hb.end_date
      FROM public.product_holiday_breaks(p_product_id, p_from, p_to) AS hb
  )
  SELECT span.first_day + step.n AS session_date,
         -- `timestamp AT TIME ZONE zone` resolves a wall-clock time in that
         -- zone to the correct instant, so this is DST-correct without any
         -- arithmetic of our own. Adding the duration to the INSTANT (not to
         -- the wall clock) keeps a session that straddles a transition the
         -- right length.
         ((span.first_day + step.n) + s.start_time) AT TIME ZONE p.timezone AS starts_at,
         ((span.first_day + step.n) + s.start_time) AT TIME ZONE p.timezone
           + make_interval(mins => s.duration_minutes) AS ends_at,
         holiday.break_id AS holiday_break_id
    FROM public.products p
         -- The requested span clipped to the term, both ends inclusive. An
         -- open-ended product's term has no end, so the span's own end stands.
   CROSS JOIN LATERAL (
         SELECT LEAST(p_to, COALESCE(p.end_date, p_to))       AS last_day
         ) AS term_end
         -- At most the 3661 days ending at last_day: anon can call this, and
         -- ten years is past any term while bounding what one call can ask
         -- for. The clamp moves the START, so a span reaching back to the
         -- start_date of a product older than that loses its oldest dates,
         -- never its newest.
   CROSS JOIN LATERAL (
         SELECT GREATEST(p_from, p.start_date, term_end.last_day - 3660) AS first_day,
                term_end.last_day                                         AS last_day
         ) AS span
         -- Calendar days as offsets from the first one, so stepping a day is
         -- exact.
   CROSS JOIN LATERAL generate_series(0, span.last_day - span.first_day) AS step(n)
    JOIN public.schedule_slots s
      ON s.product_id = p.id
     -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
     AND s.weekday = EXTRACT(ISODOW FROM span.first_day + step.n)::integer - 1
         -- The break the day falls in, if any: the earliest, when two
         -- calendars' breaks overlap on it.
    LEFT JOIN LATERAL (
         SELECT breaks.break_id
           FROM breaks
          WHERE span.first_day + step.n BETWEEN breaks.start_date AND breaks.end_date
          ORDER BY breaks.start_date, breaks.break_id
          LIMIT 1
         ) AS holiday ON true
   WHERE p.id = p_product_id
     -- GREATEST and LEAST skip a NULL argument, so a NULL bound would quietly
     -- become the term's own. A span with a missing end is no span.
     AND p_from IS NOT NULL
     AND p_to IS NOT NULL
     -- A holiday is never planned, unless the caller asks to see them.
     AND (COALESCE(p_include_holidays, false) OR holiday.break_id IS NULL)
   ORDER BY session_date, starts_at;
$$;

COMMENT ON FUNCTION public.planned_session_dates(uuid, date, date, boolean) IS 'The ONLY expansion of a product''s plan into dated sessions: every date in [p_from, p_to] that falls inside the product''s term (start_date to end_date, both inclusive, end open for an open-ended club) on a weekday its schedule has a slot for, and outside every break of the holiday calendars the product follows, with the session''s start and end instants. A holiday is never planned: by default those dates are simply absent and holiday_break_id is always NULL. With p_include_holidays they are returned too, each tagged with the break it falls in (the earliest, where two calendars'' breaks overlap), for a reader that draws the holidays among the sessions. Instants are resolved in products.timezone, so they are DST-correct, and a session that crosses midnight belongs to the date it starts on — which is also the date a holiday is judged by. No rows when either bound is NULL. The span is clamped at its start, to no earlier than 3660 days before its last day, so an over-long span loses its oldest dates and keeps its newest. SECURITY INVOKER over products, schedule_slots and product_holiday_breaks, which every caller, anon included, reads alike — so it answers every caller identically. Every other reader of the plan asks this function; a catalog test fails on any other function that walks weekdays.';

REVOKE EXECUTE ON FUNCTION public.planned_session_dates(uuid, date, date, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.planned_session_dates(uuid, date, date, boolean) TO anon;
GRANT  EXECUTE ON FUNCTION public.planned_session_dates(uuid, date, date, boolean) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.planned_session_dates(uuid, date, date, boolean) TO service_role;


-- ---------------------------------------------------------------------------
-- 7. What is on a holiday did not happen
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.group_session_date_is_holiday(
  p_group_id     uuid,
  p_session_date date
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
  AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.product_groups g
            CROSS JOIN LATERAL public.product_holiday_breaks(
                    g.product_id, p_session_date, p_session_date
                  ) AS hb
            WHERE g.id = p_group_id
         );
$$;

COMMENT ON FUNCTION public.group_session_date_is_holiday(uuid, date) IS
  'Whether the date falls in a break of a holiday calendar the group''s product '
  'follows. The holiday arm of group_session_is_cancelled, and the partner '
  'API''s way to name a stored session on a holiday. Service-role only.';

REVOKE EXECUTE ON FUNCTION public.group_session_date_is_holiday(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.group_session_date_is_holiday(uuid, date) TO service_role;

-- The plan's other readers go on asking planned_session_dates, which now leaves
-- a holiday out, so their comments name a break as a date the plan holds no
-- session on.
COMMENT ON FUNCTION public.derive_group_session_window(uuid, date) IS
  'A session''s scheduled instants from the CURRENT plan (planned_session_dates). '
  'NULL when the plan has no session on the date: outside the product''s term, on '
  'a weekday it has no slot for, or inside a break of a holiday calendar the '
  'product follows.';

COMMENT ON FUNCTION public.group_session_date_is_scheduled(uuid, date) IS
  'Does the CURRENT plan have a session on this date: inside the product''s term, '
  'on a weekday it has a slot for, and outside every break of the holiday calendars '
  'it follows (planned_session_dates, through derive_group_session_window). The '
  'writable-date check minus its visible horizon — what a new cancellation is '
  'validated against, and one of the two ways a stored cancellation stays in '
  'effect (group_session_is_cancelled).';

COMMENT ON FUNCTION public.group_session_date_is_writable(uuid, date) IS
  'Loose write validation for a session date: the current plan has a session on '
  'it (inside the term, on a slot weekday, outside every holiday break the product '
  'follows), and an open-ended product''s date is within ninety days of '
  'product-local today.';

CREATE OR REPLACE FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
           EXISTS (
             SELECT 1
               FROM public.session_cancellations c
              WHERE c.group_id     = p_group_id
                AND c.session_date = p_session_date
           )
       AND (
             public.group_session_date_is_scheduled(p_group_id, p_session_date)
             -- A kept record holds its cancellation whatever the schedule does
             -- next: without this arm, removing the slot or narrowing the term
             -- would hand a cancelled session's report back to the families and
             -- its date back to the invoice.
             OR EXISTS (
                  SELECT 1
                    FROM public.group_sessions s
                   WHERE s.group_id     = p_group_id
                     AND s.session_date = p_session_date
                )
           )
         )
         -- A holiday is not running whatever is stored on it, record or none:
         -- frozen and hidden like a cancellation, and back when the break goes.
      OR public.group_session_date_is_holiday(p_group_id, p_session_date);
$$;

COMMENT ON FUNCTION public.group_session_is_cancelled(uuid, date) IS 'THE test for whether a (group, date) is a session that is not running, asked by every reader and writer: cancelled in effect or on one of the product''s holiday breaks. Cancelled in effect is a cancellation row AND either the current schedule projects the date or a group_sessions row is stored on it, so a cancellation over a stored record stays in effect through any later schedule or term edit; one on a date with neither a projection nor a row is inert, kept, and applies again if the schedule moves back. A date inside a break of a holiday calendar the product follows answers true whether or not anything is stored on it, and stops answering true when the break is edited away or the calendar detached.';

CREATE OR REPLACE FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) RETURNS TABLE(group_id uuid, session_date date)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c.group_id, c.session_date
    FROM public.session_cancellations c
   WHERE c.group_id = ANY (p_group_ids)
     AND public.group_session_is_cancelled(c.group_id, c.session_date)
  UNION
  -- A recorded session on a holiday did not happen either.
  SELECT s.group_id, s.session_date
    FROM public.group_sessions s
   WHERE s.group_id = ANY (p_group_ids)
     AND public.group_session_date_is_holiday(s.group_id, s.session_date);
$$;

COMMENT ON FUNCTION public.get_session_cancellations_in_effect(uuid[]) IS 'Every (group, date) among the given groups that is a session that did not happen — a cancellation in effect (group_session_is_cancelled holding over a session_cancellations row), or a stored group_sessions row on one of the product''s holiday breaks — with no reason, stamp or author: the partner API needs only which of its recorded sessions did not happen. Service-role only: its caller has no Sogverse user, and no client role is granted the tables behind it.';
