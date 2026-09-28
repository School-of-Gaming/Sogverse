--
-- Name: set_product_required_consents(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused rather than repaired. Without this the DELETE
  -- below matches nothing — `document_slug = ANY (array containing NULL)` is
  -- NULL for every row that does not match, and `NOT NULL` is NULL — so a
  -- wipe-and-replace silently degrades into a merge, and the INSERT then dies
  -- on the NOT NULL with an error that says nothing about which argument was
  -- wrong. NULL as the whole array still means "requires nothing"; it is only a
  -- NULL *element* that is meaningless.
  IF EXISTS (SELECT 1 FROM unnest(p_slugs) AS s WHERE s IS NULL) THEN
    RAISE EXCEPTION
      'the required-consent slug list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOT EXISTS rather than `NOT (document_slug = ANY (...))`, for the same
  -- reason record_required_consents uses it: two-valued, so the set really is
  -- replaced whatever the array holds. The guard above already refuses the one
  -- input that made the difference; this is the second lock.
  DELETE FROM public.product_required_consents
   WHERE product_id = p_product_id
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_slugs, ARRAY[]::text[])) AS s
        WHERE s = document_slug
     );

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair above and below is a *set* replacement, and leaving an unchanged row
  -- in place keeps the delete from churning rows an admin did not touch. A slug
  -- the whitelist has never heard of is refused by the foreign key, which is
  -- the only validation this needs — admins are trusted, and a bad slug is a
  -- broken deploy rather than an attack.
  IF p_slugs IS NOT NULL AND array_length(p_slugs, 1) > 0 THEN
    INSERT INTO public.product_required_consents (product_id, document_slug)
    SELECT p_product_id, s
      FROM unnest(p_slugs) AS s
    ON CONFLICT (product_id, document_slug) DO NOTHING;
  END IF;
END;
$$;


--
-- Name: FUNCTION set_product_required_consents(p_product_id uuid, p_slugs text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) IS 'Replace the set of consent documents a product requires, admin-only and guard-first on assert_admin. The only writer of product_required_consents: that table carries no write grant for any Data API role, and this function is what create_product and update_product both call so the join table has exactly one door. NULL and an empty array both mean "requires nothing", which is how a requirement is cleared. An unknown slug is refused by the foreign key into consent_documents — the only validation needed, since admins are trusted and a bad slug is a broken deploy rather than an attack. A NULL *element* is refused with check_violation, and the replacing DELETE uses a two-valued NOT EXISTS rather than `NOT (document_slug = ANY (...))`, which matches no row at all once the array holds a NULL and would quietly turn the replacement into a merge.';


--
-- Name: FUNCTION set_product_required_consents(p_product_id uuid, p_slugs text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_product_required_consents(p_product_id uuid, p_slugs text[]) TO service_role;


