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
BEGIN
  IF NEW.image_id IS NOT NULL THEN
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = NEW.image_id;

    -- This runs before the foreign key, which is checked at statement end, so
    -- it makes the key's own claim first and with the key's own SQLSTATE: the
    -- reachable cause is an entry another admin removed after this one was
    -- chosen.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', NEW.image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame. The picker offers only spotlight pictures; this refuses
    -- loudly the state it cannot produce.
    IF v_purpose <> 'spotlight_image' THEN
      RAISE EXCEPTION 'That picture is a % picture, and a spotlight''s has to be a spotlight_image one (catalogue_images row %)', v_purpose, NEW.image_id
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

COMMENT ON FUNCTION public.apply_spotlight_image_path() IS 'BEFORE INSERT OR UPDATE on spotlights: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch keeps a statement-supplied path, so this function is the column''s only writer, and the trigger carries no column list so no statement can name image_path and win. Refuses an entry that is gone (23503) or whose purpose is not spotlight_image (23514): its object lives in another bucket.';


--
-- Name: FUNCTION apply_spotlight_image_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_spotlight_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_spotlight_image_path() TO service_role;


