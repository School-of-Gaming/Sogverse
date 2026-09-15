-- A product's status is derived, never stored.
--
-- `products.status` is deleted, and with it the `product_status` enum. What a
-- product's lifecycle IS, from here on, is a function of three facts it already
-- carries — its start date, its signup threshold and its end date, read against
-- today in the product's own timezone — plus the count of active participations
-- on it. Nothing writes a lifecycle value anywhere, so nothing can disagree with
-- the dates.
--
-- WHY THE COLUMN HAD TO GO RATHER THAN BE MAINTAINED
--
-- It never moved. The only writer was create_product, whose caller always passed
-- 'pending'; update_product never assigned it; no cron, no trigger and no admin
-- action ever advanced it. In production every single product sat at 'pending'.
-- Meanwhile both readers that mattered — the app's own helper and
-- effective_status() here — already derived the real answer at read time,
-- precisely so no cron would have to exist.
--
-- So the column was a constant that looked like a fact, and readers kept
-- mistaking it for one. The most recent instance: the municipality invoicing
-- read admitted a club with no session rows only when its stored status was
-- running or completed, and the page projected a schedule on the same test — so
-- in production the "a session was scheduled and nobody recorded it" flagging
-- was dead for every club on the invoice, silently, because no club is ever
-- stored as anything but pending. A column that does not exist cannot be read
-- raw, which is the whole of the fix.
--
-- WHAT HAPPENS TO 'cancelled'
--
-- It leaves, from the stored enum and from the derived one alike. Product
-- cancellation was never built: no UI offers it, no writer sets it, no test
-- covers it, and the guards keyed to it (the seat-offer gate, the dashboard's
-- candidate filters, the switch-target filter) have never once been reached by a
-- cancelled product. Keeping a value that only ever answers "no" is how a
-- feature gets designed by accident around a placeholder. When cancellation is
-- built it will bring its own facts — who cancelled it, when, and what happens to
-- the seats — and none of them is an enum value.
--
-- The stored 'running' override goes the same way: the "start this under its
-- threshold" admin action it was reserved for was never built either.
--
-- THE DERIVATION, IN FULL
--
--   started   = (has start_date OR has signup_threshold)
--               AND (no start_date OR start_date <= today-in-product-zone)
--               AND (no threshold  OR active participations >= threshold)
--   endPassed = end_date IS NOT NULL AND end_date < today-in-product-zone
--   status    = endPassed ? (started ? 'completed' : 'expired')
--                         : (started ? 'running'   : 'pending')
--
-- Timezone semantics are unchanged: a date-only column is compared against the
-- product's own local calendar day, so a camp that ended yesterday in Helsinki is
-- over for a reader in Los Angeles too.
--
-- THE DATE PREDICATE, AND WHY IT REPLACES A FUNCTION CALL IN A POLICY
--
-- With no stored value and no 'cancelled', the derivation above collapses on one
-- axis: `status IN ('pending','running')` is true exactly when `endPassed` is
-- false, whatever the start conditions say. So "still live" is a pure date test —
--
--   end_date IS NULL OR end_date >= (now() AT TIME ZONE timezone)::date
--
-- — and that is what every filter that used to read `status IN ('pending',
-- 'running')` becomes. can_read_product is the one where this is load-bearing
-- rather than merely cheaper: it runs as the caller inside the products SELECT
-- policy, effective_status() is granted to service_role alone, and widening that
-- grant would drag a SECURITY DEFINER function into the authorization spine to
-- answer a question two columns already answer.

-- ---------------------------------------------------------------------------
-- 1. The derived enum loses 'cancelled'.
-- ---------------------------------------------------------------------------
-- Postgres cannot remove a value from an enum in place, so the type is rebuilt:
-- rename the old one out of the way, create the four-value replacement, repoint
-- the single object whose signature depends on it, and drop the old. The DROP is
-- deliberately un-CASCADEd — anything still depending on the old type fails this
-- migration loudly rather than being silently deleted.

ALTER TYPE public.effective_product_status RENAME TO effective_product_status_old;

CREATE TYPE public.effective_product_status AS ENUM (
  'pending',
  'running',
  'completed',
  'expired'
);

COMMENT ON TYPE public.effective_product_status IS 'The lifecycle a reader sees, computed at read time and stored nowhere: pending (start conditions not met yet), running (met, end date not passed), completed (met and the end date has passed), expired (the end date passed without the start conditions ever being met). Derived from start_date, signup_threshold, end_date and the active participation count, every date compared against today in the product''s own timezone.';

DROP FUNCTION public.effective_status(uuid);

CREATE FUNCTION public.effective_status(p_product_id uuid) RETURNS public.effective_product_status
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start_date        DATE;
  v_end_date          DATE;
  v_signup_threshold  INTEGER;
  v_timezone          TEXT;
  v_active_count      INTEGER;
  v_now_local         DATE;
  v_end_passed        BOOLEAN;
  v_has_date          BOOLEAN;
  v_has_threshold     BOOLEAN;
  v_start_reached     BOOLEAN;
  v_threshold_met     BOOLEAN;
  v_started           BOOLEAN;
BEGIN
  SELECT start_date, end_date, signup_threshold, timezone
    INTO v_start_date, v_end_date, v_signup_threshold, v_timezone
    FROM public.products
    WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_now_local := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_end_passed := v_end_date IS NOT NULL AND v_end_date < v_now_local;

  -- A product with neither a start date nor a threshold has nothing that could
  -- start it, so it stays pending however long it sits there: that is a product
  -- whose dates have not been filled in, not one that is under way.
  v_has_date := v_start_date IS NOT NULL;
  v_has_threshold := v_signup_threshold IS NOT NULL;
  v_start_reached := NOT v_has_date OR v_start_date <= v_now_local;

  IF v_has_threshold THEN
    SELECT COUNT(*) INTO v_active_count
      FROM public.participations
      WHERE product_id = p_product_id AND status = 'active';
    v_threshold_met := v_active_count >= v_signup_threshold;
  ELSE
    v_threshold_met := TRUE;
  END IF;

  v_started := (v_has_date OR v_has_threshold) AND v_start_reached AND v_threshold_met;

  IF v_started THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  RETURN CASE WHEN v_end_passed THEN 'expired' ELSE 'pending' END;
END;
$$;

COMMENT ON FUNCTION public.effective_status(p_product_id uuid) IS 'The lifecycle of one product, derived from its own columns and the live count of active participations on it. Nothing about the answer is stored, so nothing can be stale: a product is running once its start date has arrived and its signup threshold (if it has one) is met, completed once the end date has passed on a product that did start, expired once the end date has passed on one that never did, and pending until then. A product carrying neither a start date nor a threshold stays pending — there is nothing that could start it. Every date comparison is against today in the product''s OWN timezone, because start_date and end_date are calendar dates in that zone rather than instants. SECURITY DEFINER and granted to service_role alone: it reads participations across families, and a policy that needs the same question answered asks the date predicate inline instead (see can_read_product).';

REVOKE EXECUTE ON FUNCTION public.effective_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_status(uuid) TO service_role;

DROP TYPE public.effective_product_status_old;

-- ---------------------------------------------------------------------------
-- 2. The products read predicate asks the dates instead of the column.
-- ---------------------------------------------------------------------------
-- This is the one replacement where the inline date test is load-bearing rather
-- than merely cheaper. The predicate runs as the CALLER, inside the products
-- SELECT policy and the satellite policies that follow it, so reaching for
-- effective_status() here would mean granting a SECURITY DEFINER function that
-- counts participations across families to `anon` — and classifying it in the
-- authorization spine — to answer a question two columns on the row already
-- answer. See the header for why the two are equivalent.

CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT public.get_user_role()) = 'admin'::public.user_role
    -- public: published. `is_visible` is NOT tested here, and its absence is
    -- the point: that column governs LISTING only — the browse queries filter
    -- on it — while a direct link to an unlisted product is meant to lead to a
    -- page a parent can read and buy from. The consequence is that an unlisted
    -- product is readable, and therefore enumerable, through the Data API:
    -- obscurity rather than secrecy, accepted by owner decision (Aug 2026).
    -- What keeps a product unbuyable is its dates, its seat cap and its
    -- registration window — never its visibility.
    --
    -- "Its end date has not passed" IS "its effective status is pending or
    -- running": with no stored status and no cancelled state, the derivation
    -- splits on exactly this test and the start conditions only decide which
    -- side of the pair the answer lands on. Read in the product's OWN timezone,
    -- because end_date is a calendar date in that zone rather than an instant.
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND (pr.end_date IS NULL
             OR pr.end_date >= (now() AT TIME ZONE pr.timezone)::date)
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM public.participations p
      WHERE p.product_id = p_product_id
        AND (p.participant_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active'::public.participation_status, 'waitlisted'::public.participation_status)
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS 'Read predicate behind the products SELECT policy and the satellite tables that follow it (translations, prices, schedule slots, marketing consents, required consents). True for: an admin; anyone at all on a product whose end date has not passed in the product''s own timezone (or which has no end date); a parent or gamer party to an active or waitlisted participation on it; an assigned gedu. Since 00256 that second arm is a date test rather than a stored-status test, and the two are the same claim: with the lifecycle derived and no cancelled state, "pending or running" is exactly "the end date has not passed". The test is written inline rather than as a call to effective_status(), because this predicate runs as the caller inside an anon-readable policy and that function is service_role only. It does NOT test is_visible — since 00168 that column means "not publicly listed" and is applied by the browse queries, so an unlisted product stays readable (and enumerable) by direct link. Wrapped in COALESCE so it answers a total boolean rather than NULL for a caller with no profiles row.';

REVOKE EXECUTE ON FUNCTION public.can_read_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. create_product stops taking a status.
-- ---------------------------------------------------------------------------
-- The parameter changes the signature, so the function is dropped and recreated
-- rather than replaced. Everything else about it is unchanged, including that it
-- is SECURITY INVOKER with assert_admin() as its first statement — which is what
-- classifies it role-gated in the authorization spine, and why the guard must
-- stay the first thing the body does.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false) RETURNS uuid
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
    requires_gamer_creations
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
    p_requires_gamer_creations
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

COMMENT ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean) IS 'Admin-gated product create: the parent row plus its translations, schedule slots, prices, the staff-only material link and, since 00210, the consent documents enrolling on it requires. Since 00256 it takes NO status: a product''s lifecycle is derived from its dates, its signup threshold and the live count of active participations, so there is nothing for a creating caller to choose and nothing stored for a later reader to mistake for a fact. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs (00210) is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations (00227) is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

REVOKE EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, integer, integer, integer, text, public.product_tag, text, text[], boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The admin dashboard stops pre-filtering on the column.
-- ---------------------------------------------------------------------------
-- Both product sections already asked effective_status(); each also carried a
-- raw status clause in front of it, and both clauses were about states that no
-- longer exist. The attention list's `p.status <> 'cancelled'` and the schedule
-- list's `p.status NOT IN ('cancelled','completed')` are simply gone: what is
-- left in each is the derived test that was doing the work, plus (on the
-- schedule) the recently-or-soon-ended window it is OR'd with.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The users strip: one tile per role, always all of them.
  --
  -- Driven by `enum_range` rather than by what `profiles` happens to contain, so
  -- a role with no accounts renders a zero tile instead of vanishing — and a
  -- role added to the enum later arrives here without an edit.
  --
  -- Two stats can be NULL rather than 0, and the difference is the point.
  -- `verified` is NULL for a role none of whose accounts holds a REAL address: a
  -- gamer in sign-in mode `parent` or `username` carries a synthetic
  -- @gamer.sogverse.internal handle nobody will ever click a link in, so "0
  -- verified" would report a problem that does not exist. A gamer in mode
  -- `email` holds a real mailbox and counts exactly like everyone else — which
  -- is why the test below is the ADDRESS and not the role (00235). `certified`
  -- is the same NULL-means-no-meaning shape for a simpler reason: only an
  -- educator can be certified.
  --
  -- A role with no accounts at all still reports 0 rather than NULL — the
  -- addressable test only speaks about accounts that exist, and an empty tile
  -- has nothing to say either way.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN COALESCE(c.total, 0) > 0
                                 AND COALESCE(c.addressable, 0) = 0 THEN NULL
                               ELSE COALESCE(c.verified, 0) END,
             'certified', CASE WHEN r.role_name = 'gedu' THEN COALESCE(c.certified, 0)
                               ELSE NULL END
           )
           ORDER BY r.ord
         )
    INTO v_users
    FROM unnest(enum_range(NULL::public.user_role))
           WITH ORDINALITY AS r(role_name, ord)
    LEFT JOIN (
      SELECT pr.role,
             count(*)                                                 AS total,
             -- "Holds an address a human reads." True of every non-gamer, and
             -- of a gamer exactly when their parent chose sign-in mode `email`.
             -- A gamer row missing from gamer_profiles is a data error and
             -- lands on the conservative side: not addressable.
             count(*) FILTER (
               WHERE pr.role <> 'gamer' OR gmr.sign_in = 'email'
             )                                                        AS addressable,
             count(*) FILTER (
               WHERE pr.email_verified_at IS NOT NULL
                 AND (pr.role <> 'gamer' OR gmr.sign_in = 'email')
             )                                                        AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp   ON gp.user_id  = pr.id
        LEFT JOIN public.gamer_profiles gmr ON gmr.user_id = pr.id
       GROUP BY pr.role
    ) c ON c.role = r.role_name;

  -- ---------------------------------------------------------------------------
  -- 2. The certification queue: educators waiting on an admin's decision.
  --
  -- An INNER JOIN, deliberately. A gedu with no `gedu_profiles` row is a data
  -- error, and a LEFT JOIN would read that missing row as `certified = false` —
  -- putting a broken account in a queue whose only action (certify) writes to the
  -- row that is not there. Missing means excluded; the queue is for accounts that
  -- exist and are waiting.
  --
  -- `contract_accepted_at` (00201) is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version (00202): a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` (00213) is when an admin recorded seeing this
  -- candidate's criminal record extract, or NULL if none has been recorded. The
  -- flag beside it is deliberately not shipped: the stamp is non-NULL exactly
  -- when the flag is true, so a second field could only ever contradict the
  -- first. It informs the decision on the same terms as the contract stamp and
  -- gates nothing either.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT min(ca.accepted_at)
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND split_part(ca.contract_version, '/', 1) = (
                          SELECT split_part(v.version, '/', 1)
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               ),
               'criminal_record_check_at', gp.criminal_record_check_at
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_queue
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND gp.certified = false;

  -- ---------------------------------------------------------------------------
  -- 3. The attention queue: live products with at least one thing wrong.
  --
  -- Six kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `empty_groups_without_gedu` (00241) — a group with no educator AND no
  --                           active member. An admin pre-building next term's
  --                           groups has not made a mistake, which is why this is
  --                           a SEPARATE and LOWER-ranked kind rather than part
  --                           of the one above — but it is still a loose end
  --                           somebody has to come back to, so it is named rather
  --                           than carved out of the group check, which is what
  --                           it was before this migration.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'empty_groups_without_gedu', eg.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them (00207). Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL)
             ) AS doc
        FROM candidate c
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
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The same question asked of the OTHER half of the unstaffed groups
        -- (00241): no educator, and nobody in it either. Deliberately a second
        -- lateral with an inverted membership test rather than a flag on the one
        -- above, because the page ranks the two differently and one wire fact per
        -- kind of wrong is what its ranking maps over. The EXISTS / NOT EXISTS
        -- pair is what makes the two arrays disjoint: no group can be in both,
        -- and a group somebody teaches is in neither.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND NOT EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) eg
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state" (00207). An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR jsonb_array_length(eg.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
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
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — either can be NULL, where the stat has no meaning: certified only means something for an educator, and verified is NULL for a role none of whose accounts holds a real address, which is every gamer unless their parent chose sign-in mode email), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Since 00213 each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. Since 00207 the waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. Since 00241 an unstaffed group with NO active member is named too, in its own empty_groups_without_gedu array beside groups_without_gedu, and can put a product in the queue by itself: the empty group used to be carved out of the group check entirely, on the reasoning that an admin pre-building next term has not made a mistake, and that reasoning now decides its RANK on the page rather than hiding it. The two arrays are disjoint by construction and neither holds a group somebody is assigned to. Both product sections ask effective_status() and nothing else: since 00256 there is no stored status to pre-filter on, so the derived answer is the only lifecycle test either candidate set makes, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The invoicing read stops asking whether a club was "started".
-- ---------------------------------------------------------------------------
-- This is the defect named in the header, in the place it actually bit. A
-- municipality club with no recorded session reached the invoice only if its
-- stored status was running or completed — which no club's ever was — so the
-- second arm of the candidate filter never admitted anybody, and the page's
-- "scheduled but nobody recorded it" flagging had nothing to flag. What is left
-- is the term test alone: a club is a candidate if it recorded a session in the
-- month, or if its term overlaps the month at all.
--
-- The emitted club object drops `status` with it. The page never needed it to
-- decide anything — the term dates are what say whether a date is inside the
-- club's own run — and shipping a constant would only invite the next reader to
-- believe it.

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
               'sessions',               se.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
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

COMMENT ON FUNCTION public.get_admin_municipality_invoicing(p_month_start date) IS 'One calendar month of municipality-club invoicing, as a single document: every municipality club that either recorded a session in the month or could have (a term that overlaps it), each with its timezone, term dates, current municipality_fee_cents, the whole product_translations array, its weekly schedule slots, its own location row, the nearest ancestor-or-self location of type municipality, and every stored group_sessions row in the month as a raw (group_id, session_date) pair. Admin-only, guard-first on assert_admin, and deliberately not STRICT so the guard cannot be skipped on NULL input. p_month_start must be the first day of a month; anything else raises check_violation. A session RAN iff a group_sessions row exists — those rows are lazily materialized when an educator records a report, note or attendance, so a row is the evidence somebody was there — and the client counts one session per club per calendar date, because a club with two groups meeting on one day ran one session. The schedule ships so the client can project what was supposed to run and flag a scheduled date with no row; a projection is never counted and never billed, and a stored row on an unscheduled date still counts. Since 00256 the candidate test is the term alone and the document carries no status: the second arm used to demand a stored running/completed status as well, which no club ever held, so a club with no recorded session never reached the invoice and nothing was ever flagged as missed. The municipality walk climbs parent_id THROUGH retired rows and never filters them, because a school that has since closed still sat in its municipality. Every club in the document HAS a municipality: a club whose chain reaches none cannot be invoiced to anybody, so the whole read raises check_violation naming those product ids rather than shipping a null the caller would have to render somewhere outside every total. The fee is the current column value with no snapshotting, and NULL means unset — the client shows that as a blank to fix, never as zero. Every array ships as [] rather than null.';

REVOKE EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_municipality_invoicing(date) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The seat-offer gate locks the product without reading a status off it.
-- ---------------------------------------------------------------------------
-- The lock itself is what this statement was always for — an admin drag-
-- promoting the same row and a parent pressing Accept must not both write it —
-- and it stays, along with the NOT FOUND arm, which is the real half of the
-- guard: participations.product_id cascades on delete, so a product dropped
-- between the two reads takes the row with it and the lock finds nothing. What
-- goes is the 'cancelled' test beside it. A product cannot be cancelled, so that
-- arm has never once been true, and there is nothing for the lock to carry back.

CREATE OR REPLACE FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id        uuid;
  v_locked_product_id uuid;
  v_status            public.participation_status;
  v_sent_at           timestamptz;
  v_customer_id       uuid;
  v_participant_id    uuid;
  v_group_id          uuid;
  v_group_count       integer;
  v_within_window     boolean;
  v_already_notified  boolean;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The same gate lock, so an admin drag-promoting this very row and a parent
  -- pressing Accept cannot both write it. The id is selected rather than any
  -- column of interest because the lock is the whole point of the statement:
  -- since 00256 there is no stored status to carry back, the product's lifecycle
  -- being derived from dates nobody is racing us to write.
  SELECT id INTO v_locked_product_id
    FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- THE ONE FACT AN HONOURED INVITE ALWAYS REQUIRES: the product still exists.
  -- Everything else about the offer is grandfathered (see the header) — the
  -- terms it went out on survive an admin's edit, because we asked and they said
  -- yes. The product's own existence is not one of those terms: an invitation to
  -- something that is gone is an invitation to nothing.
  --
  -- NOT FOUND is reachable even though the participation was found a statement
  -- ago: participations.product_id cascades on delete, so a product dropped
  -- between the two takes the row with it and this lock finds nothing.
  --
  -- It answers `stale`, which is the outcome every other "this is no longer
  -- open" case already produces — deliberately not a new kind. THIS IS ALSO THE
  -- ONE REFUSAL THAT STAYS GENERIC ALL THE WAY OUT. A `stale` answer is re-read
  -- against the row by the caller, and every shape that means the offer was
  -- consumed — accepted, promoted, declined, withdrawn, superseded — resolves
  -- to `used`. A row still holding this exact offer inside its window cannot be
  -- any of those, so it is this guard that refused, and it resolves to the
  -- generic `invalid` instead.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  -- The notified stamp is read HERE, in the same statement as the identifiers
  -- and for the same reason: the DELETE below takes the column with it, and
  -- after that nothing can tell whether staff were ever told this offer went
  -- unanswered. See the header for why the answer matters and why this read is
  -- deliberately unlocked.
  SELECT status,
         seat_offer_sent_at,
         customer_id,
         participant_id,
         seat_offer_expiry_notified_at IS NOT NULL
    INTO v_status, v_sent_at, v_customer_id, v_participant_id, v_already_notified
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The compare-and-swap, and the whole of this feature's replay protection.
  -- Every way an offer ends moves this value: accepting clears it, declining
  -- deletes the row, re-offering replaces it. So a link, a stale tab and a
  -- second click all fail here rather than in a revocation table that does not
  -- exist. `IS DISTINCT FROM` because a NULL stamp must compare unequal to
  -- everything rather than swallow the test three-valued.
  --
  -- The status test below can only fire if the CHECK constraint has been
  -- broken, since an offer stamp cannot survive on a non-waitlisted row. It is
  -- here because a silent seat grant would be the failure mode otherwise.
  IF v_sent_at IS NULL
     OR v_sent_at IS DISTINCT FROM p_offer_sent_at
     OR v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  -- The window is enforced HERE and not only in the token, because the in-app
  -- path carries no token at all: a parent pressing Accept on their My SOG card
  -- names a participation and nothing else.
  --
  -- THE WINDOW BINDS ACCEPT AND NOTHING ELSE, AND THAT ASYMMETRY IS THE POINT
  --
  -- The deadline exists to stop a seat being claimed after we have given up
  -- waiting and offered it to somebody else. Nothing about that reasoning
  -- reaches a DECLINE: a family saying "we cannot come" is giving something
  -- back, and there is no hour of the day when we would rather not know. A
  -- refusal there would be the database insisting a family keep a place they
  -- have just told us they do not want, purely because they answered late.
  --
  -- So the window is read once into a flag and tested only on the accept side.
  -- The flag rides back on the DECLINE result because the ROUTE has to tell an
  -- answer that beat the deadline from one that did not, even though the family
  -- does not. It is computed here rather than by the caller because this
  -- transaction is the only place the stamp and the clock are read together
  -- under the lock.
  v_within_window := v_sent_at + interval '5 days' > now();

  IF p_accept AND NOT v_within_window THEN
    RETURN jsonb_build_object(
      'kind',             'expired',
      'participation_id', p_participation_id,
      'product_id',       v_product_id
    );
  END IF;

  IF p_accept THEN
    -- The single group, resolved again at answer time rather than trusted from
    -- send time: an admin may have added or removed one while the family was
    -- deciding. If the answer is no longer unambiguous the seat is STILL
    -- granted and simply lands unassigned — we asked, they said yes, and a
    -- placement question is ours to sort out, not a reason to refuse them.
    SELECT count(*) INTO v_group_count
      FROM public.product_groups
     WHERE product_id = v_product_id;

    IF v_group_count = 1 THEN
      SELECT id INTO v_group_id
        FROM public.product_groups
       WHERE product_id = v_product_id;
    ELSE
      v_group_id := NULL;
    END IF;

    -- No seat-count gate, deliberately — the same capacity override
    -- promote_from_waitlist makes, with a stronger claim behind it: this seat
    -- was offered by name and accepted. A product that refilled in the meantime
    -- goes one over rather than taking back an invitation.
    UPDATE public.participations
       SET status                        = 'active'::public.participation_status,
           group_id                      = v_group_id,
           waitlisted_at                 = NULL,
           seat_offer_sent_at            = NULL,
           seat_offer_expiry_notified_at = NULL
     WHERE id = p_participation_id;

    RETURN jsonb_build_object(
      'kind',             'accepted',
      'participation_id', p_participation_id,
      'product_id',       v_product_id,
      'group_id',         v_group_id,
      'customer_id',      v_customer_id,
      'participant_id',   v_participant_id
    );
  END IF;

  -- Declining gives up the place in line, exactly as leave_my_waitlist_spot
  -- does — a family who cannot come has no queue position to keep warm, and the
  -- staff mail this triggers is what turns their answer into the next family's
  -- invitation. The identifiers are read above, before the row is gone, because
  -- the mail names all four.
  --
  -- Reachable after the window has closed as well as inside it, which is the
  -- whole of the asymmetry above. The two flags below are what tell the caller
  -- which of the two it just did AND whether anybody has already been told this
  -- offer lapsed — and after this statement neither question has an answer left
  -- anywhere, because the row that held both is gone.
  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind',             'declined',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id,
    'within_window',    v_within_window,
    'already_notified', v_already_notified
  );
END;
$$;

COMMENT ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) IS 'A family''s answer to a seat offer, under the product gate lock. Compare-and-swap on p_offer_sent_at against the stored stamp: every way an offer ends moves that value, so a used link, a stale tab and a superseded offer all come back ''stale'' with no revocation table anywhere. The five-day window is re-checked here rather than trusted from the token, because the in-app path (a parent pressing Accept in My SOG) carries no token. THE WINDOW BINDS ACCEPT ALONE. A DECLINE succeeds for as long as the row exists, late or not: the deadline is there to stop a seat being claimed after we have offered it elsewhere, and none of that reasoning reaches a family giving a place back. THE DECLINED RESULT CARRIES TWO FLAGS AND THEY ANSWER DIFFERENT QUESTIONS. within_window says the answer beat the deadline. already_notified says seat_offer_expiry_notified_at was set when we read it — read before the DELETE, because the DELETE takes the column with it and after that nothing can tell whether staff were ever told this offer went unanswered. The caller mails on within_window OR NOT already_notified, which skips the mail only where the no-response mail demonstrably went: expiry here is OBSERVED rather than scheduled, so an offer nobody looked at between its fifth day and a late answer was never reported, and treating lateness alone as proof of notification made staff learn less from an answer than from silence. The already_notified read is deliberately not locked against a concurrent sweep — this transaction holds the product gate lock, not the participation row — so the worst case is one duplicate staff mail, which is the recoverable direction. THE PRODUCT IS RE-CHECKED BY ID ON THE LOCK: a MISSING product answers ''stale'' and grants nothing. That is the boundary of this function''s grandfathering — the TERMS the offer went out on survive an admin''s edit (the billing mode is deliberately not re-read), but the product''s own existence is not a term, and the one fact an honoured invite always requires is that the product it names still exists. A product that has merely run out of dates is NOT guarded: it still exists and nothing has been withdrawn. Since 00256 existence is the whole of the test — the lock used to carry a stored status back and refuse a ''cancelled'' product, and there is no such state any more. That guard is also the one refusal that stays generic all the way out to the reader: every other ''stale'' resolves to ''used'' when the caller re-reads the row, and only a row still holding this exact live offer resolves to ''invalid''. ACCEPT activates the seat and places it in the product''s single group, resolved again at answer time — if the product no longer has exactly one group the seat is still granted and lands unassigned, because a placement question is ours and not a reason to withdraw an invitation. There is no seat-count gate, deliberately: the same capacity override promote_from_waitlist makes, with a stronger claim behind it, so a product that refilled while the family was deciding goes one over. DECLINE hard-deletes the row, matching leave_my_waitlist_spot, and returns the four identifiers the staff mail names because they cannot be read afterwards. No EXECUTE grant to authenticated: the public landing route has no session to guard on — the signed token is the authorization — and the in-app route establishes the parent''s ownership before calling.';

REVOKE EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamp with time zone, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamp with time zone, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The column and its enum leave.
-- ---------------------------------------------------------------------------
-- The CHECK went with the 'running' value it was written for: "a running product
-- has a start date" was the one invariant the stored override needed, and with
-- no override and no stored value there is nothing left for it to constrain. The
-- derivation makes the same statement without a constraint — a product with no
-- start date and no threshold has nothing that could start it, so it reads
-- pending.
--
-- Dropping the column takes idx_products_status with it. Neither DROP is
-- CASCADEd: if any object still depends on either, this migration stops here
-- rather than deleting whatever that object was.

ALTER TABLE public.products DROP CONSTRAINT chk_products_running_has_start_date;

ALTER TABLE public.products DROP COLUMN status;

DROP TYPE public.product_status;

-- ---------------------------------------------------------------------------
-- 8. Assert the end state.
-- ---------------------------------------------------------------------------
-- plpgsql bodies are not validated at DDL time, so a function left naming the
-- dropped column would compile here and fail at run time in front of a user.
-- The last two checks are what make this migration safe to trust: they read
-- every function source in the schema and refuse a leftover reference.

DO $$
DECLARE
  v_values text[];
  v_offenders text;
BEGIN
  -- --- (a) The column is gone. ---------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = 'public.products'::regclass
       AND a.attname = 'status'
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'products.status still exists';
  END IF;

  -- --- (b) The stored enum is gone. ----------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname = 'product_status'
  ) THEN
    RAISE EXCEPTION 'the product_status type still exists';
  END IF;

  -- --- (c) The derived enum is exactly the four surviving values. ----------
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
    INTO v_values
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'effective_product_status';

  IF v_values IS DISTINCT FROM ARRAY['pending','running','completed','expired'] THEN
    RAISE EXCEPTION 'effective_product_status is % rather than the four derived values',
      COALESCE(v_values::text, 'missing');
  END IF;

  -- --- (d) No function body still names the stored type. -------------------
  -- Word-anchored so `effective_product_status` — which several bodies still
  -- legitimately declare a variable of — does not match.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offenders
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ '\mproduct_status\M';

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION 'function body still names product_status: %', v_offenders;
  END IF;

  -- --- (e) No function body names a p_status it does not take. -------------
  -- `p_status` is a live parameter name elsewhere in the schema (attendance
  -- takes one), so the check is not on the string but on the mismatch: a body
  -- naming p_status while its own argument list does not is a body left reading
  -- an argument that no longer exists.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_offenders
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ '\mp_status\M'
     AND 'p_status' <> ALL (COALESCE(p.proargnames, ARRAY[]::text[]));

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION 'function body names p_status but takes no such argument: %', v_offenders;
  END IF;

  -- --- (f) create_product kept its guard and its grants. -------------------
  IF position('PERFORM public.assert_admin();' IN
              (SELECT p.prosrc FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'create_product')) = 0 THEN
    RAISE EXCEPTION 'create_product lost its admin guard';
  END IF;

  IF NOT has_function_privilege('authenticated', (
        SELECT p.oid FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_product'), 'EXECUTE')
     OR has_function_privilege('anon', (
        SELECT p.oid FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_product'), 'EXECUTE') THEN
    RAISE EXCEPTION 'create_product does not carry the grants it had before 00256';
  END IF;

  -- --- (g) effective_status stayed service-role only. ----------------------
  IF has_function_privilege('anon', 'public.effective_status(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_status is executable by a Data API role';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.effective_status(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_status lost its service_role grant';
  END IF;
END $$;
