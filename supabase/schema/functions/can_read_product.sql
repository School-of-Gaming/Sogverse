--
-- Name: can_read_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- EXISTS is already total — it answers true or false and never NULL — so the
  -- COALESCE is belt and braces: it is what keeps the predicate a total boolean
  -- if an arm that can answer NULL is ever added back. The arm that made it
  -- load-bearing (comparing a caller's role, which is NULL for anon) is gone.
  SELECT COALESCE(
    EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = p_product_id),
    false
  );
$$;


--
-- Name: FUNCTION can_read_product(p_product_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS 'Read predicate behind the products SELECT policy and the six satellite tables that defer to it: translations, prices, schedule slots, marketing consents, gamer photo consents, required consents. True for ANY product that exists; false only for an id no product has. Every product is readable by direct link forever, by owner decision (2026-09-15): a parent following a link to a term that ended should land on the product''s page and read that it is over, with the product''s own picture in the link preview, rather than meet a not-found page and the site''s default card — and the crawler that renders that preview holds no session either. is_visible governs LISTING alone — the browse queries apply it, alongside their own date filters — so a finished or unlisted product is absent from the shop and present at its URL. Whether a place can be BOUGHT is decided somewhere else entirely: the term dates, the seat cap and the registration window. The former arms — an admin, a party to an active or waitlisted participation, an assigned gedu, and the term test that used to bound the public one — are removed rather than left dormant: with the public answer true for every product none of them could decide anything, and a security predicate whose branches cannot decide is one the next reader has to reason about for nothing. It remains a function rather than a USING (true) written into each policy, so those seven policies keep ONE predicate to tighten if the decision is ever revisited, and it remains SECURITY DEFINER because it runs inside the products SELECT policy and must not depend on the caller''s own RLS. Wrapped in COALESCE so it answers a total boolean whatever a future arm returns.';


--
-- Name: FUNCTION can_read_product(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_read_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO service_role;


