--
-- Name: get_klaviyo_events(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) RETURNS TABLE(event_id uuid, kind public.klaviyo_event_kind, unique_id text, customer_id uuid, occurred_at timestamp with time zone, properties jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT e.id,
         e.kind,
         e.unique_id,
         e.customer_id,
         e.occurred_at,
         e.facts || jsonb_build_object(
           'source_id', e.source_id,
           'product',   CASE
                          WHEN e.product_id IS NULL THEN NULL
                          ELSE public.klaviyo_product_document(e.product_id)
                        END
         )
    FROM public.klaviyo_event_outbox e
    JOIN public.profiles p ON p.id = e.customer_id
   WHERE e.id = ANY (p_event_ids)
     AND p.role = 'customer'::public.user_role;
$$;


--
-- Name: FUNCTION get_klaviyo_events(p_event_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) IS 'The named Klaviyo events, ready to send: event_id, kind, unique_id (the outbox row''s, which Klaviyo deduplicates on), the parent, occurred_at (the source row''s own moment) and properties — the facts recorded when the event was filed (klaviyo_event_outbox.facts says which, per kind) plus source_id and product (klaviyo_product_document, null when the event names none or the product is gone). An event whose parent is no longer a parent is left out, and the sync finishes it unsent. Service role only.';


--
-- Name: FUNCTION get_klaviyo_events(p_event_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) TO service_role;


