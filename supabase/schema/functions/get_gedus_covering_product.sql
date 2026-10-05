--
-- Name: get_gedus_covering_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: FUNCTION get_gedus_covering_product(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) IS 'Admin-only: the ids of every gedu who covers this product''s site, by gedu_covers_product_site — so the admin gedu picker''s "outside their coverage areas" warning and the gedus'' substitution pool answer from one statement, and the app carries no copy of the tree walk. On an online product that is every gedu, because an online product has no coverage requirement; the picker does not ask about one. Empty for an unknown product. A set rather than a column of the people list because the answer depends on the product being staffed, which a view row cannot be asked about.';


--
-- Name: FUNCTION get_gedus_covering_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_gedus_covering_product(p_product_id uuid) TO service_role;


