--
-- Name: gamer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_profiles (
    user_id uuid NOT NULL,
    date_of_birth date NOT NULL,
    gender public.gender_type,
    sign_in public.gamer_sign_in DEFAULT 'parent'::public.gamer_sign_in NOT NULL,
    CONSTRAINT gamer_profiles_date_of_birth_check CHECK ((date_of_birth <= CURRENT_DATE))
);


--
-- Name: COLUMN gamer_profiles.sign_in; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_profiles.sign_in IS 'How this child reaches their own account, chosen by their PARENT and written only by the API routes on the service-role client — never by the account holder, and not by the parent''s own session either: `authenticated` holds column-scoped UPDATE on this table (date_of_birth, gender) and this column is deliberately not among them. Three modes. `parent` is the default and the behaviour every gamer had before the modes existed: the auth email is a random synthetic `<token>@gamer.sogverse.internal` handle, there is no password, and the only way in is an account switch from the parent. `username` means the parent picked a lowercase [a-z0-9]{3,20} handle and a password; the auth email becomes `<username>@gamer.sogverse.internal`, so GoTrue''s uniqueness constraint on that address is what makes the username unique, and the child signs in with an ordinary email and password. `email` means the address on the account is the child''s REAL mailbox: they verify it and set a password through the same reset flow an adult uses. The value is a PRIVILEGE marker as much as a preference — it decides whether a child can sign in without their parent at all, and whether the address stored for them is something we may mail or a handle nobody reads.';


--
-- Name: gamer_profiles gamer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_profiles
    ADD CONSTRAINT gamer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: gamer_profiles gamer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_profiles
    ADD CONSTRAINT gamer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gamer_profiles admin_full_access_gamer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gamer_profiles ON public.gamer_profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gamer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: gamer_profiles gamers_read_own_gamer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_read_own_gamer_profile ON public.gamer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: gamer_profiles gamers_update_own_gamer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_update_own_gamer_profile ON public.gamer_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: gamer_profiles parents_read_linked_gamer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_linked_gamer_profiles ON public.gamer_profiles FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: TABLE gamer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gamer_profiles TO anon;
GRANT ALL ON TABLE public.gamer_profiles TO service_role;
GRANT SELECT ON TABLE public.gamer_profiles TO authenticated;


--
-- Name: COLUMN gamer_profiles.date_of_birth; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(date_of_birth) ON TABLE public.gamer_profiles TO authenticated;


--
-- Name: COLUMN gamer_profiles.gender; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(gender) ON TABLE public.gamer_profiles TO authenticated;


