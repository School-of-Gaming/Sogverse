-- Two review findings on the gedu session feed, both about a staff-only value
-- sitting somewhere the wrong people can reach it.
--
-- 1. THE LESSON-MATERIAL LINK WAS PUBLICLY READABLE.
--
--    00138 added `material_url` as a column on `public.products`. That table
--    carries `GRANT SELECT TO anon` and a policy that exposes every published,
--    visible product, and PostgREST lets a caller name the columns it wants —
--    so `?select=material_url` handed the gedu-only lesson link to anonymous
--    visitors and to every parent. The comment on the column said "families
--    must never see this"; nothing enforced it.
--
--    A comment cannot be a permission. The fix is the shape the venue notes
--    already use: the staff-only field moves to its own table with its own RLS,
--    so the read grant on `products` cannot reach it however the query is
--    written. `site_staff_details` is the pattern being copied.
--
-- 2. `set_site_notes` ACCEPTED THE VENUE ADDRESS.
--
--    The gedu workspace renders the address read-only and posted its own cached
--    copy back on every note save. Two consequences, one accidental and one
--    not: a gedu saving a note over a stale cache silently reverted an admin's
--    address correction, and any assigned gedu could simply rewrite the address
--    outright by calling the RPC with one of their own.
--
--    The address belongs to the location record and is an admin's to edit. The
--    RPC stops taking it: three parameters, and the existing address is
--    preserved untouched on every write.

-- ---------------------------------------------------------------------------
-- 1. product_staff_details — the staff-only half of a product
-- ---------------------------------------------------------------------------
--
-- Keyed by product_id, which is both the primary key and the foreign key: a
-- product has at most one row here, and the row dies with the product. Rows are
-- SPARSE — a product with no lesson link has no row at all, which is what keeps
-- "nothing recorded" from becoming a stored value.
--
-- The table is deliberately named for the tier rather than for the column, so
-- the next staff-only product field lands here instead of back on `products`
-- where a read grant can find it.
CREATE TABLE public.product_staff_details (
  product_id   uuid PRIMARY KEY
                 REFERENCES public.products(id) ON DELETE CASCADE,
  -- A link to the lesson plans a gedu teaches from, rendered as a button in the
  -- group workspace masthead. NOT a rename of products.padlet_url and never
  -- backfilled from it: the Padlet held family-facing session notes, while this
  -- is lesson content families must never see.
  material_url text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_staff_details IS
  'Admin + gedu only facts about a product, split off `products` because that table is anon-readable by column selection. One sparse row per product; a product with nothing staff-only recorded has no row. Reached by families through no path at all: admins read and write it under an admin-only RLS policy, gedus see only what get_gedu_group_feed hands them.';

COMMENT ON COLUMN public.product_staff_details.material_url IS
  'Gedu/admin-only lesson-material link, surfaced in the gedu group workspace. Never rendered to parents or gamers. Distinct from products.padlet_url, which is the (legacy) family-facing link.';

CREATE TRIGGER product_staff_details_updated_at
  BEFORE UPDATE ON public.product_staff_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_staff_details ENABLE ROW LEVEL SECURITY;

-- Admins only, both directions. `create_product` / `update_product` are SECURITY
-- INVOKER and guard with assert_admin, so the row is written by the ADMIN'S OWN
-- client — which is why `authenticated` needs the table privileges below and why
-- this policy is what actually decides who gets through.
--
-- WITH CHECK authorizes the target as well as the actor: the row must name a
-- product that exists. The foreign key says the same thing, and stating it here
-- too costs one EXISTS on a write path that runs once per product edit — worth
-- it, because a policy that authorizes only the actor is the exact shape of the
-- IDOR hole the house rule is written against, and "the FK covers it" is the
-- reasoning that stops being true the first time somebody relaxes the FK.
CREATE POLICY admin_full_access_product_staff_details
  ON public.product_staff_details FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK (
    (SELECT public.is_admin())
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id)
  );

-- Nothing is granted by default. `anon` gets nothing at all — not even SELECT,
-- which is the whole reason this table exists. Gedus are not granted anything
-- either: they read the material link through get_gedu_group_feed, which is
-- SECURITY DEFINER and hands back only the product they are assigned to.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_staff_details TO authenticated;
GRANT ALL                            ON TABLE public.product_staff_details TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Move the existing values across, then drop the column
-- ---------------------------------------------------------------------------
--
-- Sparse on the way in: a blank string was never meant to be a link, so it
-- becomes no row rather than a row holding ''.
INSERT INTO public.product_staff_details (product_id, material_url)
SELECT p.id, btrim(p.material_url)
  FROM public.products p
 WHERE NULLIF(btrim(COALESCE(p.material_url, '')), '') IS NOT NULL;

ALTER TABLE public.products DROP COLUMN material_url;

-- ---------------------------------------------------------------------------
-- 3. get_gedu_group_feed reads the link from its new home
-- ---------------------------------------------------------------------------
--
-- The returned JSON shape does NOT change — `product.material_url` is still
-- there, still gedu-only, and the wire contract on the TypeScript side is
-- untouched. Only where the value is fetched from moves. LEFT JOIN because the
-- row is sparse: a product with no lesson link has no row, and that must read as
-- a null link rather than as a product with no name.
CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- v1 shows a gedu only their OWN group's feed. Peer-group feeds are not a
  -- schema restriction — relaxing this to "any group on a product the caller is
  -- assigned to" is a change to this predicate alone, and nothing downstream
  -- assumes the caller teaches the group they are reading.
  IF NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and now stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell a child who joined last week from one who has been
  -- here all term.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'gamer_id',           part.gamer_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so this is non-null in practice and the wire contract says so.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.gamer_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        )
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.gamer_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.gamer_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.gamer_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'did_not_run',      s.did_not_run,
        'needs_substitute', s.needs_substitute,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- Sparse map keyed by gamer id. A roster member absent from this object
        -- is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.gamer_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(uuid) IS
  'One round trip for a gedu group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map. Contains no schedule expansion — the client owns the calendar math.';

-- ---------------------------------------------------------------------------
-- 4. create_product / update_product write the new table
-- ---------------------------------------------------------------------------
--
-- Signatures are unchanged — both still take `p_material_url` — so these are
-- CREATE OR REPLACE and the existing grants survive. Only the destination of
-- that one parameter moves.
--
-- Empty means NO ROW, consistently in both: create writes a row only when there
-- is a link, and update deletes the row when the link is cleared. So "no lesson
-- material" is always the absence of a record and never a row holding NULL,
-- which is the same convention the session tables use for an unrecorded mark.

CREATE OR REPLACE FUNCTION public.create_product(
  p_product_type            public.product_type,
  p_billing_mode            public.billing_mode,
  p_translations            jsonb,
  p_topic                   public.product_topic,
  p_min_age                 integer,
  p_max_age                 integer,
  p_spoken_language_code    text,
  p_is_remote               boolean,
  p_timezone                text,
  p_registration_opens_at   timestamp with time zone,
  p_status                  public.product_status DEFAULT 'draft'::public.product_status,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_refund_policy_days      integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents   integer       DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents   integer       DEFAULT NULL,
  p_material_url             text          DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $function$
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

  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents
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
      NULLIF(v_translation->'long_description', 'null'::jsonb)
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

  RETURN v_product_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_product(
  p_id                      uuid,
  p_billing_mode            public.billing_mode,
  p_translations            jsonb,
  p_topic                   public.product_topic,
  p_min_age                 integer,
  p_max_age                 integer,
  p_spoken_language_code    text,
  p_is_remote               boolean,
  p_timezone                text,
  p_registration_opens_at   timestamp with time zone,
  p_is_visible              boolean        DEFAULT false,
  p_waitlist_enabled        boolean        DEFAULT true,
  p_image_path              text           DEFAULT NULL,
  p_padlet_url              text           DEFAULT NULL,
  p_location_id             uuid           DEFAULT NULL,
  p_signup_threshold        integer        DEFAULT NULL,
  p_start_date              date           DEFAULT NULL,
  p_end_date                date           DEFAULT NULL,
  p_seat_count              integer        DEFAULT NULL,
  p_refund_policy_days      integer        DEFAULT NULL,
  p_schedule_slots          jsonb          DEFAULT NULL,
  p_prices                  jsonb          DEFAULT NULL,
  p_holiday_calendar_ids    uuid[]         DEFAULT NULL,
  p_primary_gedu_fee_cents   integer       DEFAULT NULL,
  p_assistant_gedu_fee_cents integer       DEFAULT NULL,
  p_municipality_fee_cents   integer       DEFAULT NULL,
  p_material_url             text          DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    spoken_language_code     = p_spoken_language_code,
    image_path               = p_image_path,
    padlet_url               = p_padlet_url,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    refund_policy_days       = p_refund_policy_days,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents
  WHERE id = p_id;

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
      NULLIF(v_translation->'long_description', 'null'::jsonb)
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

  RETURN p_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. set_site_notes stops taking the address
-- ---------------------------------------------------------------------------
--
-- Dropping a parameter changes the signature, so this is DROP + CREATE + GRANT
-- rather than a replace (and the DROP takes the old grants with it).
--
-- WHAT THE 4-PARAMETER VERSION COST. The workspace shows the address read-only
-- and posted its cached copy back with every note save, so a gedu writing a note
-- against a page loaded before an admin's address correction quietly reverted
-- it — no conflict, no error, no way to notice. And because the parameter was
-- simply written through, any assigned gedu could rewrite the venue address of
-- any building they teach at by calling the RPC directly. The address is
-- family-facing venue detail owned by the location record; a gedu note-taking
-- path has no business carrying it.
--
-- On first INSERT the address is left NULL, which is what "we have no address
-- for this site" already means everywhere else. The ON CONFLICT branch does not
-- name `address` at all, so an existing one survives every note save.
DROP FUNCTION public.set_site_notes(uuid, text, text, text);

CREATE FUNCTION public.set_site_notes(
  p_location_id uuid,
  p_public_note text,
  p_gedu_note text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_public_note text;
  v_gedu_note   text;
  v_address     text;
BEGIN
  PERFORM public.assert_role('gedu');

  IF NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND p.location_id  = p_location_id
       AND p.is_remote    = false
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, NULL, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    -- `address` is deliberately absent from this SET list: whatever an admin
    -- put there stays there.
    SET notes = EXCLUDED.notes
  RETURNING address INTO v_address;

  INSERT INTO public.site_staff_details (location_id, notes)
  VALUES (p_location_id, v_gedu_note)
  ON CONFLICT (location_id) DO UPDATE
    SET notes = EXCLUDED.notes;

  RETURN jsonb_build_object(
    'location_id', p_location_id,
    'address',     v_address,
    'public_note', v_public_note,
    'gedu_note',   v_gedu_note
  );
END;
$$;

COMMENT ON FUNCTION public.set_site_notes(uuid, text, text) IS
  'Write a site''s shared family note and its gedu note. The venue ADDRESS is not a parameter and is never touched — it belongs to the location record and is an admin''s to edit. Authorized by the caller teaching a group on an in-person product at that site. Last-write-wins on the notes, across products.';

REVOKE ALL ON FUNCTION public.set_site_notes(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_site_notes(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_site_notes(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. minecraft_accounts: revoke anon's SELECT
-- ---------------------------------------------------------------------------
--
-- The same dormant grant 00138 §9 removed from site_staff_details, found on a
-- second table while reviewing this one, and removed for the same reason.
--
-- `anon` holds a table-level SELECT on minecraft_accounts and nothing justifies
-- it. It leaks nothing today: every policy on the table names `TO authenticated`
-- (self-read, parent-of-linked-gamer, admin), so default-deny answers every anon
-- SELECT with zero rows. That is precisely why it is worth removing rather than
-- shrugging at — the grant is the standing half of the hole, and a single future
-- policy written without a TO clause (which defaults to PUBLIC) would arm it.
-- What sits behind it is children's gaming identities: usernames and the Mojang
-- UUIDs that resolve them.
REVOKE SELECT ON TABLE public.minecraft_accounts FROM anon;
-- Belt and braces, exactly as 00138 did it: a grant to PUBLIC would keep anon
-- reachable through the back door, and `has_table_privilege` (asserted below)
-- cannot tell the two apart. No PUBLIC table grant exists today, so this is a
-- no-op that stops the assertion failing for a reason nobody expected.
REVOKE SELECT ON TABLE public.minecraft_accounts FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 7. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Same reasoning as 00138's: several statements above assume the object they
-- touch is in the state this file expects, and a DROP or a REVOKE that matched
-- nothing is indistinguishable from one that did its job. Assert the end state
-- rather than trusting the branch — both halves, because the interesting failure
-- here is "the new thing exists AND the old one is still readable".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'products'
       AND column_name  = 'material_url'
  ) THEN
    RAISE EXCEPTION
      'products.material_url still exists — the staff-only link is still readable through the anon SELECT grant on products';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename  = 'product_staff_details'
       AND rowsecurity
  ) THEN
    RAISE EXCEPTION
      'product_staff_details is missing or has no row-level security';
  END IF;

  IF has_table_privilege('anon', 'public.product_staff_details', 'SELECT') THEN
    RAISE EXCEPTION
      'anon can SELECT product_staff_details — the table exists precisely so it cannot';
  END IF;

  IF has_table_privilege('anon', 'public.minecraft_accounts', 'SELECT') THEN
    RAISE EXCEPTION
      'anon still holds SELECT on minecraft_accounts — the REVOKE did not take';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public'
       AND pr.proname = 'set_site_notes'
       AND pr.pronargs <> 3
  ) THEN
    RAISE EXCEPTION
      'a set_site_notes overload taking something other than 3 arguments survives — the address-accepting version was not dropped';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public'
       AND pr.proname IN ('create_product', 'update_product', 'set_site_notes')
     GROUP BY pr.proname
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'one of create_product/update_product/set_site_notes has more than one overload';
  END IF;
END;
$$;
