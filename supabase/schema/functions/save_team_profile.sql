--
-- Name: save_team_profile(uuid, jsonb, text, text, smallint, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_pick smallint DEFAULT NULL::smallint, p_photo_path text DEFAULT NULL::text, p_opted_in boolean DEFAULT NULL::boolean) RETURNS text
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

  -- The checkbox is a readiness mark, not consent: whoever may edit the
  -- profile may set it. NULL keeps it as stored (off for a new profile).
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


--
-- Name: FUNCTION save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) IS 'The one writer of a team profile''s content: nickname, title (an admin''s only; a Gedu''s raises 22023), pick, photo path, the whole translation set (a JSON array of {locale, short_description, long_description, fun_fact}, replacing what was stored) and the checkbox, in one transaction. Guard-first for an admin or a Gedu; the target half is can_edit_team_profile — their own, or any admin''s or Gedu''s for an admin. The checkbox is a readiness mark, not consent, so any editor may set it; NULL keeps the stored value. Refuses with P0026 when the checkbox would be on while the profile is incomplete (no photo, an admin''s profile with no title, no language, or a language missing either description), and with P0027 a photo path that has no object in the team-photos bucket (a save from a page opened before another save replaced and removed that photo). A save that leaves the checkbox off also hides the profile (approved false, the admin decision stamp left as it was), so ticking it again waits for an admin to make it public; a save that leaves it on does not change whether it is public, whoever saves. Returns the photo path the save replaced, or NULL, so the caller can remove that object through the storage API.';


--
-- Name: FUNCTION save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) TO authenticated;
GRANT ALL ON FUNCTION public.save_team_profile(p_user_id uuid, p_translations jsonb, p_nickname text, p_title text, p_pick smallint, p_photo_path text, p_opted_in boolean) TO service_role;


