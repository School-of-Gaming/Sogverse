--
-- Name: admin_set_product_gamer_photo_consents(uuid, public.gamer_photo_consent_type[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused BEFORE the replacing DELETE, the rule every
  -- array-replacing writer in this schema follows: `NOT (col = ANY (array))`
  -- is three-valued, so an array holding a NULL makes the predicate match
  -- nothing and quietly degrades a wipe-and-replace into a merge.
  -- `unnest(NULL::…[])` yields no rows, so an omitted array — the ordinary
  -- "asks nothing" shape — passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consent_types) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the photo-consent list contains a NULL entry, which is not a consent'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The product must exist. The only FK here is the product itself, and on a
  -- call that CLEARS the set there is no INSERT for that FK to fire on — so a
  -- typo'd id would silently delete nothing and report success.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.product_gamer_photo_consents
   WHERE product_id = p_product_id
     AND NOT (consent_type = ANY (
       COALESCE(p_consent_types, ARRAY[]::public.gamer_photo_consent_type[])
     ));

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair is a SET replacement, and leaving an unchanged row in place keeps the
  -- delete from churning rows an admin did not touch.
  IF p_consent_types IS NOT NULL
     AND array_length(p_consent_types, 1) > 0 THEN
    INSERT INTO public.product_gamer_photo_consents (product_id, consent_type)
    SELECT p_product_id, c
      FROM unnest(p_consent_types) AS c
    ON CONFLICT (product_id, consent_type) DO NOTHING;
  END IF;
END;
$$;


--
-- Name: FUNCTION admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]) IS 'Replace the set of photo consents a product''s signup panel asks about — and therefore whether its session editor shows a gedu the roster''s photo permissions at all — admin-only and guard-first on assert_admin. The only writer of product_gamer_photo_consents: that table carries no write grant for any Data API role, and an inline INSERT from the admin product form would need one, because the form reaches this as the admin''s own session role. NULL and an empty array both mean "asks nothing", which is how a set is cleared. A NULL ELEMENT is refused before the replacing DELETE runs, for the reason two systems over refuse one: `NOT (col = ANY (array))` is three-valued, so a NULL inside the array would match nothing and turn the wipe-and-replace into a merge. An unknown product is refused explicitly rather than by a foreign key, because a call that CLEARS the set performs no insert for an FK to fire on and would otherwise report success for a product that does not exist. The exact twin of admin_set_product_marketing_consents.';


--
-- Name: FUNCTION admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_product_gamer_photo_consents(p_product_id uuid, p_consent_types public.gamer_photo_consent_type[]) TO service_role;


