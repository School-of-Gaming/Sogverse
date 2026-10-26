--
-- Name: apply_product_image_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_product_image_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path    text;
  v_purpose public.catalogue_image_purpose;
  v_words   text;
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = NEW.image_id;

    -- This runs BEFORE the FK — which is an AFTER-row constraint trigger fired
    -- at statement end — so it pre-empts the FK's own check rather than relying
    -- on it. The reachable cause of an empty lookup is that the row is gone
    -- (another admin removed the entry between this admin loading the form and
    -- saving it). Blanking the picture silently would be the worst possible
    -- answer; raise instead, with the SQLSTATE the FK itself would have used,
    -- because it is the same claim made earlier. The refusal says only that
    -- no entry has the id.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'No picture in the catalogue has the id %', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame, so a product showing it would paint a path its readers
    -- resolve against the wrong bucket. The admin picker offers only product
    -- entries; this is the schema refusing loudly the state that picker
    -- cannot produce.
    IF v_purpose <> 'product' THEN
      CASE v_purpose
        WHEN 'library_cover' THEN v_words := 'a Library cover';
        WHEN 'landing_image' THEN v_words := 'a landing page picture';
        WHEN 'landing_square_image' THEN v_words := 'a landing page picture';
        WHEN 'landing_portrait_image' THEN v_words := 'a landing page picture';
        WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      RAISE EXCEPTION 'The picture % is %, and a product shows only product pictures',
        NEW.image_id, v_words
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.image_path := v_path;
  ELSE
    -- No entry, no picture — on UPDATE and INSERT alike, and whatever the
    -- statement said about image_path. No branch preserves an app-supplied
    -- path, so this one has exactly one meaning: a product with no entry has
    -- no picture. With no column list on the trigger, this function is the
    -- only writer of image_path — which is why no foreign key on that column
    -- is needed, and why one must not be added (see the function comment).
    NEW.image_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION apply_product_image_path(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_product_image_path() IS 'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch preserves an app-supplied path, so this function is the column''s ONLY writer — which is what carries the invariant that a served path is a catalogue path, and why there is deliberately no foreign key on image_path (a second relationship between products and catalogue_images makes every PostgREST embed ambiguous). Refuses an entry that is gone (23503) or whose purpose is not ''product'' (23514): its object lives in another bucket. Each refusal names the picture by its catalogue id, the id the writer sent, and a purpose in plain words. Carries no column list on the trigger deliberately, so no statement can name image_path and win.';


--
-- Name: FUNCTION apply_product_image_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;


