-- A refused catalogue picture is named by its id, and its purpose in plain words.
--
-- WHAT THIS CHANGES
--
-- The triggers that check the catalogue picture a Library cover, a spotlight
-- or a product links ended their refusals with "(catalogue_images row <id>)",
-- and the purpose refusals printed the purpose's enum value ("a
-- library_cover one"). The MCP server hands these sentences to an AI app
-- word for word, and neither a table name nor an enum value is anything the
-- app sent or can act on. Each refusal now names the picture by its
-- catalogue id, the id the writer sent, as apply_landing_pictures' do:
--
-- - one no entry has is "No picture in the catalogue has the id <id>"
--   (23503), true of an id that never existed as well as of one removed since
--   it was chosen;
-- - one of another purpose is "The picture <id> is a product picture, and
--   ..." (23514), the purpose in the words the admin UI uses: a product
--   picture, a Library cover, a spotlight picture, a landing page picture.
--
-- refuse_catalogue_image_purpose_change names the picture the same way.
-- Each purpose's words are listed by name, and a purpose with none raises, so
-- a purpose added to the enum fails loudly rather than being named wrongly.
-- Behaviour is otherwise unchanged: the same states are refused, with the
-- same SQLSTATEs, and the derived path columns are written as before.

CREATE OR REPLACE FUNCTION public.apply_library_cover_path() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_path    text;
  v_purpose public.catalogue_image_purpose;
  v_words   text;
BEGIN
  IF NEW.cover_image_id IS NOT NULL THEN
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = NEW.cover_image_id;

    -- This runs before the foreign key, which is checked at statement end, so
    -- it makes the key's own claim first and with the key's own SQLSTATE.
    -- Reached by an id an AI app sent that no entry has, and by an entry
    -- another admin removed after this one was chosen; saving with no cover
    -- instead would be the worst answer to either. The refusal says only
    -- that no entry has the id, which is true of both.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'No picture in the catalogue has the id %', NEW.cover_image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame, so a cover showing it would paint a path its readers
    -- resolve against the wrong bucket. The cover picker offers only Library
    -- cover entries; this refuses loudly the state that picker cannot produce.
    IF v_purpose <> 'library_cover' THEN
      CASE v_purpose
        WHEN 'product' THEN v_words := 'a product picture';
        WHEN 'landing_image' THEN v_words := 'a landing page picture';
        WHEN 'landing_square_image' THEN v_words := 'a landing page picture';
        WHEN 'landing_portrait_image' THEN v_words := 'a landing page picture';
        WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
        ELSE RAISE EXCEPTION 'No words for the picture purpose %', v_purpose;
      END CASE;
      RAISE EXCEPTION 'The picture % is %, and an article''s cover can only be a Library cover',
        NEW.cover_image_id, v_words
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

COMMENT ON FUNCTION public.apply_library_cover_path() IS 'BEFORE INSERT OR UPDATE on library_articles and on library_article_publications: cover_path is derived from the linked catalogue_images entry, and is NULL whenever cover_image_id is. No branch keeps a statement-supplied path, so this function is the column''s only writer on both tables, and the triggers carry no column list so no statement can name cover_path and win. Refuses an entry that is gone (23503) or whose purpose is not library_cover (23514): its object lives in another bucket. Each refusal names the picture by its catalogue id, the id the writer sent, and a purpose in plain words.';

REVOKE ALL ON FUNCTION public.apply_library_cover_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_library_cover_path() TO service_role;


CREATE OR REPLACE FUNCTION public.apply_spotlight_image_path() RETURNS trigger
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

COMMENT ON FUNCTION public.apply_spotlight_image_path() IS 'BEFORE INSERT OR UPDATE on spotlights: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch keeps a statement-supplied path, so this function is the column''s only writer, and the trigger carries no column list so no statement can name image_path and win. Refuses an entry that is gone (23503) or whose purpose is not spotlight_image (23514): its object lives in another bucket. Each refusal names the picture by its catalogue id, the id the writer sent, and a purpose in plain words.';

REVOKE ALL ON FUNCTION public.apply_spotlight_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_spotlight_image_path() TO service_role;


CREATE OR REPLACE FUNCTION public.apply_product_image_path() RETURNS trigger
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

COMMENT ON FUNCTION public.apply_product_image_path() IS 'BEFORE INSERT OR UPDATE on products: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch preserves an app-supplied path, so this function is the column''s ONLY writer — which is what carries the invariant that a served path is a catalogue path, and why there is deliberately no foreign key on image_path (a second relationship between products and catalogue_images makes every PostgREST embed ambiguous). Refuses an entry that is gone (23503) or whose purpose is not ''product'' (23514): its object lives in another bucket. Each refusal names the picture by its catalogue id, the id the writer sent, and a purpose in plain words. Carries no column list on the trigger deliberately, so no statement can name image_path and win.';

REVOKE ALL ON FUNCTION public.apply_product_image_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_product_image_path() TO service_role;


CREATE OR REPLACE FUNCTION public.refuse_catalogue_image_purpose_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_words text;
BEGIN
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    CASE OLD.purpose
      WHEN 'product' THEN v_words := 'a product picture';
      WHEN 'library_cover' THEN v_words := 'a Library cover';
      WHEN 'landing_image' THEN v_words := 'a landing page picture';
      WHEN 'landing_square_image' THEN v_words := 'a landing page picture';
      WHEN 'landing_portrait_image' THEN v_words := 'a landing page picture';
      WHEN 'spotlight_image' THEN v_words := 'a spotlight picture';
      ELSE RAISE EXCEPTION 'No words for the picture purpose %', OLD.purpose;
    END CASE;
    RAISE EXCEPTION 'The picture % is %, and a picture''s purpose never changes',
      OLD.id, v_words
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_catalogue_image_purpose_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refuse_catalogue_image_purpose_change() TO service_role;
