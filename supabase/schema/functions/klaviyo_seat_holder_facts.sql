--
-- Name: klaviyo_seat_holder_facts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_seat_holder_facts(p_participant_id uuid, p_customer_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
           'seat_holder',      CASE WHEN p_participant_id = p_customer_id
                                    THEN 'parent' ELSE 'gamer' END,
           'gamer_birth_year', gp.birth_year,
           'gamer_gender',     gp.gender
         )
    FROM (SELECT 1) AS one
    LEFT JOIN public.gamer_profiles gp
      ON gp.user_id = p_participant_id
     AND p_participant_id <> p_customer_id;
$$;


--
-- Name: FUNCTION klaviyo_seat_holder_facts(p_participant_id uuid, p_customer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_seat_holder_facts(p_participant_id uuid, p_customer_id uuid) IS 'Who holds a seat, as a Klaviyo event records it: seat_holder (parent when the participant is the paying customer, gamer otherwise), and the gamer''s birth_year and gender as gamer_birth_year and gamer_gender — both null on a parent''s own seat. No name and no birth month. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_seat_holder_facts(p_participant_id uuid, p_customer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_seat_holder_facts(p_participant_id uuid, p_customer_id uuid) FROM PUBLIC;


