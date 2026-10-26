--
-- Name: session_product_document(public.products); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_product_document(p_product public.products) RETURNS jsonb
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
    'delivery_mode',        p_product.delivery_mode,
    'voice_room_mode',      p_product.voice_room_mode,
    'external_voice_url',   p_product.external_voice_url,
    'start_date',           p_product.start_date,
    'end_date',             p_product.end_date,
    -- The venue, on in-person and hybrid products. The test is the delivery
    -- mode and never the presence of a location: an online municipality club carries a
    -- location_id (a municipality, by CHECK) and has no building.
    'site_name', (
      SELECT l.name
        FROM public.locations l
       WHERE l.id = p_product.location_id
         AND p_product.delivery_mode <> 'online'
    ),
    -- `description` is the short teaser; the output key predates the column's
    -- `short_description` name and every reader parses it under this one.
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description,
                 'voice_join_instructions', pt.voice_join_instructions
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


--
-- Name: FUNCTION session_product_document(p_product public.products); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.session_product_document(p_product public.products) IS 'Internal: the ONE description of the product a session belongs to, as every substitution surface states it — id, type, tag (null when untagged), topic, spoken language, timezone, the delivery mode (online, in_person or hybrid), how the sessions are joined (voice_room_mode, with external_voice_url, set only when that mode is external), the venue (site_name, the location''s name on an in-person or hybrid product and null on an online one, tested on delivery_mode because an online municipality club still carries a location), the term dates, the translations (locale, name, the short teaser as `description`, and voice_join_instructions, that locale''s join instructions when the mode is none and null otherwise) and the schedule slots. The type and tag are what the app reads the qualifications a session requires from. Called by get_open_substitution_requests, get_admin_substitution_requests and get_my_assigned_products, so the gedus'' pool, the admin Substitutions page and the sub''s own card on My SOG cannot disagree about the session, and a fact added here reaches all three. It carries NOTHING about a person, which is what makes it safe to share: who is absent, why, who offered and what the role pays stay in each reader''s own body under that reader''s own rules. Slots and never an instant — the client owns the calendar maths. SECURITY INVOKER and reached only from inside SECURITY DEFINER readers, so it reads as their owner; not granted to `authenticated`.';


--
-- Name: FUNCTION session_product_document(p_product public.products); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.session_product_document(p_product public.products) FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_product_document(p_product public.products) TO service_role;


