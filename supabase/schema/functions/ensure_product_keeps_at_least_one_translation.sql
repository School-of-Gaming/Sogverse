--
-- Name: ensure_product_keeps_at_least_one_translation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_product_keeps_at_least_one_translation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- Allowed if at least one OTHER row will remain after this delete.
  IF EXISTS (
    SELECT 1 FROM public.product_translations
    WHERE product_id = OLD.product_id
      AND locale <> OLD.locale
  ) THEN
    RETURN OLD;
  END IF;

  -- The product itself is being deleted — CASCADE delete is fine.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = OLD.product_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Each product must keep at least one translation'
    USING ERRCODE = 'check_violation';
END;
$$;


--
-- Name: FUNCTION ensure_product_keeps_at_least_one_translation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() TO service_role;


