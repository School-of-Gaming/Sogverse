--
-- Name: apply_product_image_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_product_image_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path text;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path INTO v_path
      FROM public.product_images
     WHERE id = NEW.image_id;

    -- This runs BEFORE the FK — which is an AFTER-row constraint trigger fired
    -- at statement end — so it pre-empts the FK's own check rather than relying
    -- on it. The reachable cause of an empty lookup is that the row is gone
    -- (another admin removed the entry between this admin loading the form and
    -- saving it); RLS hiding it is the other half of the message and the half
    -- 00196's header argues cannot happen. Blanking the picture silently would
    -- be the worst possible answer to either; raise instead, with the SQLSTATE
    -- the FK itself would have used, because it is the same claim made earlier.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'product_images row % does not exist or is not visible to this writer', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.image_path := v_path;
  ELSE
    -- No entry, no picture — on UPDATE and INSERT alike, and whatever the
    -- statement said about image_path. 00196 preserved an app-supplied path
    -- here so that the ~110 products carrying a pre-catalogue path survived a
    -- migration released ahead of the code that linked them. That fold-in is
    -- done (00198), so the branch now has only one honest meaning: a product
    -- with no entry has no picture. With no column list on the trigger, this
    -- function is the only writer of image_path — which is why no foreign key
    -- on that column is needed, and why one must not be added (see the header).
    NEW.image_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION apply_product_image_path(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_product_image_path() IS 'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked product_images entry, and is NULL whenever image_id is. Since 00198 there is no branch that preserves an app-supplied path, so this function is the column''s ONLY writer — which is what carries the invariant that a served path is a catalogue path, and why there is deliberately no foreign key on image_path (a second relationship between products and product_images makes every PostgREST embed ambiguous; see 00198''s header). Carries no column list on the trigger deliberately, so no statement can name image_path and win.';


--
-- Name: FUNCTION apply_product_image_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;


