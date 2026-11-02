--
-- Name: unlink_removed_landing_image(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlink_removed_landing_image() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
    RETURN OLD;
  END IF;

  -- Taken out of both copies' sections first, then out of their versions'
  -- hero and share pictures, whose unset re-derives each copy without the
  -- entry; the structure trigger drops the text of an image section this
  -- leaves with no picture. The copies are found by their pictures before
  -- the versions' are unset, so a working copy whose only use was in a
  -- version moves its last-saved time too.
  UPDATE public.landing_pages
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE pictures ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE pictures ? OLD.id::text;

  -- A hero picture that was this entry is unset in that language's words, as
  -- a share picture is below; the hero's alt text stays, as the share
  -- picture's does, and is no longer required.
  UPDATE public.landing_page_translations AS t
     SET section_texts = t.section_texts #- ARRAY[p.sections->0->>'id', 'imageId']
    FROM public.landing_pages AS p
   WHERE p.id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = OLD.id::text;

  UPDATE public.landing_page_publication_translations AS t
     SET section_texts = t.section_texts #- ARRAY[p.sections->0->>'id', 'imageId']
    FROM public.landing_page_publications AS p
   WHERE p.page_id = t.page_id
     AND t.section_texts #>> ARRAY[p.sections->0->>'id', 'imageId'] = OLD.id::text;

  -- A share picture that was this entry is unset, and that language's preview
  -- falls back to its hero's picture, when it still names one.
  UPDATE public.landing_page_translations
     SET share_image_id = NULL
   WHERE share_image_id = OLD.id;

  UPDATE public.landing_page_publication_translations
     SET share_image_id = NULL
   WHERE share_image_id = OLD.id;

  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION unlink_removed_landing_image(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside JSON cannot have. Takes a removed landing picture entry, of any of the three landing purposes, out of every landing page, working and published copies alike, as a cover''s SET NULL does: a text or guide section loses its picture, an image section loses that picture, an image section left with none is dropped with its text, a language''s hero picture is unset in its words (its alt text kept), and a language''s share picture is unset, so that language''s link preview falls back to its hero''s picture. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';


--
-- Name: FUNCTION unlink_removed_landing_image(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unlink_removed_landing_image() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_removed_landing_image() TO service_role;


