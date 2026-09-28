-- Admins and Gedus write team profiles.
--
-- WHAT THIS ADDS
--
-- A team profile is the public page about one member of staff: an admin or a
-- Gedu. Other roles have none. Their name and spoken languages are not part of
-- it: those are read from `profiles`, where the person already keeps them.
--
-- 1. `team_profiles`, one row per person, keyed by their profile id: the
--    optional nickname, an admin's free-text title, the optional accent colour,
--    the photo's object path, the checkbox (`opted_in`: a Gedu's "ready", an
--    admin's "show") and, for a Gedu, an admin's yes or no (`approved`) with
--    who last changed it and when.
-- 2. `team_profile_translations`, one row per (person, site locale): the short
--    description, the long description (markdown) and the optional fun fact.
-- 3. `can_edit_team_profile(uuid)` — whether the caller may write this person's
--    profile: their own, as an admin or a Gedu; or, as an admin, any admin's or
--    Gedu's. The storage policies and the save function both ask it.
-- 4. `save_team_profile(...)` — the one writer of both tables' content: the
--    profile row, the whole translation set and the checkbox, in one
--    transaction, refusing a checkbox that is on while the profile is not
--    complete (SQLSTATE P0026), and a photo path with no object behind it
--    (P0027).
-- 5. `set_team_profile_approval(uuid, boolean)` — the one writer of the
--    approval, admin-only. An admin approves only a profile marked ready
--    (P0028 otherwise) and may take an approval back at any time; unticking
--    ready leaves the approval standing.
-- 6. The private `team-photos` storage bucket and its policies: the owner and
--    an admin read; whoever may edit the profile writes and deletes. Objects
--    live at `<person's id>/<name>`.
--
-- WHY FUNCTIONS WRITE AND THE TABLES CARRY NO WRITE GRANT
--
-- The rule that a profile which is on must be complete spans both tables, and
-- the approval is an admin's alone while the rest is the editor's. A table
-- grant would make each of those a policy written half-right; functions hold
-- them, and `authenticated` gets SELECT alone. Reads are plain queries under
-- the SELECT policies.
--
-- WHY AN ADMIN MAY SET SOMEONE ELSE'S CHECKBOX
--
-- The checkbox marks the profile as ready; it is not the person's consent.
-- Admins are trusted and manage profiles for busy staff — "you forgot to tick
-- ready, I'll do it for you" — so an admin may edit any admin's or Gedu's
-- profile, checkbox included, under the same completeness rule as the person.

-- ---------------------------------------------------------------------------
-- 1. The profile
-- ---------------------------------------------------------------------------

CREATE TABLE public.team_profiles (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    nickname text,
    title text,
    pick smallint,
    photo_path text,
    opted_in boolean NOT NULL DEFAULT false,
    approved boolean NOT NULL DEFAULT false,
    approval_decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    approval_decided_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT team_profiles_nickname_check CHECK (
      nickname IS NULL
      OR (nickname = btrim(nickname) AND char_length(nickname) BETWEEN 1 AND 32)),
    CONSTRAINT team_profiles_title_check CHECK (
      title IS NULL
      OR (title = btrim(title) AND char_length(title) BETWEEN 1 AND 60)),
    CONSTRAINT team_profiles_pick_check CHECK (pick IS NULL OR pick BETWEEN 1 AND 16),
    CONSTRAINT team_profiles_photo_path_in_own_folder CHECK (
      photo_path IS NULL OR photo_path ~ ('^' || user_id::text || '/[^/]+$')),
    -- An approval always says who gave it and when; only a profile no admin
    -- has ever decided about carries no stamp.
    CONSTRAINT team_profiles_approval_stamped CHECK (
      NOT approved OR approval_decided_at IS NOT NULL)
);

COMMENT ON TABLE public.team_profiles IS 'One member of staff''s team profile: an admin''s or a Gedu''s, keyed by their profile id. Name and spoken languages are not stored here; they are read from profiles. Written only by save_team_profile (content and the checkbox) and set_team_profile_approval (the approval); authenticated holds SELECT alone. Public when opted_in, and for a Gedu also approved.';
COMMENT ON COLUMN public.team_profiles.nickname IS 'What gamers know the person as. A name they chose, never translated. NULL for none.';
COMMENT ON COLUMN public.team_profiles.title IS 'An admin''s office title, e.g. "Chief Engineer". Always NULL for a Gedu, whose title is the role itself; save_team_profile refuses one.';
COMMENT ON COLUMN public.team_profiles.pick IS 'The accent colour the person picked, a SOG-UI pick id from 1 to 16, or NULL for none: the page then carries the brand''s colours alone.';
COMMENT ON COLUMN public.team_profiles.photo_path IS 'The photo''s object name in the team-photos bucket, always inside the person''s own folder: <user_id>/<name>. The client crops every upload to an 800 × 1000 portrait before it is stored. NULL for none, which keeps the profile incomplete.';
COMMENT ON COLUMN public.team_profiles.opted_in IS 'The profile''s readiness mark: a Gedu''s "ready", an admin''s "show". Not consent: the person or any admin may save it, only while the profile is complete; while it is on, every save has to leave the profile complete. A save that passes NULL keeps it as stored.';
COMMENT ON COLUMN public.team_profiles.approved IS 'An admin''s yes or no to a Gedu''s profile being public, given only while the checkbox is on and surviving it being turned off and on: while it is true, the Gedu''s later edits go live with no second look. Written only by set_team_profile_approval. Always false for an admin''s profile, which has no approval.';
COMMENT ON COLUMN public.team_profiles.approval_decided_by IS 'The admin who last changed the approval, or NULL before any admin has, or once that admin''s account is gone (ON DELETE SET NULL: losing the admin must never take a Gedu''s profile down).';
COMMENT ON COLUMN public.team_profiles.approval_decided_at IS 'When an admin last changed the approval, or NULL before any admin has. Never NULL while approved.';

CREATE TRIGGER team_profiles_updated_at BEFORE UPDATE ON public.team_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;

-- The owner reads their own; an admin reads everyone's. Nobody else reads the
-- table: a public read of the published profiles will be a function that hands
-- back only those, not a wider policy.
CREATE POLICY team_profiles_owner_or_admin_read ON public.team_profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON TABLE public.team_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.team_profiles TO authenticated;
GRANT ALL ON TABLE public.team_profiles TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The translations
-- ---------------------------------------------------------------------------

CREATE TABLE public.team_profile_translations (
    user_id uuid NOT NULL REFERENCES public.team_profiles(user_id) ON DELETE CASCADE,
    locale text NOT NULL,
    short_description text NOT NULL DEFAULT '',
    long_description text NOT NULL DEFAULT '',
    fun_fact text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, locale),
    CONSTRAINT team_profile_translations_locale_format CHECK (locale ~ '^[a-z]{2,3}$'),
    CONSTRAINT team_profile_translations_short_description_check CHECK (
      short_description = btrim(short_description)
      AND char_length(short_description) <= 140
      AND short_description !~ '[\r\n]'),
    CONSTRAINT team_profile_translations_long_description_check CHECK (
      long_description = btrim(long_description)
      AND char_length(long_description) <= 5000),
    CONSTRAINT team_profile_translations_fun_fact_check CHECK (
      fun_fact IS NULL
      OR (fun_fact = btrim(fun_fact) AND char_length(fun_fact) BETWEEN 1 AND 200)),
    CONSTRAINT team_profile_translations_not_empty CHECK (
      short_description <> '' OR long_description <> '' OR fun_fact IS NOT NULL)
);

COMMENT ON TABLE public.team_profile_translations IS 'What a person wrote on their team profile in one site locale. Any set of locales; a row may be half-written while the profile is not on, but a profile that is on has at least one row and every row carries both descriptions (save_team_profile enforces it). Written only by save_team_profile; authenticated holds SELECT alone.';
COMMENT ON COLUMN public.team_profile_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';
COMMENT ON COLUMN public.team_profile_translations.short_description IS 'One line of plain text: the person''s opening line under their name. Empty only while unwritten.';
COMMENT ON COLUMN public.team_profile_translations.long_description IS '"About me", markdown rendered in the profile variant. Empty only while unwritten.';
COMMENT ON COLUMN public.team_profile_translations.fun_fact IS 'Optional; NULL leaves the aside off the page. Never counts towards completeness.';

CREATE TRIGGER team_profile_translations_updated_at BEFORE UPDATE ON public.team_profile_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.team_profile_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_profile_translations_owner_or_admin_read ON public.team_profile_translations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON TABLE public.team_profile_translations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.team_profile_translations TO authenticated;
GRANT ALL ON TABLE public.team_profile_translations TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Who may edit whose
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.can_edit_team_profile(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- Their own, for the two roles that have one.
    (p_user_id = (SELECT auth.uid())
       AND (SELECT public.get_user_role()) IN ('admin', 'gedu'))
    -- Any admin's or Gedu's, for an admin, who manages profiles for staff.
    OR ((SELECT public.is_admin())
        AND EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = p_user_id AND p.role IN ('admin', 'gedu'))),
    false);
$$;

COMMENT ON FUNCTION public.can_edit_team_profile(p_user_id uuid) IS 'Whether the caller may write this person''s team profile, checkbox and photo: their own as an admin or a Gedu, or any admin''s or Gedu''s as an admin. A total boolean (false for NULL). SECURITY INVOKER: it reads only the caller''s own role and a profiles row the caller''s RLS already shows them (an admin reads every profile), so it cannot answer about anything the caller could not see. The team-photos storage policies and save_team_profile both ask it.';

REVOKE EXECUTE ON FUNCTION public.can_edit_team_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_team_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_team_profile(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The save
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.save_team_profile(
    p_user_id uuid,
    p_translations jsonb,
    p_nickname text DEFAULT NULL,
    p_title text DEFAULT NULL,
    p_pick smallint DEFAULT NULL,
    p_photo_path text DEFAULT NULL,
    p_opted_in boolean DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_target_role public.user_role;
  v_opted_in    boolean;
  v_old_photo   text;
  v_new_photo   text := NULLIF(btrim(p_photo_path), '');
  v_complete    boolean;
BEGIN
  -- An admin or a Gedu; everyone else is refused on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'save_team_profile needs the person whose profile it is'
      USING ERRCODE = '22004';
  END IF;

  -- The target half: their own, or any admin's or Gedu's for an admin.
  IF NOT public.can_edit_team_profile(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.role INTO v_target_role FROM public.profiles p WHERE p.id = p_user_id;

  SELECT tp.opted_in, tp.photo_path INTO v_opted_in, v_old_photo
    FROM public.team_profiles tp
   WHERE tp.user_id = p_user_id
     FOR UPDATE;

  -- The checkbox is a readiness mark, not consent: whoever may edit the
  -- profile may set it. NULL keeps it as stored (off for a new profile).
  v_opted_in := COALESCE(p_opted_in, v_opted_in, false);

  IF v_target_role = 'gedu' AND NULLIF(btrim(p_title), '') IS NOT NULL THEN
    RAISE EXCEPTION 'A Gedu''s title is the role; it is not written'
      USING ERRCODE = '22023';
  END IF;

  IF p_translations IS NULL OR jsonb_typeof(p_translations) <> 'array' THEN
    RAISE EXCEPTION 'p_translations must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- The photo named has to be in the bucket. A save from a page opened before
  -- another save replaced the photo still names the old one, which that save
  -- removed; writing it would point the profile at nothing, and the path it
  -- returned as superseded would be the other save's photo.
  IF v_new_photo IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'team-photos' AND o.name = v_new_photo) THEN
    RAISE EXCEPTION 'The photo this save names is no longer stored'
      USING ERRCODE = 'P0027';
  END IF;

  INSERT INTO public.team_profiles AS tp
         (user_id, nickname, title, pick, photo_path, opted_in)
  VALUES (p_user_id,
          NULLIF(btrim(p_nickname), ''),
          CASE WHEN v_target_role = 'admin' THEN NULLIF(btrim(p_title), '') END,
          p_pick,
          v_new_photo,
          v_opted_in)
  ON CONFLICT (user_id) DO UPDATE
     SET nickname   = EXCLUDED.nickname,
         title      = EXCLUDED.title,
         pick       = EXCLUDED.pick,
         photo_path = EXCLUDED.photo_path,
         opted_in   = EXCLUDED.opted_in;

  -- The translation set is replaced whole: a locale the save no longer names
  -- is gone, and every named one is written as sent.
  DELETE FROM public.team_profile_translations t
   WHERE t.user_id = p_user_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_translations) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.team_profile_translations AS t
         (user_id, locale, short_description, long_description, fun_fact)
  SELECT p_user_id,
         r.locale,
         btrim(COALESCE(r.short_description, '')),
         btrim(COALESCE(r.long_description, '')),
         NULLIF(btrim(r.fun_fact), '')
    FROM jsonb_to_recordset(p_translations)
      AS r(locale text, short_description text, long_description text, fun_fact text)
  ON CONFLICT (user_id, locale) DO UPDATE
     SET short_description = EXCLUDED.short_description,
         long_description  = EXCLUDED.long_description,
         fun_fact          = EXCLUDED.fun_fact;

  -- Complete: a photo, at least one language, and both descriptions in every
  -- language written — a reader of any of them would otherwise meet half a
  -- profile. The same rule the editor shows the person before they save.
  SELECT v_new_photo IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.team_profile_translations t
                      WHERE t.user_id = p_user_id)
         AND NOT EXISTS (SELECT 1 FROM public.team_profile_translations t
                          WHERE t.user_id = p_user_id
                            AND (t.short_description = '' OR t.long_description = ''))
    INTO v_complete;

  IF v_opted_in AND NOT v_complete THEN
    RAISE EXCEPTION 'A profile that is shown has to be complete: a photo, and both descriptions in every language written'
      USING ERRCODE = 'P0026';
  END IF;

  -- The photo this save replaced, for the caller to remove from the bucket.
  -- The object is left to the caller because the storage API, not SQL, is
  -- what removes one (a DELETE on storage.objects orphans the backing file).
  RETURN CASE WHEN v_old_photo IS DISTINCT FROM v_new_photo THEN v_old_photo END;
END;
$$;

COMMENT ON FUNCTION public.save_team_profile(uuid, jsonb, text, text, smallint, text, boolean) IS 'The one writer of a team profile''s content: nickname, title (an admin''s only; a Gedu''s raises 22023), pick, photo path, the whole translation set (a JSON array of {locale, short_description, long_description, fun_fact}, replacing what was stored) and the checkbox, in one transaction. Guard-first for an admin or a Gedu; the target half is can_edit_team_profile — their own, or any admin''s or Gedu''s for an admin. The checkbox is a readiness mark, not consent, so any editor may set it; NULL keeps the stored value. Refuses with P0026 when the checkbox would be on while the profile is incomplete (no photo, no language, or a language missing either description), and with P0027 a photo path that has no object in the team-photos bucket (a save from a page opened before another save replaced and removed that photo). An admin''s edit does not touch the approval: admins are trusted. Returns the photo path the save replaced, or NULL, so the caller can remove that object through the storage API.';

REVOKE EXECUTE ON FUNCTION public.save_team_profile(uuid, jsonb, text, text, smallint, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_profile(uuid, jsonb, text, text, smallint, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_team_profile(uuid, jsonb, text, text, smallint, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The approval
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_team_profile_approval(
    p_user_id uuid,
    p_approved boolean
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current boolean;
  v_ready   boolean;
  v_role    public.user_role;
BEGIN
  PERFORM public.assert_admin();

  IF p_approved IS NULL THEN
    RAISE EXCEPTION 'set_team_profile_approval needs a yes or a no'
      USING ERRCODE = '22004';
  END IF;

  SELECT tp.approved, tp.opted_in, p.role INTO v_current, v_ready, v_role
    FROM public.team_profiles tp
    JOIN public.profiles p ON p.id = tp.user_id
   WHERE tp.user_id = p_user_id
     FOR UPDATE OF tp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team profile for this person' USING ERRCODE = 'P0002';
  END IF;

  IF v_role IS DISTINCT FROM 'gedu' THEN
    RAISE EXCEPTION 'Only a Gedu''s profile is approved' USING ERRCODE = '22023';
  END IF;

  -- Saying it again changes nothing, and keeps who last changed it — an
  -- approval standing on a profile whose ready has since been unticked
  -- included: repeating it is not a new approval.
  IF v_current = p_approved THEN
    RETURN;
  END IF;

  -- An admin approves what the profile's editor has marked ready, never ahead
  -- of it. Taking an approval back is open at any time.
  IF p_approved AND NOT v_ready THEN
    RAISE EXCEPTION 'A profile is approved only once it is marked ready'
      USING ERRCODE = 'P0028';
  END IF;

  UPDATE public.team_profiles
     SET approved            = p_approved,
         approval_decided_by = (SELECT auth.uid()),
         approval_decided_at = now()
   WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.set_team_profile_approval(uuid, boolean) IS 'An admin approves a Gedu''s team profile (true) or takes the approval back (false), stamping who changed it and when. Admin-only, guard-first. Approving needs the profile marked ready (opted_in) and refuses one that is not with P0028; taking the approval back is open at any time. Repeating the current value is a no-op that keeps the stamp, even for an approval whose profile has since been unmarked. Refuses a NULL decision (22004), an admin''s profile (22023) and a person with no profile row (P0002). Never touches the checkbox, and unticking it leaves the approval standing, so ticking it again makes the profile public with no second approval.';

REVOKE EXECUTE ON FUNCTION public.set_team_profile_approval(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_profile_approval(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_profile_approval(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The photos
-- ---------------------------------------------------------------------------

-- Private: a photo is read through a short-lived signed URL minted on the
-- reader's own session, so the SELECT policy below decides every read. The
-- client crops to an 800 × 1000 JPEG or WebP, which lands far under the cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('team-photos', 'team-photos', false, 2097152, ARRAY['image/jpeg', 'image/webp']);

CREATE POLICY team_photos_owner_or_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-photos'
    AND ((SELECT public.is_admin())
         OR (storage.foldername(name))[1] = (SELECT auth.uid())::text));

-- Written by whoever may edit the profile, into that person's own folder and
-- one level deep. The folder is parsed only when it is a uuid, so a malformed
-- name is refused rather than failing the cast.
CREATE POLICY team_photos_editor_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-photos'
    AND array_length(storage.foldername(name), 1) = 1
    AND public.can_edit_team_profile(
      CASE WHEN (storage.foldername(name))[1]
                ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN ((storage.foldername(name))[1])::uuid
      END));

CREATE POLICY team_photos_editor_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-photos'
    AND public.can_edit_team_profile(
      CASE WHEN (storage.foldername(name))[1]
                ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN ((storage.foldername(name))[1])::uuid
      END));
