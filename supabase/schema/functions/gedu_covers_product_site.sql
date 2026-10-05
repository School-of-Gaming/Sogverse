--
-- Name: gedu_covers_product_site(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH RECURSIVE
  product AS (
    SELECT p.is_remote, p.location_id
      FROM public.products p
     WHERE p.id = p_product_id
  ),
  -- The site and every place above it. A tick is an "I cover this subtree"
  -- claim, so a tick on any of these covers the site. The depth bound is a
  -- belt-and-braces stop on a tree the schema does not forbid a cycle in
  -- beyond a row parenting itself.
  lineage AS (
    SELECT l.id, l.parent_id, 0 AS depth
      FROM public.locations l
      JOIN product ON l.id = product.location_id
     UNION ALL
    SELECT l.id, l.parent_id, w.depth + 1
      FROM lineage w
      JOIN public.locations l ON l.id = w.parent_id
     WHERE w.depth < 16
  )
  SELECT EXISTS (SELECT 1 FROM product WHERE product.is_remote)
      OR EXISTS (
           SELECT 1
             FROM lineage
             JOIN public.gedu_locations gl ON gl.location_id = lineage.id
            WHERE gl.gedu_id = p_gedu_id
         );
$$;


--
-- Name: FUNCTION gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) IS 'Internal predicate: does this gedu cover this product''s site? True for an online product (is_remote), which has no coverage requirement — even an online municipality club, which carries a location. For an in-person product, true when one of the gedu''s gedu_locations ticks is the product''s site or any place above it, because a tick claims its whole subtree; a gedu who has ticked nothing therefore covers no in-person product. False for an unknown product. The third sibling of gedu_holds_session_qualifications and gedu_speaks_session_language, asked on the same gedu paths for the same reasons — by get_open_substitution_requests as its exclusion and by offer_session_substitution as a refusal with its own message — and deliberately NOT by gedu_may_substitute_session, because an admin seating, approving or assigning a gedu who does not cover the site is warned in the UI and may proceed. Also the whole of get_gedus_covering_product, the admin picker''s read, so the warning and the pool answer from one statement. Keyed by product rather than group, unlike the siblings, because the picker asks it of a product. SECURITY INVOKER and reached only from inside SECURITY DEFINER callers; not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) TO service_role;


