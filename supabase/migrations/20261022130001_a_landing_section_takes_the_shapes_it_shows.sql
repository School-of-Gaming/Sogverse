-- A landing section takes the picture shapes it shows.
--
-- Landing page pictures now come in three shapes, each a catalogue purpose:
-- wide 16:9 'landing_image', square 1:1 'landing_square_image' and portrait
-- 4:5 'landing_portrait_image'. The database already derives each picture's
-- path into both copies of a page, so it derives the purpose alongside — the
-- renderer reads the shape from it to reserve the picture's box and to build
-- its URL against the right bucket, and the shape can never disagree with the
-- file. A replace keeps the entry's purpose, so a picture's shape cannot drift
-- under a page either.
--
-- WHAT CHANGES
--
-- Each copy's `image_paths` ({entry id: path}) becomes `pictures`
-- ({entry id: {"path": ..., "purpose": ...}}), derived by the new
-- apply_landing_pictures, which also decides which shapes each section takes:
--
--   * a hero's picture is wide only: it is the page's link preview and the
--     picture its structured data leads with, both drawn at 16:9;
--   * a text section's picture, and an image section's pictures, may be any
--     of the three;
--   * the pictures of one section all share one shape, so an image
--     section's grid lines up. A section mixing shapes is refused.
--
-- The application declares the same shapes per section type in its section
-- registry, and a DB test holds the two halves equal.
--
-- The catalogue's two landing page halves — the replace's repoint and the
-- removal's trigger — read the renamed column, and the removal reaches every
-- landing purpose.
--
-- Every page already holds only wide pictures, which every section takes, so
-- re-deriving the column refuses nothing that is stored.

-- ---------------------------------------------------------------------------
-- The derivation
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.apply_landing_pictures() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_section  jsonb;
  v_ref      text;
  v_path     text;
  v_purpose  public.catalogue_image_purpose;
  v_first    public.catalogue_image_purpose;
  v_takes    public.catalogue_image_purpose[];
  v_pictures jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.sections) = 'array' THEN
    FOR v_section IN
      SELECT s.e FROM jsonb_array_elements(NEW.sections) WITH ORDINALITY AS s(e, n) ORDER BY s.n
    LOOP
      -- The shapes this section's type takes. Held equal to the section
      -- registry's declaration by a DB test.
      v_takes := CASE v_section->>'type'
        WHEN 'hero' THEN ARRAY['landing_image']::public.catalogue_image_purpose[]
        ELSE ARRAY['landing_image', 'landing_square_image', 'landing_portrait_image']::public.catalogue_image_purpose[]
      END;
      v_first := NULL;

      FOR v_ref IN
        SELECT r.ref FROM (
          SELECT v_section->>'imageId' AS ref, 0::bigint AS n
           WHERE jsonb_typeof(v_section->'imageId') = 'string'
          UNION ALL
          SELECT i.e->>'imageId', i.n
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(v_section->'images') = 'array' THEN v_section->'images' ELSE '[]'::jsonb END
                 ) WITH ORDINALITY AS i(e, n)
           WHERE jsonb_typeof(i.e->'imageId') = 'string'
        ) AS r
        ORDER BY r.n
      LOOP
        v_path := NULL;
        IF v_ref ~ c_uuid THEN
          SELECT path, purpose INTO v_path, v_purpose
            FROM public.catalogue_images
           WHERE id = v_ref::uuid;
        END IF;

        -- The reachable cause is an entry another admin removed after this
        -- one was chosen; saving without the picture would be the worst answer.
        IF v_path IS NULL THEN
          RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', v_ref
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- An entry of another purpose lives in another bucket, cut for
        -- another frame. The uploader and the picker offer only landing
        -- pictures; this refuses loudly the state they cannot produce.
        IF v_purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
          RAISE EXCEPTION 'That picture is a % picture, and a landing page shows only landing pictures (catalogue_images row %)', v_purpose, v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        IF NOT v_purpose = ANY (v_takes) THEN
          RAISE EXCEPTION 'A hero section''s picture must be wide 16:9, because it is the page''s link preview, and that picture is % (catalogue_images row %)',
            CASE v_purpose WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END, v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        IF v_first IS NULL THEN
          v_first := v_purpose;
        ELSIF v_purpose <> v_first THEN
          RAISE EXCEPTION 'The pictures of an image section must all be one shape so they line up, and section % has a % picture beside a % one (catalogue_images row %)',
            v_section->>'id',
            CASE v_first WHEN 'landing_image' THEN 'wide 16:9' WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END,
            CASE v_purpose WHEN 'landing_image' THEN 'wide 16:9' WHEN 'landing_square_image' THEN 'square 1:1' ELSE 'portrait 4:5' END,
            v_ref
            USING ERRCODE = 'check_violation';
        END IF;

        v_pictures := v_pictures
          || jsonb_build_object(v_ref, jsonb_build_object('path', v_path, 'purpose', v_purpose));
      END LOOP;
    END LOOP;
  END IF;

  NEW.pictures := v_pictures;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_landing_pictures() IS 'BEFORE INSERT OR UPDATE on landing_pages and landing_page_publications: pictures is derived from every catalogue entry the sections name (a section''s imageId, an image section''s images[].imageId), as {entry id: {path, purpose}} — the purpose is the picture''s shape and names its bucket. No branch keeps a statement-supplied value and the triggers carry no column list, so this is the column''s only writer. Refuses an entry that is gone (23503); one that is not a landing picture (landing_image, landing_square_image or landing_portrait_image); a hero picture that is not wide (landing_image), since it is the page''s link preview; and a section whose pictures are not all one purpose (each 23514).';

REVOKE ALL ON FUNCTION public.apply_landing_pictures() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_landing_pictures() TO service_role;

-- ---------------------------------------------------------------------------
-- The column, on both copies
-- ---------------------------------------------------------------------------

DROP TRIGGER trg_landing_pages_apply_image_paths ON public.landing_pages;
DROP TRIGGER trg_landing_page_publications_apply_image_paths ON public.landing_page_publications;
DROP FUNCTION public.apply_landing_image_paths();

ALTER TABLE public.landing_pages ADD COLUMN pictures jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.landing_page_publications ADD COLUMN pictures jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN public.landing_pages.pictures IS 'Each catalogue entry the sections show, as {entry id: {"path": object name in its purpose''s bucket, "purpose": landing_image (wide 16:9), landing_square_image (square 1:1) or landing_portrait_image (portrait 4:5)}}, derived from sections by apply_landing_pictures and never written by anything else.';

COMMENT ON COLUMN public.landing_page_publications.pictures IS 'Each catalogue entry the live sections show, as {entry id: {"path", "purpose"}}, derived by apply_landing_pictures — what the public pages paint, and the shape each picture''s box is reserved at, readable without reading the admin-only catalogue.';

CREATE TRIGGER trg_landing_pages_apply_pictures BEFORE INSERT OR UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.apply_landing_pictures();
CREATE TRIGGER trg_landing_page_publications_apply_pictures BEFORE INSERT OR UPDATE ON public.landing_page_publications
  FOR EACH ROW EXECUTE FUNCTION public.apply_landing_pictures();

-- Derived for every page there is. Naming only the new column fires the
-- derivation and nothing else: the saver stamp, the last-saved time and the
-- structure cascade each fire on sections or updated_at alone.
UPDATE public.landing_pages SET pictures = '{}'::jsonb;
UPDATE public.landing_page_publications SET pictures = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- The catalogue's halves, reading the new column
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM public.assert_admin();

  -- Moving pictures to no entry is a removal, which the catalogue does by
  -- deleting the entry; this function only ever moves them to another.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A repoint needs the entry being replaced and its replacement'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  WITH drafts AS (
    UPDATE public.landing_pages
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE pictures ? p_from::text
    RETURNING id
  ),
  live AS (
    UPDATE public.landing_page_publications
       SET sections = public.landing_sections_repointed(sections, p_from, p_to)
     WHERE pictures ? p_from::text
    RETURNING page_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT page_id FROM live) AS moved;

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) IS 'Admin-gated landing half of the image catalogue''s replace: points every landing page picture that is entry p_from — working and published copies alike — at entry p_to, and returns how many pages moved (a page whose two copies both moved counts once). A live page''s picture changes without a republish. The catalogue''s replace hands it an entry of p_from''s own purpose, so a picture keeps its shape; the picture trigger re-derives each copy''s pictures and refuses a p_to that is gone, not a landing picture, or of a shape its section does not take. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) TO authenticated;
GRANT ALL ON FUNCTION public.repoint_landing_images(p_from uuid, p_to uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.unlink_removed_landing_image() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.purpose NOT IN ('landing_image', 'landing_square_image', 'landing_portrait_image') THEN
    RETURN OLD;
  END IF;

  -- Taken out of both copies before the entry goes, so the picture trigger
  -- re-deriving each copy never meets the entry it is removing; the structure
  -- trigger drops the text of an image section this leaves with no picture.
  UPDATE public.landing_pages
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE pictures ? OLD.id::text;

  UPDATE public.landing_page_publications
     SET sections = public.landing_sections_without_image(sections, OLD.id)
   WHERE pictures ? OLD.id::text;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.unlink_removed_landing_image() IS 'BEFORE DELETE on catalogue_images: the landing pages'' half of a removal, standing in for the foreign key a picture inside sections JSON cannot have. Takes a removed landing picture entry, of any of the three landing purposes, out of every landing page, working and published copies alike, as a cover''s SET NULL does: a hero or text section loses its picture, an image section loses that picture, and an image section left with none is dropped with its text. A live page changes without a republish; the working copy''s updated_at and saver move, as a cover removal''s do. SECURITY DEFINER because the remover is an admin''s own session and no landing page table carries a write grant.';

REVOKE ALL ON FUNCTION public.unlink_removed_landing_image() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_removed_landing_image() TO service_role;

ALTER TABLE public.landing_pages DROP COLUMN image_paths;
ALTER TABLE public.landing_page_publications DROP COLUMN image_paths;

-- ---------------------------------------------------------------------------
-- The comments that name the derivation
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.catalogue_images.purpose IS 'What this picture is for, which decides the bucket its object lives in and the exact size — and so the shape — it was stored at. Set once, when the entry is created, and never changed: a replace creates an entry of the same purpose. A product may link only a ''product'' entry (apply_product_image_path refuses anything else), a Library cover only a ''library_cover'' one (apply_library_cover_path), a landing page only landing pictures, each section only the shapes it takes (apply_landing_pictures), and a spotlight only a ''spotlight_image'' one (apply_spotlight_image_path). An UPDATE changing it is refused by trg_catalogue_images_purpose_is_fixed.';

COMMENT ON FUNCTION public.landing_sections_problem(p_sections jsonb) IS 'What is wrong with a landing page''s section structure, in a sentence for the admin, or NULL when nothing is. The structure is a JSON array of sections, each {id, type, ...shared fields}, ids lowercase uuids distinct within the page; the first is the page''s one hero. Per type: hero {imageId?, button?}; text {imageId?, imageSide: start|end}; image {images: 1-4 of {id, imageId}}; points {items: 2-6 of {id, icon}}; steps {items: 2-6 of {id}}; testimonials {arrangement: feature|pair|row|showcase, testimonialIds: exactly 1, 2, 3 or 6 distinct testimonial uuids, by arrangement}; products {productIds: 1 or more distinct product uuids, no upper bound}; faq {items: 1-20 of {id}}; subscribe {} (no shared field); cta {button}. Item ids are lowercase uuids distinct within their section. A button is checked by landing_button_is_valid. The curated icon list and the text fields are the application''s to check; whether a picture exists, is a landing picture and is a shape its section takes is apply_landing_pictures''; whether a placed testimonial or a picked product exists is check_landing_section_picks''. The TypeScript structure schema in src/lib/landing-pages/sections/ states the testimonials counts too, and a DB test holds the two equal.';

-- ---------------------------------------------------------------------------
-- What this migration promises
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.landing_pages p
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements(p.sections) AS s(e)
        WHERE jsonb_typeof(s.e->'imageId') = 'string'
          AND NOT p.pictures ? (s.e->>'imageId')
     )
  ) THEN
    RAISE EXCEPTION 'A working copy names a picture its derived pictures lack';
  END IF;
END;
$$;
