-- A gedu substitutes only where qualified, only in a language they speak, and
-- on-site only within their coverage areas.
--
-- WHAT THIS CHANGES
--
-- A session's requirements now gate the paths a gedu starts on their own: the
-- pool of open substitution requests, and offering on one. There are three: the
-- qualifications the session's product requires; the language it is run in
-- (products.spoken_language_code), which the gedu must have among their spoken
-- languages (profiles.spoken_languages); and, for an in-person product only,
-- its site, which one of the gedu's coverage ticks (gedu_locations) must be or
-- be an ancestor of. A gedu who has listed no language therefore sees an empty
-- pool, and one who has ticked no area sees online sessions only; both are
-- accepted, not special-cased. An online product has no coverage requirement,
-- even an online municipality club that carries a location.
--
-- A product requires
-- `neuroinclusive` when it is tagged neuroinclusive, and `consumer_products`
-- when it is a consumer_club, camp or event (everything but municipality_club);
-- a product can require both or neither. A gedu who does not hold every
-- qualification a session's product requires, does not speak its language, or
-- does not cover its site, does not see its request in the pool and cannot
-- offer on it.
--
-- The admin paths are NOT gated here. Seating a substitute, approving an offer
-- and a permanent assignment ask nothing about any of the requirements: an admin
-- is warned in the UI and may proceed. That is why each test is a predicate of its
-- own rather than a clause of gedu_may_substitute_session, which the admin
-- writes ask too. Approval deliberately does not ask them either: approving is
-- an admin's act, and none of the three is realistically taken away between an
-- offer and its approval, so the case where it would matter is not worth a
-- check.
--
-- 1. `product_required_qualifications(product_type, product_tag)` — the one
--    statement of which qualifications a product requires.
-- 2. `gedu_holds_session_qualifications(uuid, uuid)` — does this gedu hold
--    every qualification this group's product requires? And its sibling
--    `gedu_speaks_session_language(uuid, uuid)` — does this gedu speak the
--    language this group's product is run in? And `gedu_covers_product_site(
--    uuid, uuid)` — does this gedu cover this product's site, or is it online?
--    Separate predicates rather than one, because the offer says which is
--    missing.
-- 3. `get_open_substitution_requests()` and `offer_session_substitution(uuid)`
--    ask all three. The offer refuses each with its own message, so the client
--    can tell "not qualified", "does not speak" and "does not cover" apart from
--    the generic refusal.
-- 4. `session_product_document` carries the product's tag, so a substitution
--    surface can say what the session requires.
-- 5. `user_list_entries` carries the qualifications each person holds, beside
--    `certified`, for the admin gedu picker.
-- 6. The comments that said qualifications gate nothing and that language and
--    coverage were left to follow-ups.
-- 7. `get_gedus_covering_product(uuid)` — the admin picker's answer to which
--    gedus cover an in-person product's site, asked of the same predicate, so
--    the picker's warning and the pool cannot disagree.

-- ---------------------------------------------------------------------------
-- 1. What a product requires
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag DEFAULT NULL) RETURNS public.gedu_qualification[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p_tag = 'neuroinclusive'::public.product_tag
      THEN 'neuroinclusive'::public.gedu_qualification END,
    CASE WHEN p_product_type IN (
           'consumer_club'::public.product_type,
           'camp'::public.product_type,
           'event'::public.product_type
         )
      THEN 'consumer_products'::public.gedu_qualification END
  ], NULL);
$$;

COMMENT ON FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag) IS 'Internal: the gedu qualifications a product requires of whoever runs a session of it, in the enum''s declared order — neuroinclusive when the product is tagged neuroinclusive, consumer_products when it is a consumer_club, camp or event (everything but municipality_club). Empty when it requires nothing. p_tag defaults to NULL, an untagged product, which is how a Data API caller asks about one. The one statement of that mapping in the database; the app carries a mirror of it, and a DB test enumerating every product type and tag holds the two in agreement. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Whether a gedu holds them, and speaks the session's language
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT p_gedu_id IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.product_groups g
             JOIN public.products p ON p.id = g.product_id
            WHERE g.id = p_group_id
              AND NOT EXISTS (
                    SELECT 1
                      FROM unnest(public.product_required_qualifications(p.product_type, p.tag)) AS req(qualification)
                     WHERE NOT EXISTS (
                             SELECT 1
                               FROM public.gedu_qualifications gq
                              WHERE gq.gedu_id       = p_gedu_id
                                AND gq.qualification = req.qualification
                           )
                  )
         );
$$;

COMMENT ON FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) IS 'Internal predicate: does this gedu hold every qualification the product of this group requires (product_required_qualifications)? True for a product that requires nothing; false for an unknown group. Asked only on the paths a gedu starts on their own — get_open_substitution_requests as its exclusion and offer_session_substitution as a refusal — and deliberately NOT by gedu_may_substitute_session, which the admin writes ask too: an admin seating, approving or assigning an unqualified gedu is warned in the UI and may proceed. Approval does not re-ask it, so an offer stays approvable whatever happens to the offerer''s qualifications afterwards. SECURITY INVOKER and reached only from inside SECURITY DEFINER callers; not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_holds_session_qualifications(p_gedu_id uuid, p_group_id uuid) TO service_role;

CREATE FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.product_groups g
             JOIN public.products p  ON p.id = g.product_id
             JOIN public.profiles pr ON pr.id = p_gedu_id
            WHERE g.id = p_group_id
              AND p.spoken_language_code = ANY (pr.spoken_languages)
         );
$$;

COMMENT ON FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) IS 'Internal predicate: does this gedu list, among their spoken_languages, the language the product of this group is run in (spoken_language_code)? False for a gedu who has listed none, so such a gedu''s pool is empty — accepted rather than special-cased — and false for an unknown gedu or group. The sibling of gedu_holds_session_qualifications, asked on exactly the same paths for the same reasons: by get_open_substitution_requests as its exclusion and by offer_session_substitution as a refusal with its own message, and deliberately NOT by gedu_may_substitute_session, because an admin seating, approving or assigning a gedu who does not speak the language is warned in the UI and may proceed. SECURITY INVOKER and reached only from inside SECURITY DEFINER callers; not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_speaks_session_language(p_gedu_id uuid, p_group_id uuid) TO service_role;

-- Keyed by product rather than group, unlike its two siblings: the admin
-- picker asks it of a product, through get_gedus_covering_product.
CREATE FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH RECURSIVE
  product AS (
    SELECT p.is_remote, p.location_id
      FROM public.products p
     WHERE p.id = p_product_id
  ),
  -- The site and every place above it. A tick is an "I cover this subtree"
  -- claim, so a tick on any of these covers the site. The depth bound is a
  -- belt-and-braces stop on a tree the schema does not forbid a cycle in
  -- beyond a row parenting itself.
  lineage AS (
    SELECT l.id, l.parent_id, 0 AS depth
      FROM public.locations l
      JOIN product ON l.id = product.location_id
     UNION ALL
    SELECT l.id, l.parent_id, w.depth + 1
      FROM lineage w
      JOIN public.locations l ON l.id = w.parent_id
     WHERE w.depth < 16
  )
  SELECT EXISTS (SELECT 1 FROM product WHERE product.is_remote)
      OR EXISTS (
           SELECT 1
             FROM lineage
             JOIN public.gedu_locations gl ON gl.location_id = lineage.id
            WHERE gl.gedu_id = p_gedu_id
         );
$$;

COMMENT ON FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) IS 'Internal predicate: does this gedu cover this product''s site? True for an online product (is_remote), which has no coverage requirement — even an online municipality club, which carries a location. For an in-person product, true when one of the gedu''s gedu_locations ticks is the product''s site or any place above it, because a tick claims its whole subtree; a gedu who has ticked nothing therefore covers no in-person product. False for an unknown product. The third sibling of gedu_holds_session_qualifications and gedu_speaks_session_language, asked on the same gedu paths for the same reasons — by get_open_substitution_requests as its exclusion and by offer_session_substitution as a refusal with its own message — and deliberately NOT by gedu_may_substitute_session, because an admin seating, approving or assigning a gedu who does not cover the site is warned in the UI and may proceed. Also the whole of get_gedus_covering_product, the admin picker''s read, so the warning and the pool answer from one statement. Keyed by product rather than group, unlike the siblings, because the picker asks it of a product. SECURITY INVOKER and reached only from inside SECURITY DEFINER callers; not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The pool and the offer ask all three
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_open_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- The pool list: every open request the caller could actually take. The
  -- exclusion is the `may substitute` predicate itself rather than a hand-written
  -- copy of its clauses, so the list and the offer button can never disagree —
  -- a session the gedu is expected at, one they have their own request on, and
  -- their own absence are all out by construction. The qualification, language
  -- and coverage predicates are the offer's other three tests and are asked
  -- here for the same reason: a request on a product the caller is not
  -- qualified for, that is run in a language they have not listed, or whose
  -- site is outside their coverage areas, is not in their pool.
  --
  -- The ABSENT GEDU IS NOT NAMED. Naming them half-reveals a private reason
  -- (everybody knows who is off sick), and the seat being substituted belongs to the
  -- group rather than to a person the volunteer needs to know about.
  --
  -- Bounded to the next 60 days, which is a list bound and not a rule: a request
  -- further out than that exists and is staffable from the admin queue.
  --
  -- The client owns the calendar math, exactly as both feeds do — this emits the
  -- date plus the product's slots and timezone and computes no instant.
  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'request_id',   r.id,
               'group_id',     r.group_id,
               'group_name',   g.name,
               'session_date', r.session_date,
               'role',         r.role,
               -- The fee for THIS role, and null when the product has not set
               -- one. Null is a blank field rather than a volunteer session: the
               -- surface shows nothing and flags nothing, which is the existing
               -- treatment of a missing assistant fee.
               'fee_cents',
                 CASE r.role
                   WHEN 'primary'::public.gedu_assignment_role
                     THEN p.primary_gedu_fee_cents
                   ELSE p.assistant_gedu_fee_cents
                 END,
               'has_offered', EXISTS (
                 SELECT 1
                   FROM public.session_substitution_offers o
                  WHERE o.request_id = r.id
                    AND o.gedu_id    = v_caller
               ),
               -- The session, described exactly as every other substitution
               -- surface describes it.
               'product', public.session_product_document(p)
             )
             ORDER BY r.session_date, p.id, g.name, r.id
           )
      FROM public.session_substitution_requests r
      JOIN public.product_groups g ON g.id = r.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
       AND r.session_date <= (now() AT TIME ZONE p.timezone)::date + 60
       AND public.gedu_may_substitute_session(
             v_caller, r.group_id, r.session_date, r.requested_by
           )
       AND public.gedu_holds_session_qualifications(v_caller, r.group_id)
       AND public.gedu_speaks_session_language(v_caller, r.group_id)
       AND public.gedu_covers_product_site(v_caller, p.id)
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_open_substitution_requests() IS 'The gedu dashboard''s "Sessions needing a substitute": every `open` request dated today or later in the product''s timezone, within the next 60 days, that the CALLER could actually take. The exclusion is the offer''s own four tests — gedu_may_substitute_session, gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site — rather than a copy of their clauses, so this list and the offer button can never disagree: a request on a product whose qualifications the caller does not hold, that is run in a language the caller has not listed, or that is in person at a site outside the caller''s coverage areas, is not in their pool. A gedu who has listed no language sees none, and one who has ticked no coverage area sees online sessions only. Each line carries the session''s product as session_product_document describes it — the one shell every substitution surface shares — plus the group name, the date, the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and whether the caller has already offered. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Contains no schedule expansion — the client owns the calendar math, exactly as both feeds do. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the may-substitute predicate''s refusals.';

CREATE OR REPLACE FUNCTION public.offer_session_substitution(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_timezone   text;
  v_product_id uuid;
  v_row        public.session_substitution_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is % and is no longer taking offers', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.timezone, p.id INTO v_timezone, v_product_id
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = v_row.group_id;

  IF v_row.session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'this session (%) is in the past', v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.gedu_may_substitute_session(
           v_caller, v_row.group_id, v_row.session_date, v_row.requested_by
         ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Its own message, so the client can say why: the gedu is otherwise able to
  -- take the session, and the qualification is the one thing missing.
  IF NOT public.gedu_holds_session_qualifications(v_caller, v_row.group_id) THEN
    RAISE EXCEPTION 'this gedu is not qualified for this session''s product'
      USING ERRCODE = '42501';
  END IF;

  -- Likewise its own message: the language is the one thing missing.
  IF NOT public.gedu_speaks_session_language(v_caller, v_row.group_id) THEN
    RAISE EXCEPTION 'this gedu does not speak the language this session is run in'
      USING ERRCODE = '42501';
  END IF;

  -- Likewise its own message: the site is the one thing missing.
  IF NOT public.gedu_covers_product_site(v_caller, v_product_id) THEN
    RAISE EXCEPTION 'this gedu does not cover the site this session is run at'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotent on the unique key: offering twice is one offer, and a double-tap
  -- is not an error worth surfacing.
  INSERT INTO public.session_substitution_offers (request_id, gedu_id)
  VALUES (p_request_id, v_caller)
  ON CONFLICT (request_id, gedu_id) DO NOTHING;

  -- CONCEALED, explicitly: a volunteer never learns whose absence this is.
  RETURN public.substitution_request_document(v_row, false, v_caller, false);
END;
$$;

COMMENT ON FUNCTION public.offer_session_substitution(p_request_id uuid) IS '"Offer to substitute", from the gedu dashboard''s pool list. Guarded on gedu_may_substitute_session — certified, not the absent gedu, not already expected at that session, and holding no non-withdrawn request of their own on that (group, date) — then on gedu_holds_session_qualifications, refused with its own 42501 message saying the gedu "is not qualified", then on gedu_speaks_session_language, refused with its own 42501 message saying the gedu "does not speak the language", then on gedu_covers_product_site, refused with its own 42501 message saying the gedu "does not cover the site", so the client can name each; plus the request being `open` and dated today or later in the product''s timezone. Idempotent on (request, gedu): offering twice is one offer. There is deliberately no ranking, no eligibility beyond certification, qualifications, spoken language and coverage, and no notification on any channel; the office decides, and auto-approving the first offer was rejected because the admin step IS the product. Returns the request document, which carries no offer_count for an offerer — who else volunteered is not their business. The document it returns CONCEALS the absent gedu: requested_by and requested_by_first_name arrive as JSON null, because otherwise offering would be a way to unmask the absent person on any pool row, leaving the pool''s own "names the session, never the person" rule one button-press deep.';

-- CREATE OR REPLACE keeps the grants, and the PUBLIC revoke is restated
-- because a recreated function can come back PUBLIC-executable.
REVOKE ALL ON FUNCTION public.get_open_substitution_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) IS 'Internal predicate: may this gedu be seated as the sub for this (group, date)? Five refusals: (1) not the absent gedu, (2) a certified gedu — the only eligibility test every path shares, with schedule clash deliberately left to a follow-up, (3) not already expected at that session, (4) holding no non-withdrawn request of their own on that (group, date), and (5) the session is not cancelled. Together (3) and (4) stop a sub covering their own substitute and stop two seats collapsing onto one person, which would make "who did which job" unanswerable. Asked by offer_session_substitution, again by approve_session_substitution_offer under the request''s lock, by set_session_substitution, and by get_open_substitution_requests as its exclusion — the pool list shows a gedu exactly the requests they could actually take, and never one on a cancelled session. Qualifications, spoken language and coverage are deliberately NOT clauses here: they gate only the paths a gedu starts (the pool and the offer, through gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site), while the admin writes that ask this predicate leave them to a warning in the UI. Not granted to `authenticated`.';

-- ---------------------------------------------------------------------------
-- 4. The session's product carries its tag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.session_product_document(p_product public.products) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',                   p_product.id,
    'product_type',         p_product.product_type,
    'tag',                  p_product.tag,
    'topic',                p_product.topic,
    'spoken_language_code', p_product.spoken_language_code,
    'timezone',             p_product.timezone,
    'is_remote',            p_product.is_remote,
    'start_date',           p_product.start_date,
    'end_date',             p_product.end_date,
    -- The venue, on in-person products only. The test is the remote flag and
    -- never the presence of a location: a remote municipality club carries a
    -- location_id (a municipality, by CHECK) and has no building.
    'site_name', (
      SELECT l.name
        FROM public.locations l
       WHERE l.id = p_product.location_id
         AND p_product.is_remote = false
    ),
    -- `description` is the short teaser; the output key predates the column's
    -- `short_description` name and every reader parses it under this one.
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
               ORDER BY pt.locale
             )
        FROM public.product_translations pt
       WHERE pt.product_id = p_product.id
    ), '[]'::jsonb),
    -- Slots and never an instant: the client owns the calendar maths on every
    -- surface, so the reader is handed the date's product, not its start.
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM public.schedule_slots ss
       WHERE ss.product_id = p_product.id
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.session_product_document(p_product public.products) IS 'Internal: the ONE description of the product a session belongs to, as every substitution surface states it — id, type, tag (null when untagged), topic, spoken language, timezone, the remote flag, the venue (site_name, the location''s name on an in-person product and null on a remote one, tested on is_remote because a remote municipality club still carries a location), the term dates, the translations (locale, name, and the short teaser as `description`) and the schedule slots. The type and tag are what the app reads the qualifications a session requires from. Called by get_open_substitution_requests, get_admin_substitution_requests and get_my_assigned_products, so the gedus'' pool, the admin Substitutions page and the sub''s own card on My SOG cannot disagree about the session, and a fact added here reaches all three. It carries NOTHING about a person, which is what makes it safe to share: who is absent, why, who offered and what the role pays stay in each reader''s own body under that reader''s own rules. Slots and never an instant — the client owns the calendar maths. SECURITY INVOKER and reached only from inside SECURITY DEFINER readers, so it reads as their owner; not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.session_product_document(p_product public.products) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. The people list carries each person's qualifications
-- ---------------------------------------------------------------------------

-- Restated whole because CREATE OR REPLACE VIEW can only append a column; the
-- new one goes last and every other line is unchanged.
CREATE OR REPLACE VIEW public.user_list_entries WITH (security_invoker = true) AS
 SELECT id,
    email,
    email_verified_at,
    first_name,
    last_name,
    role,
    phone,
    currency,
    home_location_id,
    utm_source,
    utm_medium,
    utm_campaign,
    locale,
    spoken_languages,
    created_at,
    updated_at,
    COALESCE(( SELECT gd.certified
           FROM public.gedu_profiles gd
          WHERE (gd.user_id = p.id)), false) AS certified,
    COALESCE(( SELECT gd.criminal_record_check_passed
           FROM public.gedu_profiles gd
          WHERE (gd.user_id = p.id)), false) AS criminal_record_check_passed,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'email', g.email, 'email_verified_at', g.email_verified_at, 'role', g.role, 'created_at', g.created_at, 'sign_in', gpr.sign_in) ORDER BY g.created_at, g.id) AS jsonb_agg
           FROM ((public.parent_gamer pg
             JOIN public.profiles g ON ((g.id = pg.gamer_id)))
             LEFT JOIN public.gamer_profiles gpr ON ((gpr.user_id = g.id)))
          WHERE (pg.parent_id = p.id)), '[]'::jsonb) AS linked_gamers,
    concat_ws(' '::text, first_name, last_name, email, phone, ( SELECT mc.minecraft_username
           FROM public.minecraft_accounts mc
          WHERE (mc.user_id = p.id)), ( SELECT rb.roblox_username
           FROM public.roblox_accounts rb
          WHERE (rb.user_id = p.id)), ( SELECT string_agg(concat_ws(' '::text, g.first_name, g.last_name, g.email, g.phone, gmc.minecraft_username, grb.roblox_username), ' '::text) AS string_agg
           FROM (((public.parent_gamer pg
             JOIN public.profiles g ON ((g.id = pg.gamer_id)))
             LEFT JOIN public.minecraft_accounts gmc ON ((gmc.user_id = g.id)))
             LEFT JOIN public.roblox_accounts grb ON ((grb.user_id = g.id)))
          WHERE (pg.parent_id = p.id))) AS family_search_blob,
    registration_completed_at,
    ARRAY( SELECT gq.qualification
           FROM public.gedu_qualifications gq
          WHERE (gq.gedu_id = p.id)
          ORDER BY gq.qualification) AS qualifications
   FROM public.profiles p
  WHERE ((role <> 'gamer'::public.user_role) OR (NOT (EXISTS ( SELECT 1
           FROM public.parent_gamer pg
          WHERE (pg.gamer_id = p.id)))));

COMMENT ON VIEW public.user_list_entries IS 'One row per entry of the admin user list: every non-gamer profile, plus any gamer with no parent link. A linked gamer is not a row — it rides inside its parent''s linked_gamers array, so the parent-child collapse happens in the database rather than in the browser from two whole-table reads. Carries every profiles column, the two gedu standing flags, the gedu''s qualifications, the children as JSON, and a family-wide search blob, so a page of 25 rows is one request and nothing a row renders needs a keyed follow-up read. SECURITY INVOKER, so RLS on profiles, parent_gamer, gamer_profiles, gedu_profiles, gedu_qualifications, minecraft_accounts and roblox_accounts governs it exactly as a direct read of those tables would — which also means a role granted SELECT here must hold SELECT on all seven, and that a caller who cannot see a link sees the child as a top-level row rather than as somebody''s. The FROM names one table and every derived value is a scalar subquery on purpose: that is what lets the newest page be an ordered index scan under a LIMIT, evaluating the children and the blob for the 25 rows it returns rather than for the whole table, and what lets an exact count skip them entirely. A join in the FROM would cost both.';

COMMENT ON COLUMN public.user_list_entries.qualifications IS 'The gedu qualifications this person holds, in the enum''s declared order, from gedu_qualifications; an empty array for anyone holding none, never NULL. Carried here, beside certified, because the admin gedu picker warns on a row lacking what the product being staffed requires.';

-- ---------------------------------------------------------------------------
-- 6. Qualifications gate something now
-- ---------------------------------------------------------------------------

COMMENT ON TYPE public.gedu_qualification IS 'A qualification an admin grants a game educator. neuroinclusive: qualified to run groups in products tagged neuroinclusive (product_tag). consumer_products: cleared to run the products families pay for themselves, which are the consumer_club, camp and event product types, everything except municipality_club. The name is broader than "consumer" on purpose: in this codebase "consumer" alone means the consumer_club product type, and this qualification also covers camps and events. What a product requires is product_required_qualifications. A gedu lacking one cannot see or offer on a substitution request for such a product; an admin assigning or seating them is warned and may proceed. The app lists them in the order declared here, so a new value goes where it should appear.';

COMMENT ON TABLE public.gedu_qualifications IS 'The qualifications each game educator holds: a row means the gedu holds that qualification, and no row means they do not. Latest state only, with no history: revoking a qualification deletes its row. Keyed to gedu_profiles, so only an account carrying the gedu extension row can hold one, and the qualifications go with that row. Written only by set_gedu_qualification; authenticated holds SELECT alone, an admin reading every row and a gedu their own. Read by gedu_holds_session_qualifications, which gates the substitution pool and offers, and carried on user_list_entries for the admin picker''s warning.';

COMMENT ON COLUMN public.profiles.spoken_languages IS 'Human languages the user speaks, as public.spoken_language values. Used for matching gamers/gedus to clubs; for a gedu it is also a substitution requirement — gedu_speaks_session_language keeps a request out of their pool, and refuses their offer, unless the session''s product is run in one of these. Distinct from locale, which controls UI translation. The enum guarantees every entry is a language we offer; the BEFORE trigger on this column is what guarantees no entry appears twice.';

COMMENT ON TABLE public.gedu_locations IS 'A gedu''s coverage areas: one row per tick, each an independent "I cover this whole subtree" claim on a locations row — ticking a region does not tick its municipalities, and nothing enumerates descendants. No rows means the gedu works remotely only. Read by gedu_covers_product_site, which keeps an in-person substitution request out of a gedu''s pool, and refuses their offer, unless one of their ticks is the session''s site or a place above it; online sessions do not depend on it.';

-- ---------------------------------------------------------------------------
-- 7. The admin picker asks the same predicate
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_gedus_covering_product(p_product_id uuid) RETURNS uuid[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN ARRAY(
    SELECT pr.id
      FROM public.profiles pr
     WHERE pr.role = 'gedu'::public.user_role
       AND public.gedu_covers_product_site(pr.id, p_product_id)
     ORDER BY pr.id
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) IS 'Admin-only: the ids of every gedu who covers this product''s site, by gedu_covers_product_site — so the admin gedu picker''s "outside their coverage areas" warning and the gedus'' substitution pool answer from one statement, and the app carries no copy of the tree walk. On an online product that is every gedu, because an online product has no coverage requirement; the picker does not ask about one. Empty for an unknown product. A set rather than a column of the people list because the answer depends on the product being staffed, which a view row cannot be asked about.';

REVOKE ALL ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) TO service_role;
