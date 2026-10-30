--
-- Name: klaviyo_product_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_product_document(p_product_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
           'id',           p.id,
           'names',        COALESCE((
                             SELECT jsonb_agg(
                                      jsonb_build_object('locale', t.locale, 'name', t.name)
                                      ORDER BY t.locale
                                    )
                               FROM public.product_translations t
                              WHERE t.product_id = p.id
                           ), '[]'::jsonb),
           'topic',        p.topic,
           'product_type', p.product_type,
           'billing_mode', p.billing_mode,
           'delivery_mode', p.delivery_mode,
           'spoken_language_code', p.spoken_language_code,
           'location_name', (
                             SELECT l.name
                               FROM public.locations l
                              WHERE l.id = p.location_id
                           ),
           'start_date',   p.start_date,
           'end_date',     p.end_date,
           'timezone',     p.timezone
         )
    FROM public.products p
   WHERE p.id = p_product_id;
$$;


--
-- Name: FUNCTION klaviyo_product_document(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_product_document(p_product_id uuid) IS 'One product as Klaviyo is told about it: id, every name with its locale (the app picks the reader''s through resolveTranslation, never SQL), topic, product_type, billing_mode, delivery_mode, spoken_language_code, location_name (the location''s canonical name, null when the product has none), start_date, end_date and timezone. NULL for a product that does not exist. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_product_document(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_product_document(p_product_id uuid) FROM PUBLIC;


