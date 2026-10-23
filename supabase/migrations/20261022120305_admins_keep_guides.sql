-- Admins keep guides.
--
-- A guide is a PDF Marketing hands out from a landing page — a parents' guide,
-- a school's information pack — one file per site locale, which a reader
-- downloads in their own language once signed in.
--
-- THE SHAPE
--
-- 1. One row per guide in `guides`: an admin-only label naming it in the
--    admin's lists (never shown to a reader), and who created it and when, who
--    last saved it and when, and through which AI app — stamped by a trigger,
--    never by a writer, as testimonials are.
-- 2. One file per (guide, locale) in `guide_files`: where the object is in the
--    private `guides` bucket, its byte size, the file name it was uploaded
--    under, and who uploaded it, when and through which AI app, stamped the
--    same way. At least one file per guide — a guide is created together with
--    its first file and its last file cannot be removed — so a reader's
--    fallback (their locale, then English, then the first written) always
--    finds one.
-- 3. **Every upload is a fresh object.** The path is
--    <guide id>/<locale>/<random uuid>.pdf, held by a CHECK, so a replaced
--    file is a new address and no cache anywhere can serve the old bytes under
--    it. Replacing a locale's file answers the path it replaced, and removing
--    one answers the path it removed, so the caller deletes that object.
--
-- **A guide is never deleted by the app**, as a testimonial is not: no
-- function deletes one, and of the Data API roles only the service role holds
-- DELETE, which no app path uses — it is how the DB test suite removes the rows
-- it creates. A guide comes off a page when the page is saved without it.
--
-- ACCESS
--
-- The store is admin-only for the Data API: SELECT for authenticated behind an
-- admin policy, nothing for anon, and no write grant — the writers are the
-- admin-guarded functions below. The bucket is private: no public URL exists,
-- and no policy lets a non-admin read an object. Readers get a file only
-- through the download route, which asks the database on the reader's own
-- session which file they may have and then reads it with the service role.

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.guides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label          text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_via    uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_saved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_saved_via uuid,
  CONSTRAINT chk_guides_label_present CHECK (btrim(label) <> ''),
  CONSTRAINT chk_guides_label_length CHECK (char_length(label) <= 200)
);

COMMENT ON TABLE public.guides IS 'Marketing''s store of guides — PDFs a landing page hands out, one file per site locale in guide_files: the admin-only label and the record of who created each and who last saved it. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_guide, save_guide_label, save_guide_file and remove_guide_file, and nothing deletes a guide: once created it stays.';
COMMENT ON COLUMN public.guides.label IS 'What the admins call the guide in their lists and pickers. Never shown to a reader: the landing page section placing the guide carries the words a reader sees. Trimmed, required, at most 200 characters.';
COMMENT ON COLUMN public.guides.created_at IS 'When the guide was created, stamped by stamp_guide_saver and never moved.';
COMMENT ON COLUMN public.guides.created_by IS 'The admin who created the guide, stamped from auth.uid() by stamp_guide_saver. NULL when the create had no signed-in caller (a migration, the service role, psql) or the account has since gone (SET NULL).';
COMMENT ON COLUMN public.guides.created_via IS 'The OAuth client — an AI app connected through the MCP endpoint — the create came through, read from the token''s client_id claim by stamp_guide_saver. NULL for a create made in Sogverse itself, and whenever created_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record outlives it.';
COMMENT ON COLUMN public.guides.updated_at IS 'When the guide was last saved — its label or any of its files — stamped by stamp_guide_saver: every writer names this column, which is what fires the trigger.';
COMMENT ON COLUMN public.guides.last_saved_by IS 'The admin whose write last saved the guide, stamped from auth.uid() by stamp_guide_saver. NULL when that write had no signed-in caller, or the account has since gone (SET NULL).';
COMMENT ON COLUMN public.guides.last_saved_via IS 'The OAuth client the last save came through, read from the token''s client_id claim by stamp_guide_saver. NULL for a save made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key, as created_via.';

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_guides ON public.guides
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.guides TO authenticated;
GRANT ALL ON TABLE public.guides TO service_role;

CREATE TABLE public.guide_files (
  guide_id     uuid NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  locale       text NOT NULL,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  byte_size    integer NOT NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_via uuid,
  PRIMARY KEY (guide_id, locale),
  CONSTRAINT uq_guide_files_storage_path UNIQUE (storage_path),
  CONSTRAINT chk_guide_files_locale_format CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'),
  CONSTRAINT chk_guide_files_path_scheme CHECK (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]{2,3}(-[a-z]{2})?/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    AND split_part(storage_path, '/', 1) = guide_id::text
    AND split_part(storage_path, '/', 2) = locale
  ),
  CONSTRAINT chk_guide_files_file_name_present CHECK (btrim(file_name) <> '' AND char_length(file_name) <= 255),
  CONSTRAINT chk_guide_files_byte_size CHECK (byte_size BETWEEN 1 AND 4194304)
);

COMMENT ON TABLE public.guide_files IS 'One language''s file of a guide: the PDF a reader of that site locale downloads. Any set of locales, at least one per guide: create_guide writes the first and remove_guide_file refuses the last. Readers get the file of their locale, else English, else the first written. Admin-only for the Data API, as guides is.';
COMMENT ON COLUMN public.guide_files.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';
COMMENT ON COLUMN public.guide_files.storage_path IS 'The object in the private guides bucket: <guide id>/<locale>/<random uuid>.pdf (chk_guide_files_path_scheme). Every upload is a fresh path, so replacing a file never serves the old bytes from any cache under the new address; the writers answer the path a replace or a removal let go, and the caller deletes that object.';
COMMENT ON COLUMN public.guide_files.file_name IS 'The file name the PDF was uploaded under, which a download is offered as. Trimmed, required, at most 255 characters.';
COMMENT ON COLUMN public.guide_files.byte_size IS 'The object''s size in bytes, measured by the uploader before it stored the object: at most 4 MB, the guides bucket''s own cap.';
COMMENT ON COLUMN public.guide_files.uploaded_at IS 'When this file was uploaded, stamped by stamp_guide_file_uploader on every new object.';
COMMENT ON COLUMN public.guide_files.uploaded_by IS 'The admin who uploaded this file, stamped from auth.uid() by stamp_guide_file_uploader. NULL when the upload had no signed-in caller, or the account has since gone (SET NULL).';
COMMENT ON COLUMN public.guide_files.uploaded_via IS 'The OAuth client the upload came through, read from the token''s client_id claim by stamp_guide_file_uploader. NULL for an upload made in Sogverse itself, and whenever uploaded_by is NULL.';

ALTER TABLE public.guide_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_guide_files ON public.guide_files
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.guide_files TO authenticated;
GRANT ALL ON TABLE public.guide_files TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Who created, saved and uploaded
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.stamp_guide_saver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_by  uuid := auth.uid();
  v_via uuid;
BEGIN
  -- A client is recorded only beside a saver: with no signed-in caller there
  -- is no token whose claim could name one.
  IF v_by IS NOT NULL THEN
    v_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at  := now();
    NEW.created_by  := v_by;
    NEW.created_via := v_via;
  ELSE
    NEW.created_at  := OLD.created_at;
    NEW.created_by  := OLD.created_by;
    NEW.created_via := OLD.created_via;
  END IF;

  NEW.updated_at     := now();
  NEW.last_saved_by  := v_by;
  NEW.last_saved_via := v_via;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_guide_saver() IS 'BEFORE INSERT, and BEFORE UPDATE OF updated_at, on guides: stamps who created the guide and when on the insert (and keeps them on every update), and who last saved it, when, and through which AI app (the token''s client_id claim) on both, overwriting whatever the statement said — so it is those columns'' only writer. Every guide writer names updated_at. The column list keeps a profile deletion''s SET NULL from being re-stamped as a save.';

REVOKE ALL ON FUNCTION public.stamp_guide_saver() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_guide_saver() TO service_role;

CREATE TRIGGER trg_guides_stamp_saver
  BEFORE INSERT OR UPDATE OF updated_at ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.stamp_guide_saver();

CREATE FUNCTION public.stamp_guide_file_uploader()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_by  uuid := auth.uid();
  v_via uuid;
BEGIN
  IF v_by IS NOT NULL THEN
    v_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  NEW.uploaded_at  := now();
  NEW.uploaded_by  := v_by;
  NEW.uploaded_via := v_via;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_guide_file_uploader() IS 'BEFORE INSERT, and BEFORE UPDATE OF storage_path, on guide_files: stamps who uploaded the file, when, and through which AI app (the token''s client_id claim), overwriting whatever the statement said. A new object is a new path, so a replace is stamped as the upload it is.';

REVOKE ALL ON FUNCTION public.stamp_guide_file_uploader() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_guide_file_uploader() TO service_role;

CREATE TRIGGER trg_guide_files_stamp_uploader
  BEFORE INSERT OR UPDATE OF storage_path ON public.guide_files
  FOR EACH ROW EXECUTE FUNCTION public.stamp_guide_file_uploader();

-- ---------------------------------------------------------------------------
-- 3. The writers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.check_guide_label(p_label text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
  IF btrim(COALESCE(p_label, '')) = '' THEN
    RAISE EXCEPTION 'A guide needs a label'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(btrim(p_label)) > 200 THEN
    RAISE EXCEPTION 'A guide''s label is at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_guide_label(p_label text) IS 'The label rule create_guide and save_guide_label check before they write, refusing with a sentence an admin can act on (check_violation): written, and at most 200 characters once trimmed. Not exposed: granted to no Data API role but the service role.';

REVOKE ALL ON FUNCTION public.check_guide_label(p_label text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_guide_label(p_label text) TO service_role;

CREATE FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
  IF btrim(COALESCE(p_file_name, '')) = '' THEN
    RAISE EXCEPTION 'The % file needs its file name', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_byte_size IS NULL OR p_byte_size < 1 THEN
    RAISE EXCEPTION 'The % file is empty', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_byte_size > 4194304 THEN
    RAISE EXCEPTION 'The % file is larger than 4 MB', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) IS 'The file rule create_guide and save_guide_file check before they write, refusing with a sentence naming the locale (check_violation): a file name, and a size from one byte to 4 MB. The path''s shape is chk_guide_files_path_scheme''s to refuse, since only the uploader builds it. Not exposed: granted to no Data API role but the service role.';

REVOKE ALL ON FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_guide_file(p_locale text, p_file_name text, p_byte_size integer) TO service_role;

CREATE FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_guide_label(p_label);
  PERFORM public.check_guide_file(p_locale, p_file_name, p_byte_size);

  INSERT INTO public.guides (id, label)
  VALUES (p_id, btrim(p_label));

  INSERT INTO public.guide_files (guide_id, locale, storage_path, file_name, byte_size)
  VALUES (p_id, p_locale, p_storage_path, btrim(p_file_name), p_byte_size);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) IS 'Admin-gated create of a guide together with its first file, since a guide is never empty; returns its id. The id is the caller''s, because the object was uploaded first under a path that names it (<id>/<locale>/<random uuid>.pdf, chk_guide_files_path_scheme). The label is checked by check_guide_label and the file by check_guide_file (check_violation); an id already taken raises unique_violation. Who created it and who uploaded the file are stamped by triggers. SECURITY DEFINER because neither guide table carries a write grant.';

REVOKE ALL ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_guide(p_id uuid, p_label text, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO service_role;

CREATE FUNCTION public.save_guide_label(p_id uuid, p_label text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_guide_label(p_label);

  UPDATE public.guides
     SET label = btrim(p_label),
         updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_guide_label(p_id uuid, p_label text) IS 'Admin-gated save of a guide''s label, checked by check_guide_label (check_violation); no file is touched. Returns its id; an id no guide has raises no_data_found. SECURITY DEFINER because neither guide table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_guide_label(p_id uuid, p_label text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_guide_label(p_id uuid, p_label text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_guide_label(p_id uuid, p_label text) TO service_role;

CREATE FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_replaced text;
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_guide_file(p_locale, p_file_name, p_byte_size);

  -- Written first, so an id no guide has is refused before any file is, so
  -- the save is stamped, and so two uploads to one guide take turns: the
  -- second reads the path the first wrote.
  UPDATE public.guides
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT f.storage_path INTO v_replaced
    FROM public.guide_files f
   WHERE f.guide_id = p_id AND f.locale = p_locale;

  INSERT INTO public.guide_files AS f (guide_id, locale, storage_path, file_name, byte_size)
  VALUES (p_id, p_locale, p_storage_path, btrim(p_file_name), p_byte_size)
  ON CONFLICT (guide_id, locale) DO UPDATE
     SET storage_path = EXCLUDED.storage_path,
         file_name    = EXCLUDED.file_name,
         byte_size    = EXCLUDED.byte_size;

  -- The same path sent again names the object now stored, which is not the
  -- caller's to delete.
  RETURN NULLIF(v_replaced, p_storage_path);
END;
$$;

COMMENT ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) IS 'Admin-gated write of one language''s file of a guide, replacing what that locale held or adding the locale; no other file is touched. Returns the storage path it replaced — the object the caller now deletes — or NULL when the locale had none. The file is checked by check_guide_file (check_violation naming the locale); a malformed locale or path fails the table''s CHECKs; an id no guide has raises no_data_found. SECURITY DEFINER because neither guide table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_guide_file(p_id uuid, p_locale text, p_storage_path text, p_file_name text, p_byte_size integer) TO service_role;

CREATE FUNCTION public.remove_guide_file(p_id uuid, p_locale text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_removed text;
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.guides
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guide not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guide_files
     WHERE guide_id = p_id AND locale = p_locale
  ) THEN
    RAISE EXCEPTION 'The guide has no % file', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guide_files
     WHERE guide_id = p_id AND locale <> p_locale
  ) THEN
    RAISE EXCEPTION 'That is the guide''s only file, and a guide needs one'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.guide_files
   WHERE guide_id = p_id AND locale = p_locale
  RETURNING storage_path INTO v_removed;

  RETURN v_removed;
END;
$$;

COMMENT ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) IS 'Admin-gated removal of one language''s file of a guide; no other is touched. Returns the storage path it removed — the object the caller now deletes. Refuses the guide''s last file (check_violation); an id no guide has, or a locale it has no file in, raises no_data_found. SECURITY DEFINER because neither guide table carries a write grant.';

REVOKE ALL ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_guide_file(p_id uuid, p_locale text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The bucket
-- ---------------------------------------------------------------------------

-- Private: no object has a public URL. The cap and the type are the upload
-- route's own: 4 MB, PDF only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guides', 'guides', false, 4194304, ARRAY['application/pdf']);

-- The uploader writes and deletes through the service-role client, which
-- bypasses RLS, and the download route reads the same way. These are what an
-- admin's own session is held to: an admin may read, write and delete, and no
-- other role has any policy here, so a signed-in reader cannot fetch an object
-- by its path.
CREATE POLICY guides_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'guides' AND public.get_user_role() = 'admin');

CREATE POLICY guides_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guides' AND public.get_user_role() = 'admin');

CREATE POLICY guides_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'guides' AND public.get_user_role() = 'admin')
  WITH CHECK (bucket_id = 'guides' AND public.get_user_role() = 'admin');

CREATE POLICY guides_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'guides' AND public.get_user_role() = 'admin');
