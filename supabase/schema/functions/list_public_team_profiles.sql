--
-- Name: list_public_team_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_public_team_profiles() RETURNS TABLE(user_id uuid, role public.user_role, first_name text, last_name text, nickname text, title text, pick smallint, spoken_languages public.spoken_language[], photo_version text, translations jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT tp.user_id,
         p.role,
         p.first_name,
         -- An admin is public by full name and title; a Gedu by first name
         -- and gamer tag alone.
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


--
-- Name: FUNCTION list_public_team_profiles(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_public_team_profiles() IS 'The public team page: every team profile an admin has made public (approved), of a person who is still an admin or a Gedu, trainee Gedus included. Crosses the boundary that anon holds no grant on the team tables and authenticated reads only its own row or, as an admin, everyone''s, and hands back the public slice alone: id, role, first name, the last name and title for an admin only (NULL for a Gedu, who is public by first name and gamer tag), nickname, pick, spoken languages, a photo version token (md5 of the photo''s object path, so a new photo is a new address; the path itself is not returned) and the translations as a JSON array of {locale, short_description, long_description, fun_fact} ordered by locale. Nothing else from profiles. Admins first, then Gedus; within each by first name, then nickname, then id. Answers every caller identically.';


--
-- Name: FUNCTION list_public_team_profiles(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_public_team_profiles() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_public_team_profiles() TO anon;
GRANT ALL ON FUNCTION public.list_public_team_profiles() TO authenticated;
GRANT ALL ON FUNCTION public.list_public_team_profiles() TO service_role;


