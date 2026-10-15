-- The admin product list reads its facets.
--
-- WHAT THIS ADDS
--
-- product_list_facets: one row per product type, carrying how many products
-- of that type exist and the values each of the list's filters can offer
-- under it — the gedus seated on them, the weekdays their schedules use,
-- the spoken languages they are delivered in, and the municipalities they
-- sit in. The admin product list pages its rows one keyset page at a time and
-- filters them server-side, so it no longer holds every product in the
-- browser to count them or to build its dropdowns from; this is what it
-- reads instead, in one request bounded by construction (one row per enum
-- value).
--
-- A gedu is seated on a product when they hold a standing seat on any of its
-- groups: an assignment (primary or assistant) or a trainee seat. The list's
-- gedu filter matches either, so it offers either. A substitution is not a
-- seat, and a substitute is not offered.
--
-- A municipality is the product's location when that is a municipality, or
-- the location's parent when that is one — the two shapes the schema allows
-- a municipality club, and the same derivation the app applies to a row's
-- embedded location. Each carries its name, its per-locale names and its
-- type, so the app can label it without reading the locations table.
--
-- ACCESS
--
-- SECURITY INVOKER, so the caller's own RLS on products, schedule_slots,
-- gedu_group_assignments, gedu_group_trainees and locations decides every
-- count and every array exactly as a direct read of those tables would: a
-- gedu sees only their own seats, a parent no trainee seat at all, and
-- nothing here is wider than what the tables already hand the caller. Granted to authenticated (the admin page reads it with the
-- signed-in admin's token) and service_role; anon has no reader for it.

CREATE VIEW public.product_list_facets WITH (security_invoker = true) AS
SELECT
  t.product_type,
  (
    SELECT count(*)::integer
    FROM public.products p
    WHERE p.product_type = t.product_type
  ) AS product_count,
  ARRAY(
    SELECT DISTINCT seat.gedu_id
    FROM (
      SELECT a.gedu_id, a.product_id FROM public.gedu_group_assignments a
      UNION ALL
      SELECT tr.gedu_id, tr.product_id FROM public.gedu_group_trainees tr
    ) AS seat
    JOIN public.products p ON p.id = seat.product_id
    WHERE p.product_type = t.product_type
    ORDER BY seat.gedu_id
  ) AS gedu_ids,
  ARRAY(
    SELECT DISTINCT s.weekday
    FROM public.schedule_slots s
    JOIN public.products p ON p.id = s.product_id
    WHERE p.product_type = t.product_type
    ORDER BY s.weekday
  ) AS weekdays,
  ARRAY(
    SELECT DISTINCT p.spoken_language_code
    FROM public.products p
    WHERE p.product_type = t.product_type
    ORDER BY p.spoken_language_code
  ) AS spoken_language_codes,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'name', m.name,
          'name_i18n', m.name_i18n,
          'type', m.type
        )
        ORDER BY m.id
      )
      FROM public.locations m
      WHERE m.type = 'municipality'::public.location_type
        AND m.id IN (
          SELECT CASE
            WHEN l.type = 'municipality'::public.location_type THEN l.id
            ELSE l.parent_id
          END
          FROM public.products p
          JOIN public.locations l ON l.id = p.location_id
          WHERE p.product_type = t.product_type
        )
    ),
    '[]'::jsonb
  ) AS municipalities
FROM unnest(enum_range(NULL::public.product_type)) AS t(product_type);

COMMENT ON VIEW public.product_list_facets IS 'One row per product type for the admin product list: how many products of the type exist, and the values each of the list''s filters can offer under it (seated gedus, schedule weekdays, spoken languages, municipalities). The list pages and filters its rows server-side, so this is where its type chips'' counts and its dropdown options come from — one request, bounded by the enum. SECURITY INVOKER, so the caller''s RLS on products, schedule_slots, gedu_group_assignments, gedu_group_trainees and locations decides every count and array exactly as a direct read of those tables would.';

COMMENT ON COLUMN public.product_list_facets.product_count IS 'Every product of this type the caller can read, whatever the list''s filters say: the type chip''s count and the denominator of the list''s count line.';

COMMENT ON COLUMN public.product_list_facets.gedu_ids IS 'The distinct gedus holding a standing seat — an assignment or a trainee seat — on any group of any product of this type, ascending. Empty, never NULL.';

COMMENT ON COLUMN public.product_list_facets.weekdays IS 'The distinct weekdays (0 = Monday … 6 = Sunday, as schedule_slots stores them) any product of this type is scheduled on, ascending. Empty, never NULL.';

COMMENT ON COLUMN public.product_list_facets.spoken_language_codes IS 'The distinct spoken languages products of this type are delivered in, in the enum''s declared order. Empty, never NULL.';

COMMENT ON COLUMN public.product_list_facets.municipalities IS 'The municipalities products of this type sit in — the location itself when it is a municipality, else its parent when that is one — as a JSON array of objects carrying id, name, name_i18n and type. Empty array, never NULL.';

GRANT SELECT ON TABLE public.product_list_facets TO authenticated;
GRANT SELECT ON TABLE public.product_list_facets TO service_role;
