--
-- Name: team_profile_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_profile_translations (
    user_id uuid NOT NULL,
    locale text NOT NULL,
    short_description text DEFAULT ''::text NOT NULL,
    long_description text DEFAULT ''::text NOT NULL,
    fun_fact text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_profile_translations_fun_fact_check CHECK (((fun_fact IS NULL) OR ((fun_fact = btrim(fun_fact)) AND ((char_length(fun_fact) >= 1) AND (char_length(fun_fact) <= 200))))),
    CONSTRAINT team_profile_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}$'::text)),
    CONSTRAINT team_profile_translations_long_description_check CHECK (((long_description = btrim(long_description)) AND (char_length(long_description) <= 5000))),
    CONSTRAINT team_profile_translations_not_empty CHECK (((short_description <> ''::text) OR (long_description <> ''::text) OR (fun_fact IS NOT NULL))),
    CONSTRAINT team_profile_translations_short_description_check CHECK (((short_description = btrim(short_description)) AND (char_length(short_description) <= 140) AND (short_description !~ '[\r\n]'::text)))
);


--
-- Name: TABLE team_profile_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.team_profile_translations IS 'What a person wrote on their team profile in one site locale. Any set of locales; a row may be half-written while the profile is not on, but a profile that is on has at least one row and every row carries both descriptions (save_team_profile enforces it). Written only by save_team_profile; authenticated holds SELECT alone.';


--
-- Name: COLUMN team_profile_translations.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profile_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN team_profile_translations.short_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profile_translations.short_description IS 'One line of plain text: the person''s opening line under their name. Empty only while unwritten.';


--
-- Name: COLUMN team_profile_translations.long_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profile_translations.long_description IS '"About me", markdown rendered in the profile variant. Empty only while unwritten.';


--
-- Name: COLUMN team_profile_translations.fun_fact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profile_translations.fun_fact IS 'Optional; NULL leaves the aside off the page. Never counts towards completeness.';


--
-- Name: team_profile_translations team_profile_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profile_translations
    ADD CONSTRAINT team_profile_translations_pkey PRIMARY KEY (user_id, locale);


--
-- Name: team_profile_translations team_profile_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER team_profile_translations_updated_at BEFORE UPDATE ON public.team_profile_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_profile_translations team_profile_translations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profile_translations
    ADD CONSTRAINT team_profile_translations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.team_profiles(user_id) ON DELETE CASCADE;


--
-- Name: team_profile_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_profile_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: team_profile_translations team_profile_translations_owner_or_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_profile_translations_owner_or_admin_read ON public.team_profile_translations FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: TABLE team_profile_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.team_profile_translations TO authenticated;
GRANT ALL ON TABLE public.team_profile_translations TO service_role;


