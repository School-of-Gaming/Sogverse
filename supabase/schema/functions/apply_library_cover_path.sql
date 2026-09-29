--
-- Name: apply_library_cover_path(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_library_cover_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path    text;
  v_purpose public.catalogue_image_purpose;
BEGIN
  IF NEW.cover_image_id IS NOT NULL THEN
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = NEW.cover_image_id;

    -- This runs before the foreign key, which is checked at statement end, so
    -- it makes the key's own claim first and with the key's own SQLSTATE: the
    -- reachable cause is an entry another admin removed after this one was
    -- chosen. Saving with no cover instead would be the worst answer to that.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', NEW.cover_image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame, so a cover showing it would paint a path its readers
    -- resolve against the wrong bucket. The cover picker offers only Library
    -- cover entries; this refuses loudly the state that picker cannot produce.
    IF v_purpose <> 'library_cover' THEN
      RAISE EXCEPTION 'That picture is a % picture, and a Library cover has to be a library_cover one (catalogue_images row %)', v_purpose, NEW.cover_image_id
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.cover_path := v_path;
  ELSE
    -- No entry, no cover, whatever the statement said about cover_path.
    NEW.cover_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION apply_library_cover_path(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_library_cover_path() IS 'BEFORE INSERT OR UPDATE on library_articles and on library_article_publications: cover_path is derived from the linked catalogue_images entry, and is NULL whenever cover_image_id is. No branch keeps a statement-supplied path, so this function is the column''s only writer on both tables, and the triggers carry no column list so no statement can name cover_path and win. Refuses an entry that is gone (23503) or whose purpose is not library_cover (23514): its object lives in another bucket.';


--
-- Name: FUNCTION apply_library_cover_path(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_library_cover_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_library_cover_path() TO service_role;


