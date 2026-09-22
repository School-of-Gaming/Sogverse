--
-- Name: user_list_entries; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_list_entries WITH (security_invoker='true') AS
 SELECT id,
    email,
    email_verified_at,
    first_name,
    last_name,
    role,
    phone,
    currency,
    home_location_id,
    utm_source,
    utm_medium,
    utm_campaign,
    locale,
    spoken_languages,
    created_at,
    updated_at,
    COALESCE(( SELECT gd.certified
           FROM public.gedu_profiles gd
          WHERE (gd.user_id = p.id)), false) AS certified,
    COALESCE(( SELECT gd.criminal_record_check_passed
           FROM public.gedu_profiles gd
          WHERE (gd.user_id = p.id)), false) AS criminal_record_check_passed,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'email', g.email, 'email_verified_at', g.email_verified_at, 'role', g.role, 'created_at', g.created_at, 'sign_in', gpr.sign_in) ORDER BY g.created_at, g.id) AS jsonb_agg
           FROM ((public.parent_gamer pg
             JOIN public.profiles g ON ((g.id = pg.gamer_id)))
             LEFT JOIN public.gamer_profiles gpr ON ((gpr.user_id = g.id)))
          WHERE (pg.parent_id = p.id)), '[]'::jsonb) AS linked_gamers,
    concat_ws(' '::text, first_name, last_name, email, phone, ( SELECT mc.minecraft_username
           FROM public.minecraft_accounts mc
          WHERE (mc.user_id = p.id)), ( SELECT rb.roblox_username
           FROM public.roblox_accounts rb
          WHERE (rb.user_id = p.id)), ( SELECT string_agg(concat_ws(' '::text, g.first_name, g.last_name, g.email, g.phone, gmc.minecraft_username, grb.roblox_username), ' '::text) AS string_agg
           FROM (((public.parent_gamer pg
             JOIN public.profiles g ON ((g.id = pg.gamer_id)))
             LEFT JOIN public.minecraft_accounts gmc ON ((gmc.user_id = g.id)))
             LEFT JOIN public.roblox_accounts grb ON ((grb.user_id = g.id)))
          WHERE (pg.parent_id = p.id))) AS family_search_blob
   FROM public.profiles p
  WHERE ((role <> 'gamer'::public.user_role) OR (NOT (EXISTS ( SELECT 1
           FROM public.parent_gamer pg
          WHERE (pg.gamer_id = p.id)))));


--
-- Name: VIEW user_list_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.user_list_entries IS 'One row per entry of the admin user list: every non-gamer profile, plus any gamer with no parent link. A linked gamer is not a row — it rides inside its parent''s linked_gamers array, so the parent-child collapse happens in the database rather than in the browser from two whole-table reads. Carries every profiles column, the two gedu standing flags, the children as JSON, and a family-wide search blob, so a page of 25 rows is one request and nothing a row renders needs a keyed follow-up read. SECURITY INVOKER, so RLS on profiles, parent_gamer, gamer_profiles, gedu_profiles, minecraft_accounts and roblox_accounts governs it exactly as a direct read of those tables would — which also means a role granted SELECT here must hold SELECT on all six, and that a caller who cannot see a link sees the child as a top-level row rather than as somebody''s. The FROM names one table and every derived value is a scalar subquery on purpose: that is what lets the newest page be an ordered index scan under a LIMIT, evaluating the children and the blob for the 25 rows it returns rather than for the whole table, and what lets an exact count skip them entirely. A join in the FROM would cost both.';


--
-- Name: COLUMN user_list_entries.certified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_list_entries.certified IS 'Whether an admin has vouched for this educator, from the 1:1 gedu_profiles row; false for anyone who has none, so read it together with role. Carried here because the gedu picker filters and disables on it server-side and the users list marks it per row — the two reasons the whole-table certification read existed.';


--
-- Name: COLUMN user_list_entries.criminal_record_check_passed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_list_entries.criminal_record_check_passed IS 'Whether an admin has recorded seeing an acceptable criminal record extract, from the same 1:1 row as certified and on the same terms. The flag only — never the _at or _by stamps, which name the admin who saw the document and belong to the detail page''s own narrower read, not to a list.';


--
-- Name: COLUMN user_list_entries.linked_gamers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_list_entries.linked_gamers IS 'This family''s children, oldest first, as a JSON array of objects carrying id, first_name, last_name, email, email_verified_at, role, created_at and sign_in — everything the two list surfaces render or gate on per child, including the sign-in mode whose per-gamer lookup used to be thirty sequential keyed batches on the end of the list read. Empty array, never NULL. A child the caller''s RLS cannot see is simply absent, so an array is never a claim about somebody the caller could not have read directly.';


--
-- Name: COLUMN user_list_entries.family_search_blob; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_list_entries.family_search_blob IS 'Every string this family can be found by — name, email, phone and each game handle, for this person AND for every linked child — space-joined. Derived, never written, and never selected: the search filters on it and reads the other columns beside it, so it does not cross the wire. Family-wide rather than per-person because the list shows families: a hit on a child''s name or handle has to return the row the child is inside, and matching per person returned a row the page then collapsed away. The utm_* columns and email_verified_at are deliberately absent: those label where a family came from and when they verified, and neither is a name anyone should be findable by. The phone is the stored digits (E.164 without the +), which is why a needle reduced to its trailing digits matches a number typed either nationally or internationally without the search knowing any dialling rules.';


--
-- Name: TABLE user_list_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_list_entries TO authenticated;
GRANT SELECT ON TABLE public.user_list_entries TO service_role;


