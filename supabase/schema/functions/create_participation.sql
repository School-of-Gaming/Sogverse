--
-- Name: create_participation(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- legacy-checkout-session: kept for the deployment window.
  v_result := public.create_booking(
    p_product_id, p_participant_id, p_customer_id, p_purchase_shape, p_currency,
    p_consented_documents, p_utm_source, p_utm_medium, p_utm_campaign,
    p_utm_content, p_utm_term, p_school_of_gaming_marketing_opt_in
  );

  IF v_result->>'kind' = 'pending' THEN
    DELETE FROM public.bookings WHERE id = (v_result->>'booking_id')::uuid;
    RETURN jsonb_build_object('kind', 'validated');
  END IF;

  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) IS 'legacy-checkout-session: kept for the deployment window, for the checkout route from before bookings, and removed by the follow-up. Calls create_booking and returns its answer, with a paid shape''s kind=pending reported as kind=validated, after deleting the pending booking, because that route never learns its id and confirm_paid_participation writes its own; the required consents it recorded stay. So it answers as that route expects: kind=free_active or kind=external_active with participation_id, kind=full, or kind=validated. service_role only, on the footing create_booking states.';


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) TO service_role;


