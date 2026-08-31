-- The admin session document carries the photos too.
--
-- 00222 gave every session on `get_gedu_group_feed` an `images` array and said,
-- in its own header, that "the admin group surface reads the gedu document, so
-- there is no third document to widen". That is true of the admin GROUP DETAILS
-- page and false of the page above it: the admin PRODUCT page's Sessions panel
-- reads `get_admin_product_sessions`, which builds its own session objects — a
-- product-keyed envelope carrying every group at once, so that the product
-- shell and the site do not travel once per group.
--
-- That second document is the third one, and it was missed. Its session shape
-- is deliberately `get_gedu_group_feed`'s VERBATIM, because one card component
-- renders both and its wire contract states the requirement structurally: the
-- admin schema imports the gedu session schema rather than restating it. So the
-- moment `images` became required on the gedu session, the admin document
-- stopped parsing — not a rendering fault but a hard refusal, the whole panel
-- gone, and the db test that parses real RPC output through that schema failing
-- with it.
--
-- The fix is the widening 00222 would have carried had the document been
-- noticed: the SAME aggregate, keyed the same way, ordered the same way, empty
-- array when there are none. Anything else would reintroduce the drift the
-- shared schema exists to prevent — two documents disagreeing about what a
-- session is, one column at a time.
--
-- No versioned name here, and no deploy-window step. That question is decided
-- by whether the READER'S schema is strict, and this one is not: it is the gedu
-- session schema, which is tolerant of unknown keys, inside an envelope that is
-- equally tolerant. The still-deployed app during the release window ignores a
-- key it has never heard of, exactly as it does on the gedu feed. Only the
-- family document, whose schema is `.strict()` at every level, needed
-- `get_my_family_product_feed_v2`.
--
-- The function is otherwise recreated from its current definition unchanged,
-- and its grants and comment are re-issued rather than assumed: CREATE OR
-- REPLACE preserves the ACL, but a recreated function has been observed coming
-- back PUBLIC-executable on staging (00172).

CREATE OR REPLACE FUNCTION public.get_admin_product_sessions(p_product_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_product jsonb;
  v_site    jsonb;
  v_groups  jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The schedule parameters and nothing else. The page already holds the
  -- product row from the admin product read; what it cannot get from there is
  -- the slot list in the shape the client's calendar walk takes, which is why
  -- these four fields travel and the rest do not.
  SELECT jsonb_build_object(
    'id',         p.id,
    'timezone',   p.timezone,
    'start_date', p.start_date,
    'end_date',   p.end_date,
    'is_remote',  p.is_remote,
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
  WHERE p.id = p_product_id;

  -- The venue, on in-person products only — the same test
  -- `get_gedu_group_feed` makes, and for the same reason: a remote municipality
  -- club carries a location_id (a municipality, by CHECK), so "has a location"
  -- would put a door code and a caretaker's name on a club with no building.
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
  LEFT JOIN public.site_details sd        ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = p_product_id
    AND p.is_remote = false;

  -- Ordered by (created_at, id), which is the order the groups panel on the
  -- same page lists them in. The group selector sits directly above that panel;
  -- two orders on one page would be a bug the reader has to notice.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'created_at', entry->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',          g.id,
        'name',        g.name,
        'created_at',  g.created_at,
        'public_note', g.public_note,
        'gedu_note',   g.gedu_note,

        -- Register-shaped and nothing more: who may be marked, and what to call
        -- them. See 00200's header for why it is not the group feed's roster.
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id', part.participant_id,
                   'first_name',     gmp.first_name
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp ON gmp.id = part.participant_id
           WHERE part.group_id = g.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb),

        -- Every stored row for the group, in the SAME shape
        -- `get_gedu_group_feed` emits — the two are read by one card component
        -- and must not disagree about what a session is. An orphan the schedule
        -- no longer projects is history and travels too.
        'sessions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',                s.id,
                   'session_date',      s.session_date,
                   'starts_at',         s.starts_at,
                   'ends_at',           s.ends_at,
                   'report',            s.report,
                   'gedu_note',         s.gedu_note,
                   'created_at',        s.created_at,
                   'updated_at',        s.updated_at,
                   'created_by',        s.created_by,
                   'updated_by',        s.updated_by,
                   -- When the report was mailed to the families, NULL until it
                   -- was. Its audit partner `report_emailed_by` stays off the
                   -- wire here exactly as it does on the gedu feed.
                   'report_emailed_at', s.report_emailed_at,
                   -- The session's LAST EDITOR, not the report's author. An
                   -- admin who corrects one tick is named here, which is what
                   -- the chip on the card claims and is true.
                   'updated_by_first_name', (
                     SELECT pr.first_name
                       FROM public.profiles pr
                      WHERE pr.id = s.updated_by
                   ),
                   -- The session's photos (00222, reaching this document in
                   -- 00223). Byte-for-byte the gedu feed's aggregate, because
                   -- one card component renders both: {id, width, height} per
                   -- photo, ordered by (created_at, id) — the stamp is
                   -- clock_timestamp() taken under the session row's lock and
                   -- the id breaks a sub-tick tie, so every surface draws the
                   -- same order — and an empty array rather than a null when
                   -- there are none. `created_by` is deliberately off the wire,
                   -- for the same reason `report_emailed_by` above is: it is
                   -- safeguarding audit, it gates nothing and nothing renders
                   -- it. The URL is derived from the id by one helper rather
                   -- than stored.
                   'images', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'id',     img.id,
                              'width',  img.width,
                              'height', img.height
                            ) ORDER BY img.created_at, img.id)
                       FROM public.group_session_images img
                      WHERE img.session_id = s.id
                   ), '[]'::jsonb),
                   -- Sparse map keyed by participant id. A roster member absent
                   -- from it is UNMARKED, which is not 'absent'.
                   'attendance', COALESCE((
                     SELECT jsonb_object_agg(a.participant_id, a.status)
                       FROM public.session_attendance a
                      WHERE a.session_id = s.id
                   ), '{}'::jsonb)
                 ) ORDER BY s.session_date DESC)
            FROM public.group_sessions s
           WHERE s.group_id = g.id
        ), '[]'::jsonb)
      ) AS entry
        FROM public.product_groups g
       WHERE g.product_id = p_product_id
    ) AS group_rows;

  RETURN jsonb_build_object(
    'product', v_product,
    'site',    v_site,
    'groups',  v_groups
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_product_sessions(p_product_id uuid) IS
  'One round trip behind the admin product page''s Sessions panel: the '
  'product''s schedule parameters, its venue and site notes on an in-person '
  'product, and every group on it with its standing notes, its register roster '
  'and every stored session row with a sparse attendance map and, since 00223, '
  'its photos. Admin-only, guard-first on assert_admin. Product-keyed rather '
  'than group-keyed because the page shows one product and puts a group '
  'selector in front of the feed; asking per group would send the product shell '
  'and the site over the wire once per group. Contains no schedule expansion — '
  'the client owns the calendar math, exactly as it does for the gedu feed. The '
  'SESSION shape is get_gedu_group_feed''s verbatim, because one card component '
  'renders both and the two must not disagree about what a session is — which '
  'is why `images` ({id, width, height} per photo, ordered by (created_at, id), '
  'never the uploader) arrives here in the same shape and needs no versioned '
  'name: this document''s reader shares the gedu session''s tolerant schema, '
  'and only the strict family one needed get_my_family_product_feed_v2. The '
  'ROSTER deliberately is not the gedu feed''s — it carries participant_id and '
  'first_name alone, since the only thing this surface does with it is take the '
  'register, and the groups panel on the same page already answers who these '
  'people are.';

-- CREATE OR REPLACE preserves the ACL, but a recreated function has been
-- observed coming back PUBLIC-executable on staging (00172), so the revoke and
-- the per-role grants are re-issued rather than assumed.
REVOKE EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) TO service_role;
