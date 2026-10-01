-- Approved team profiles are public.
--
-- WHAT THIS ADDS
--
-- The public team page reads every team profile an admin has made public,
-- signed in or not, and serves each one's photo through the app's own address.
--
-- 1. `list_public_team_profiles()` — every approved profile of an admin or a
--    Gedu, narrowed to what the public page shows, admins first and then
--    Gedus, each by first name, then nickname, then id.
-- 2. `get_public_team_profile(uuid)` — one row of that same list, or none for
--    a person whose profile is not public or who does not exist.
-- 3. `is_public_team_photo(text)` — whether a team-photos object is the
--    current photo of a public profile, and the storage read policy that asks
--    it, so anyone may read exactly those objects and nothing else in the
--    bucket. The bucket stays private.
-- 4. The "ready" checkbox's comments say what it is: a readiness mark. Owner
--    decision, 2026-10-01: a profile is public once an admin approves it, and
--    the checkbox is a readiness mark and nothing more.
--
-- WHAT A PUBLIC PROFILE CARRIES
--
-- Owner decision, 2026-10-01: every approved profile is public, a trainee
-- Gedu's included. A Gedu is public by first name and nickname, an admin by
-- full name and title, so the last name and the title come back only for an
-- admin. Nothing else is read from `profiles` beyond the role, the first name
-- and the spoken languages: no email, phone, dates, certification or trainee
-- standing. The photo is named by a version token, an md5 of its object path,
-- which changes whenever the photo does, so the public photo address can carry
-- it and a new photo is a new address; the path itself is not handed out.
--
-- WHY FUNCTIONS
--
-- `anon` holds no grant on either team table and `authenticated` reads only
-- its own row or, as an admin, everyone's. A policy admitting public rows
-- would publish the raw tables, every column, to every browser; the functions
-- cross that boundary and hand back the narrowed public slice instead.

-- ---------------------------------------------------------------------------
-- 1. The public list
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.list_public_team_profiles()
RETURNS TABLE (
  user_id          uuid,
  role             public.user_role,
  first_name       text,
  last_name        text,
  nickname         text,
  title            text,
  pick             smallint,
  spoken_languages public.spoken_language[],
  photo_version    text,
  translations     jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT tp.user_id,
         p.role,
         p.first_name,
         -- An admin is public by full name and title; a Gedu by first name
         -- and nickname alone.
         CASE WHEN p.role = 'admin' THEN p.last_name END,
         tp.nickname,
         CASE WHEN p.role = 'admin' THEN tp.title END,
         tp.pick,
         p.spoken_languages,
         md5(tp.photo_path),
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object(
                     'locale', t.locale,
                     'short_description', t.short_description,
                     'long_description', t.long_description,
                     'fun_fact', t.fun_fact)
                   ORDER BY t.locale)
              FROM public.team_profile_translations t
             WHERE t.user_id = tp.user_id),
           '[]'::jsonb)
    FROM public.team_profiles tp
    JOIN public.profiles p ON p.id = tp.user_id
   -- A profile row left behind by someone whose role has since changed is not
   -- public, whatever it says.
   WHERE tp.approved
     AND p.role IN ('admin', 'gedu')
   ORDER BY (p.role = 'admin') DESC,
            lower(p.first_name),
            lower(tp.nickname) NULLS LAST,
            tp.user_id;
$$;

COMMENT ON FUNCTION public.list_public_team_profiles() IS 'The public team page: every team profile an admin has made public (approved), of a person who is still an admin or a Gedu, trainee Gedus included. Crosses the boundary that anon holds no grant on the team tables and authenticated reads only its own row or, as an admin, everyone''s, and hands back the public slice alone: id, role, first name, the last name and title for an admin only (NULL for a Gedu, who is public by first name and nickname), nickname, pick, spoken languages, a photo version token (md5 of the photo''s object path, so a new photo is a new address; the path itself is not returned) and the translations as a JSON array of {locale, short_description, long_description, fun_fact} ordered by locale. Nothing else from profiles. Admins first, then Gedus; within each by first name, then nickname, then id. Answers every caller identically.';

REVOKE EXECUTE ON FUNCTION public.list_public_team_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_team_profiles() TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_team_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_team_profiles() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. One public profile
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER over the list, so "public" has one definition and this
-- cannot answer with anything the list would not.
CREATE FUNCTION public.get_public_team_profile(p_user_id uuid)
RETURNS TABLE (
  user_id          uuid,
  role             public.user_role,
  first_name       text,
  last_name        text,
  nickname         text,
  title            text,
  pick             smallint,
  spoken_languages public.spoken_language[],
  photo_version    text,
  translations     jsonb
)
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT l.*
    FROM public.list_public_team_profiles() l
   WHERE l.user_id = p_user_id;
$$;

COMMENT ON FUNCTION public.get_public_team_profile(p_user_id uuid) IS 'One person''s public team profile, the same row list_public_team_profiles gives them, or no row when their profile is not public, they are neither an admin nor a Gedu, or no such person exists (NULL included). SECURITY INVOKER over list_public_team_profiles, so it can answer with nothing the list would not. Answers every caller identically.';

REVOKE EXECUTE ON FUNCTION public.get_public_team_profile(p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_team_profile(p_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_team_profile(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_team_profile(p_user_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Public photos
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.is_public_team_photo(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.team_profiles tp
      JOIN public.profiles p ON p.id = tp.user_id
     WHERE tp.photo_path = p_name
       AND tp.approved
       AND p.role IN ('admin', 'gedu'));
$$;

COMMENT ON FUNCTION public.is_public_team_photo(p_name text) IS 'Whether a team-photos object name is the current photo of a profile list_public_team_profiles shows: approved, of a person who is still an admin or a Gedu. A total boolean (false for NULL). The predicate of the team_photos_public_read storage policy, which anon evaluates itself, so it is SECURITY DEFINER over team tables anon holds no grant on, and answers only yes or no about a name. A photo replaced, or a profile hidden, stops answering yes at once.';

REVOKE EXECUTE ON FUNCTION public.is_public_team_photo(p_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_team_photo(p_name text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_public_team_photo(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_team_photo(p_name text) TO service_role;

-- Anyone may read a team photo while it is the current photo of a public
-- profile. The app's public photo route reads through this with no session;
-- every other object in the bucket stays readable by its owner and admins
-- alone.
CREATE POLICY team_photos_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'team-photos'
    AND public.is_public_team_photo(name)
  );

-- ---------------------------------------------------------------------------
-- 4. The checkbox is a readiness mark
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.team_profiles.opted_in IS 'The profile''s "ready" mark: the profile is finished and waiting for an admin to make it public. The person or any admin may save it, only while the profile is complete; while it is on, every save has to leave the profile complete. A save that passes NULL keeps it as stored. Saving the profile not ready also hides it (approved becomes false).';

COMMENT ON COLUMN public.team_profiles.approved IS 'Whether an admin has made the profile public; the public team page shows every approved profile of an admin or a Gedu (list_public_team_profiles). Set true only by set_team_profile_approval and only while the checkbox is on; set false by that function (an admin hiding it) or by save_team_profile whenever a save leaves the checkbox off, so re-ticking ready waits for an admin again. Never true while opted_in is false (CHECK team_profiles_public_only_when_ready). While it is true, later edits go live with no second look.';

-- save_team_profile is redefined only to reword one body comment; the body is
-- otherwise unchanged.
CREATE OR REPLACE FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_pick smallint DEFAULT NULL::smallint, p_photo_path text DEFAULT NULL::text, p_opted_in boolean DEFAULT NULL::boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_target_role public.user_role;
  v_opted_in    boolean;
  v_old_photo   text;
  v_new_photo   text := NULLIF(btrim(p_photo_path), '');
  v_title       text;
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

  -- The checkbox is a readiness mark: whoever may edit the profile may set
  -- it. NULL keeps it as stored (off for a new profile).
  v_opted_in := COALESCE(p_opted_in, v_opted_in, false);

  IF v_target_role = 'gedu' AND NULLIF(btrim(p_title), '') IS NOT NULL THEN
    RAISE EXCEPTION 'A Gedu''s title is the role; it is not written'
      USING ERRCODE = '22023';
  END IF;

  -- An admin's title as stored: trimmed, and NULL when blank.
  v_title := CASE WHEN v_target_role = 'admin' THEN NULLIF(btrim(p_title), '') END;

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
          v_title,
          p_pick,
          v_new_photo,
          v_opted_in)
  ON CONFLICT (user_id) DO UPDATE
     SET nickname   = EXCLUDED.nickname,
         title      = EXCLUDED.title,
         pick       = EXCLUDED.pick,
         photo_path = EXCLUDED.photo_path,
         opted_in   = EXCLUDED.opted_in,
         -- Readiness gates visibility: a profile saved not ready is hidden,
         -- and ticking ready again waits for an admin to make it public. The
         -- stamp keeps the last admin decision; this one is not an admin's.
         approved   = tp.approved AND EXCLUDED.opted_in;

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

  -- Complete: a photo, an admin's title, at least one language, and both
  -- descriptions in every language written — a reader of any of them would
  -- otherwise meet half a profile. A Gedu has no title to write. The same
  -- rule the editor shows the person before they save.
  SELECT v_new_photo IS NOT NULL
         AND (v_target_role <> 'admin' OR v_title IS NOT NULL)
         AND EXISTS (SELECT 1 FROM public.team_profile_translations t
                      WHERE t.user_id = p_user_id)
         AND NOT EXISTS (SELECT 1 FROM public.team_profile_translations t
                          WHERE t.user_id = p_user_id
                            AND (t.short_description = '' OR t.long_description = ''))
    INTO v_complete;

  IF v_opted_in AND NOT v_complete THEN
    RAISE EXCEPTION 'A profile marked ready has to be complete: a photo, an admin''s title, and both descriptions in every language written'
      USING ERRCODE = 'P0026';
  END IF;

  -- The photo this save replaced, for the caller to remove from the bucket.
  -- The object is left to the caller because the storage API, not SQL, is
  -- what removes one (a DELETE on storage.objects orphans the backing file).
  RETURN CASE WHEN v_old_photo IS DISTINCT FROM v_new_photo THEN v_old_photo END;
END;
$$;

COMMENT ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) IS 'The one writer of a team profile''s content: nickname, title (an admin''s only; a Gedu''s raises 22023), pick, photo path, the whole translation set (a JSON array of {locale, short_description, long_description, fun_fact}, replacing what was stored) and the checkbox, in one transaction. Guard-first for an admin or a Gedu; the target half is can_edit_team_profile — their own, or any admin''s or Gedu''s for an admin. The checkbox is a readiness mark that any editor may set; NULL keeps the stored value. Refuses with P0026 when the checkbox would be on while the profile is incomplete (no photo, an admin''s profile with no title, no language, or a language missing either description), and with P0027 a photo path that has no object in the team-photos bucket (a save from a page opened before another save replaced and removed that photo). A save that leaves the checkbox off also hides the profile (approved false, the admin decision stamp left as it was), so ticking it again waits for an admin to make it public; a save that leaves it on does not change whether it is public, whoever saves. Returns the photo path the save replaced, or NULL, so the caller can remove that object through the storage API.';

REVOKE EXECUTE ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) TO service_role;
