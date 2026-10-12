-- Admins write spotlights.
--
-- A spotlight is a short admin-written note with a picture. Every enabled one
-- is appended to the bottom of every session report email — the parents',
-- the gamers' and the staff copy alike — newest first.
--
-- THE SHAPE
--
-- 1. One row per spotlight in `spotlights`: its picture and whether it is
--    enabled. There is no working copy and no published copy: a spotlight is
--    a single copy, and `enabled` is what makes it live. No start or end
--    dates and no position: the order is newest first by created_at, id
--    breaking a tie.
-- 2. A version per site locale in `spotlight_translations`, as a Library
--    article has: a title and a markdown body, both required in every
--    version. At least one version per spotlight — a save with none is
--    refused, and the whole save is the only writer that removes one — so a
--    reader's fallback (their locale, then English, then the first written)
--    always finds one.
-- 3. The picture is a catalogue entry of purpose 'spotlight_image', linked by
--    id; `image_path` is derived from the link by a trigger, exactly as a
--    Library cover's cover_path, so a reader paints a path without reading
--    the admin-only catalogue.
-- 4. A spotlight may be saved without a picture but never enabled without
--    one: a CHECK, so a state the admin UI cannot produce fails loudly.
--
-- THE CATALOGUE'S REPLACE AND REMOVAL
--
-- A replace moves every spotlight on the old entry to the new one
-- (repoint_spotlight_images, the replace's spotlight half). A removal takes
-- the picture off every spotlight showing it AND switches each of them off, in
-- the one statement a BEFORE DELETE trigger on catalogue_images runs: the
-- CHECK would refuse a bare SET NULL on an enabled spotlight, and a removed
-- picture means that spotlight simply drops out of the mails until an admin
-- gives it another picture and switches it back on.
--
-- ACCESS
--
-- Admin-only end to end for the Data API: SELECT for authenticated behind an
-- admin policy, nothing for anon, and no write grant — the writers are the
-- admin-guarded functions below and the catalogue's repoint and removal
-- trigger. The session report email reads the enabled spotlights with the
-- service role, which its route already holds for the recipients.

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.spotlights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id   uuid REFERENCES public.catalogue_images(id),
  image_path text,
  enabled    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_spotlights_enabled_has_image CHECK (NOT enabled OR image_id IS NOT NULL)
);

COMMENT ON TABLE public.spotlights IS 'Admin-written notes appended to every session report email, newest first: the picture and whether the spotlight is enabled here, the title and body per language in spotlight_translations. A single copy — enabled is what makes one live, with no publishing step, no dates and no position. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_spotlight, save_spotlight, set_spotlight_enabled and delete_spotlight, and the catalogue''s repoint_spotlight_images and removal trigger. The session report email reads the enabled ones with the service role.';

COMMENT ON COLUMN public.spotlights.image_id IS 'The picture: a spotlight_image entry in the shared image catalogue, or NULL for none. Moved to the new entry by the catalogue''s replace (repoint_spotlight_images). The catalogue''s removal nulls it and switches the spotlight off in one statement (unlink_removed_spotlight_image), before the entry goes — which is why the foreign key takes no action of its own.';
COMMENT ON COLUMN public.spotlights.image_path IS 'The picture''s object name in the spotlight-images bucket, derived from image_id by apply_spotlight_image_path and never written by anything else. NULL exactly when image_id is.';
COMMENT ON COLUMN public.spotlights.enabled IS 'Whether the spotlight is appended to session report emails. A new spotlight starts off; set_spotlight_enabled switches it. Never true without a picture (chk_spotlights_enabled_has_image).';
COMMENT ON COLUMN public.spotlights.created_at IS 'When the spotlight was created. The one ordering key: readers take the enabled spotlights newest first, id breaking a tie.';
COMMENT ON CONSTRAINT chk_spotlights_enabled_has_image ON public.spotlights IS 'A spotlight may be saved without a picture but never enabled without one. The admin UI holds the switch back; this refuses the state it cannot produce.';

CREATE INDEX idx_spotlights_image_id ON public.spotlights (image_id);
CREATE INDEX idx_spotlights_enabled_created_at ON public.spotlights (created_at DESC, id DESC) WHERE enabled;

ALTER TABLE public.spotlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_spotlights ON public.spotlights
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.spotlights TO authenticated;
GRANT ALL ON TABLE public.spotlights TO service_role;

CREATE TABLE public.spotlight_translations (
  spotlight_id uuid NOT NULL REFERENCES public.spotlights(id) ON DELETE CASCADE,
  locale       text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  PRIMARY KEY (spotlight_id, locale),
  CONSTRAINT chk_spotlight_translations_locale_format CHECK (locale ~ '^[a-z]{2,3}$'),
  CONSTRAINT chk_spotlight_translations_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT chk_spotlight_translations_body_present CHECK (btrim(body) <> '')
);

COMMENT ON TABLE public.spotlight_translations IS 'One language version of a spotlight: its title and body in one site locale. Any set of locales, at least one per spotlight: create_spotlight and save_spotlight refuse an empty set, and nothing else removes a version. Readers pick their version by their locale, then English, then the first written. Admin-only for the Data API, as spotlights is; the writers are create_spotlight and save_spotlight, which replace the whole set.';
COMMENT ON COLUMN public.spotlight_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';
COMMENT ON COLUMN public.spotlight_translations.title IS 'The title in this language, trimmed. Required.';
COMMENT ON COLUMN public.spotlight_translations.body IS 'The authored markdown in this language, trimmed. Required. Links are allowed and headings are not; the renderer''s use case enforces that, not this column.';

ALTER TABLE public.spotlight_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_spotlight_translations ON public.spotlight_translations
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.spotlight_translations TO authenticated;
GRANT ALL ON TABLE public.spotlight_translations TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The picture: derived path, replace and removal
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.apply_spotlight_image_path()
RETURNS trigger
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

COMMENT ON FUNCTION public.apply_spotlight_image_path() IS 'BEFORE INSERT OR UPDATE on spotlights: image_path is derived from the linked catalogue_images entry, and is NULL whenever image_id is. No branch keeps a statement-supplied path, so this function is the column''s only writer, and the trigger carries no column list so no statement can name image_path and win. Refuses an entry that is gone (23503) or whose purpose is not spotlight_image (23514): its object lives in another bucket.';

REVOKE ALL ON FUNCTION public.apply_spotlight_image_path() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_spotlight_image_path() TO service_role;

CREATE TRIGGER trg_spotlights_apply_image_path
  BEFORE INSERT OR UPDATE ON public.spotlights
  FOR EACH ROW EXECUTE FUNCTION public.apply_spotlight_image_path();

CREATE FUNCTION public.unlink_removed_spotlight_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.purpose <> 'spotlight_image' THEN
    RETURN OLD;
  END IF;

  -- One statement takes the picture off and switches the spotlight off, so
  -- the enabled-needs-a-picture CHECK never sees an enabled spotlight with
  -- none. Done before the entry goes, which is what lets the foreign key take
  -- no action of its own.
  UPDATE public.spotlights
     SET image_id = NULL,
         enabled  = false
   WHERE image_id = OLD.id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.unlink_removed_spotlight_image() IS 'BEFORE DELETE on catalogue_images: the spotlights'' half of a removal. Every spotlight showing a removed spotlight_image entry loses its picture and is switched off in the same statement — an enabled spotlight cannot be without a picture (chk_spotlights_enabled_has_image), so a removed picture drops its spotlights out of the session report emails until an admin gives each another picture and switches it back on. SECURITY DEFINER because the remover is an admin''s own session and spotlights carries no write grant.';

REVOKE ALL ON FUNCTION public.unlink_removed_spotlight_image() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_removed_spotlight_image() TO service_role;

CREATE TRIGGER trg_catalogue_images_unlink_spotlights
  BEFORE DELETE ON public.catalogue_images
  FOR EACH ROW EXECUTE FUNCTION public.unlink_removed_spotlight_image();

CREATE FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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

  UPDATE public.spotlights
     SET image_id = p_to
   WHERE image_id = p_from;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) IS 'Admin-gated half of the image catalogue''s replace: points every spotlight that uses entry p_from at entry p_to, in one statement, and returns how many moved. An enabled spotlight stays enabled and shows the new picture in the next mail. The image-path trigger re-derives each path and refuses a p_to that is gone or not a spotlight picture. Either argument NULL raises null_value_not_allowed. SECURITY DEFINER because spotlights carries no write grant.';

REVOKE ALL ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repoint_spotlight_images(p_from uuid, p_to uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The writers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_locale text;
BEGIN
  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Readers fall back to the first version written, so a spotlight has at
  -- least one, and every version has both of its fields.
  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A spotlight needs at least one language version'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.locale INTO v_locale
    FROM jsonb_to_recordset(p_versions) AS r(locale text, title text)
   WHERE btrim(COALESCE(r.title, '')) = ''
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(v_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.locale INTO v_locale
    FROM jsonb_to_recordset(p_versions) AS r(locale text, body text)
   WHERE btrim(COALESCE(r.body, '')) = ''
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version needs a body', COALESCE(v_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT r.locale) <> count(*)
        FROM jsonb_to_recordset(p_versions) AS r(locale text)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.spotlight_translations t
   WHERE t.spotlight_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.spotlight_translations AS t (spotlight_id, locale, title, body)
  SELECT p_id, r.locale, btrim(r.title), btrim(r.body)
    FROM jsonb_to_recordset(p_versions) AS r(locale text, title text, body text)
  ON CONFLICT (spotlight_id, locale) DO UPDATE
     SET title = EXCLUDED.title,
         body  = EXCLUDED.body;
END;
$$;

COMMENT ON FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) IS 'The version-set half of create_spotlight and save_spotlight, which have already checked the caller is an admin. p_versions is the whole set, a JSON array of {locale, title, body}, replacing what was stored: a locale it omits is removed. At least one version, each with a title and a body, else check_violation naming the locale; a locale named twice, or p_versions not an array, raises 22023. Text is trimmed. Not exposed: granted to no Data API role but the service role.';

REVOKE ALL ON FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_spotlight_versions(p_id uuid, p_versions jsonb) TO service_role;

CREATE FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  INSERT INTO public.spotlights (image_id)
  VALUES (p_image_id)
  RETURNING id INTO v_id;

  PERFORM public.replace_spotlight_versions(v_id, p_versions);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) IS 'Admin-gated create of a spotlight; returns its id. It starts switched off: set_spotlight_enabled switches it on once it has a picture. p_versions is the whole version set, as replace_spotlight_versions takes it — at least one {locale, title, body}, each with both fields. The picture is a catalogue entry id or NULL for none, and the image-path trigger refuses one that is gone or not a spotlight picture. SECURITY DEFINER because neither spotlight table carries a write grant.';

REVOKE ALL ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_spotlight(p_versions jsonb, p_image_id uuid) TO service_role;

CREATE FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_image_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  PERFORM public.assert_admin();

  SELECT enabled INTO v_enabled
    FROM public.spotlights
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spotlight not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The CHECK would refuse this too; saying it in a sentence is what lets the
  -- refusal reach an admin as something they can act on.
  IF v_enabled AND p_image_id IS NULL THEN
    RAISE EXCEPTION 'An enabled spotlight needs its picture: switch it off before removing the picture'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The picture is assigned on every call, so an omitted one clears it.
  UPDATE public.spotlights
     SET image_id = p_image_id
   WHERE id = p_id;

  PERFORM public.replace_spotlight_versions(p_id, p_versions);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_image_id uuid) IS 'Admin-gated whole save of a spotlight; returns its id. p_versions is the whole version set, as replace_spotlight_versions takes it, replacing what was stored: a locale it omits is removed. The picture is assigned on every call — an omitted one clears it, which an enabled spotlight refuses with check_violation (switch it off first). Whether it is enabled is set_spotlight_enabled''s alone. An id no spotlight has raises no_data_found. SECURITY DEFINER because neither spotlight table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_image_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_image_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_spotlight(p_id uuid, p_versions jsonb, p_image_id uuid) TO service_role;

CREATE FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_image_id uuid;
BEGIN
  PERFORM public.assert_admin();

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether the spotlight is enabled'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  SELECT image_id INTO v_image_id
    FROM public.spotlights
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spotlight not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The CHECK would refuse this too; the sentence is for the admin.
  IF p_enabled AND v_image_id IS NULL THEN
    RAISE EXCEPTION 'A spotlight needs a picture before it can be switched on'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.spotlights
     SET enabled = p_enabled
   WHERE id = p_id;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) IS 'Admin-gated switch of whether a spotlight is appended to session report emails; returns its id. Switching on a spotlight with no picture raises check_violation; a NULL p_enabled raises null_value_not_allowed; an id no spotlight has raises no_data_found. SECURITY DEFINER because spotlights carries no write grant.';

REVOKE ALL ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_spotlight_enabled(p_id uuid, p_enabled boolean) TO service_role;

CREATE FUNCTION public.delete_spotlight(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  DELETE FROM public.spotlights WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spotlight not found'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.delete_spotlight(p_id uuid) IS 'Admin-gated removal of a spotlight outright, its versions with it (ON DELETE CASCADE). Its picture stays in the catalogue. An id no spotlight has raises no_data_found. SECURITY DEFINER because spotlights carries no write grant.';

REVOKE ALL ON FUNCTION public.delete_spotlight(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_spotlight(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_spotlight(p_id uuid) TO service_role;
