--
-- Name: product_list_facets; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.product_list_facets WITH (security_invoker='true') AS
 SELECT product_type,
    ( SELECT (count(*))::integer AS count
           FROM public.products p
          WHERE (p.product_type = t.product_type)) AS product_count,
    ARRAY( SELECT DISTINCT a.gedu_id
           FROM (public.gedu_group_assignments a
             JOIN public.products p ON ((p.id = a.product_id)))
          WHERE (p.product_type = t.product_type)
          ORDER BY a.gedu_id) AS gedu_ids,
    ARRAY( SELECT DISTINCT s.weekday
           FROM (public.schedule_slots s
             JOIN public.products p ON ((p.id = s.product_id)))
          WHERE (p.product_type = t.product_type)
          ORDER BY s.weekday) AS weekdays,
    ARRAY( SELECT DISTINCT p.spoken_language_code
           FROM public.products p
          WHERE (p.product_type = t.product_type)
          ORDER BY p.spoken_language_code) AS spoken_language_codes,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'name_i18n', m.name_i18n, 'type', m.type) ORDER BY m.id) AS jsonb_agg
           FROM public.locations m
          WHERE ((m.type = 'municipality'::public.location_type) AND (m.id IN ( SELECT
                        CASE
                            WHEN (l.type = 'municipality'::public.location_type) THEN l.id
                            ELSE l.parent_id
                        END AS parent_id
                   FROM (public.products p
                     JOIN public.locations l ON ((l.id = p.location_id)))
                  WHERE (p.product_type = t.product_type))))), '[]'::jsonb) AS municipalities
   FROM unnest(enum_range(NULL::public.product_type)) t(product_type);


--
-- Name: VIEW product_list_facets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.product_list_facets IS 'One row per product type for the admin product list: how many products of the type exist, and the values each of the list''s filters can offer under it (assigned gedus, schedule weekdays, spoken languages, municipalities). The list pages and filters its rows server-side, so this is where its type chips'' counts and its dropdown options come from — one request, bounded by the enum. SECURITY INVOKER, so the caller''s RLS on products, schedule_slots, gedu_group_assignments and locations decides every count and array exactly as a direct read of those tables would.';


--
-- Name: COLUMN product_list_facets.product_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_list_facets.product_count IS 'Every product of this type the caller can read, whatever the list''s filters say: the type chip''s count and the denominator of the list''s count line.';


--
-- Name: COLUMN product_list_facets.gedu_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_list_facets.gedu_ids IS 'The distinct gedus assigned to any group of any product of this type, ascending. Empty, never NULL.';


--
-- Name: COLUMN product_list_facets.weekdays; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_list_facets.weekdays IS 'The distinct weekdays (0 = Monday … 6 = Sunday, as schedule_slots stores them) any product of this type is scheduled on, ascending. Empty, never NULL.';


--
-- Name: COLUMN product_list_facets.spoken_language_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_list_facets.spoken_language_codes IS 'The distinct spoken languages products of this type are delivered in, in the enum''s declared order. Empty, never NULL.';


--
-- Name: COLUMN product_list_facets.municipalities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_list_facets.municipalities IS 'The municipalities products of this type sit in — the location itself when it is a municipality, else its parent when that is one — as a JSON array of objects carrying id, name, name_i18n and type. Empty array, never NULL.';


--
-- Name: TABLE product_list_facets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_list_facets TO authenticated;
GRANT SELECT ON TABLE public.product_list_facets TO service_role;


