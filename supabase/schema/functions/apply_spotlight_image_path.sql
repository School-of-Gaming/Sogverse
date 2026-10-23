--
-- Name: apply_spotlight_image_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_spotlight_image_path() RETURNS trigger
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

    -- This runs before the foreign key, which is checked at statement end, so
    -- it makes the key's own claim first and with the key's own SQLSTATE: the
    -- reachable cause is an entry another admin removed after this one was
    -- chosen. The refusal says only that no entry has the id.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'No picture in the catalogue has the id %', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame. The picker offers only spotlight pictures; this refuses
    -- loudly the state it cannot produce.
    IF v_purpose <> 'spotlight_image' THEN
      CASE v_purpose
        WHEN 'product' THEN v_words := 'a product picture';
        WHEN 'library_cover' THEN v_words := 'a Library cover';
        WHEN 'landing_image' THEN v_words := 'a landing page picture';
        WHEN 'landing_square_image' THEN v_words := 'a landing page picture';
        WHEN 'landing_portrait_image' THEN v_words := 'a landing page picture';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      RAISE EXCEPTION 'The picture % is %, and a spotlight shows only spotlight pictures',
        NEW.image_id, v_words
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.image_path := v_path;
  ELSE
    -- No entry, no picture, whatever the statement said about image_path.
    NEW.image_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION apply_spotlight_image_path(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_spotlight_image_path() IS 'BEFORE INSERT OR UPDATE on spotlights: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch keeps a statement-supplied path, so this function is the column''s only writer, and the trigger carries no column list so no statement can name image_path and win. Refuses an entry that is gone (23503) or whose purpose is not spotlight_image (23514): its object lives in another bucket. Each refusal names the picture by its catalogue id, the id the writer sent, and a purpose in plain words.';


--
-- Name: FUNCTION apply_spotlight_image_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_spotlight_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_spotlight_image_path() TO service_role;


