--
-- Name: unlink_removed_landing_image(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlink_removed_landing_image() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.purpose <> 'landing_image' THEN
    RETURN OLD;
  END IF;

  -- Taken out of both copies before the entry goes, so the image-path trigger
  -- re-deriving each copy never meets the entry it is removing; the structure
  -- trigger drops the text of an image section this leaves with no picture.
  UPDATE public.landing_pages
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE image_paths ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE image_paths ? OLD.id::text;

  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION unlink_removed_landing_image(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside sections JSON cannot have. Takes a removed landing_image entry out of every landing page, working and published copies alike, as a cover''s SET NULL does: a hero or text section loses its picture, an image section loses that picture, and an image section left with none is dropped with its text. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';


--
-- Name: FUNCTION unlink_removed_landing_image(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unlink_removed_landing_image() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_removed_landing_image() TO service_role;


