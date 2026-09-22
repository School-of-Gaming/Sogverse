--
-- Name: gedu_teaches_group_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_teaches_group_product(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One join, because gedu_group_assignments carries product_id alongside
  -- group_id: "any group of this group's product" is a single-table EXISTS
  -- rather than a walk back through products.
  SELECT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.gedu_group_assignments a ON a.product_id = g.product_id
     WHERE g.id = p_group_id
       AND a.gedu_id = (SELECT auth.uid())
  )
  -- The substitution branch is deliberately GROUP-ONLY, not product-wide. An
  -- assignment is a standing relationship with a product, which is what earns
  -- the cross-group mobility above; a substitution is one date on one group, and
  -- widening it to the product would hand a sub the member flair of every
  -- sibling group they were never asked to stand in for.
  OR public.gedu_substitutes_group(p_group_id);
$$;


--
-- Name: FUNCTION gedu_teaches_group_product(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) IS 'Internal predicate: is the caller a gedu assigned to ANY group of this group''s product? The same question gedu_teaches_group asks, widened from one group to the whole product — which is the cross-group mobility the member-flair RPCs need, because a substitute standing in for another group is exactly the person who needs the note. Gedu-only and composed with is_admin() at each call site, the dominant pattern in this schema. NOT exposed to authenticated: it is called from inside SECURITY DEFINER RPCs and from nowhere else — in particular from no RLS policy, which is what lets it stay private, since a policy predicate is evaluated as the querying role and would have forced a grant. is_voice_group_moderator computes the same thing with is_admin() folded in; it is deliberately left alone rather than reused or renamed, because the voice_zones and voice_private_zone_occupants policies reference it and its name would make a note read look like a voice concern. Since 00272 it additionally admits a LIVE SUBSTITUTION on the group, and the substitution arm is deliberately GROUP-only rather than product-wide: an assignment is a standing relationship with a product, which is what earns the cross-group mobility above, while a substitution is one date on one group, and widening it to the product would hand a sub the member flair of every sibling group they were never asked to stand in for.';


--
-- Name: FUNCTION gedu_teaches_group_product(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_teaches_group_product(p_group_id uuid) TO service_role;


