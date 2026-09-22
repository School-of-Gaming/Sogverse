--
-- Name: gedu_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_profiles (
    user_id uuid NOT NULL,
    certified boolean DEFAULT false NOT NULL,
    certified_at timestamp with time zone,
    certified_by uuid,
    criminal_record_check_passed boolean DEFAULT false NOT NULL,
    criminal_record_check_at timestamp with time zone,
    criminal_record_check_by uuid,
    CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag CHECK (((criminal_record_check_at IS NOT NULL) = criminal_record_check_passed))
);


--
-- Name: COLUMN gedu_profiles.certified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.certified IS 'Whether an admin has vouched for this educator. Gates three things and nothing else: group assignment (UI-only, because assignment is admin-driven), instant-voice-room moderation (server-side, because it is gedu-initiated), and OFFERING AND HOLDING A SESSION SUBSTITUTION (server-side, twice over: gedu_may_substitute_session refuses an uncertified offerer or sub, and gedu_substitutes_session re-checks this column on every access test, so de-certifying an educator ends a live substitution''s reach into the group mid-window rather than only barring the next one). It is the ONLY eligibility test the substitution pool applies — coverage area, language and schedule clash are deliberately follow-ups — which is why an uncertified gedu sees an empty "Sessions needing a substitute" list rather than a refusal. An uncertified gedu still has broad platform access by design. Distinct from profiles.email_verified_at, which is about an address rather than a person.';


--
-- Name: COLUMN gedu_profiles.certified_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.certified_by IS 'The admin whose call this was, or NULL — either because the gedu is not certified, or because they predate the feature and were backfilled as trusted. ON DELETE SET NULL: losing the certifying admin''s account must never silently de-certify a working educator.';


--
-- Name: COLUMN gedu_profiles.criminal_record_check_passed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_passed IS 'Whether an admin has seen an acceptable criminal record extract (rikostaustaote) for this educator. The DOCUMENT IS NEVER STORED: Finnish law 504/2002 has the person obtain the extract themselves and permits the employer to record only that it was presented and when, so this flag plus criminal_record_check_at is the whole of what the platform may hold. Gates NOTHING — exactly like contract acceptance, it informs the certification decision and does not pre-empt it; admin certification remains the only blocking lever over an educator. false covers both "not recorded yet" and "recorded as not passing", which are the same operational state.';


--
-- Name: COLUMN gedu_profiles.criminal_record_check_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_at IS 'When the extract was presented, stamped server-side by set_gedu_criminal_record_check and NULL whenever the flag is false. It is the second half of what the law allows us to record, and a client never supplies it — a moment the subject could choose would prove nothing about when anybody saw anything.';


--
-- Name: COLUMN gedu_profiles.criminal_record_check_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_by IS 'The admin whose statement this was, stamped alongside criminal_record_check_at by set_gedu_criminal_record_check and NULL whenever the flag is false. Rendered on the admin user-detail card — the recording admin''s name beside the date, exactly like certified_by — and nowhere else; the gedu-facing surfaces read only the flag and the moment from their own row, so an educator is never shown who looked at their document. Unforgeable regardless of who reads it: the table carries no write grant for any Data API role and the RPC derives this from the calling session. ON DELETE SET NULL, so a departed admin leaves the check recorded without the name; losing an account must never silently unrecord a check that was made.';


--
-- Name: CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag ON gedu_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag ON public.gedu_profiles IS 'The criminal record check''s moment is non-NULL exactly when its flag is true. Relied on by two admin surfaces that read different halves of it — the dashboard''s certification queue ships only criminal_record_check_at and reads NULL as "no check", while the users list reads only criminal_record_check_passed — so a disagreeing row would have the two describing the same educator differently. Nothing reachable can write one without the other (no write grant on the table; one RPC sets both in a single statement), which is why this fires only against a migration, a backfill or a hand-run UPDATE, and why failing loudly there is the whole of its job. criminal_record_check_by is deliberately outside it: ON DELETE SET NULL means a departed admin leaves a recorded check without a name, and that is correct.';


--
-- Name: gedu_profiles gedu_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: gedu_profiles gedu_profiles_certified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_certified_by_fkey FOREIGN KEY (certified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gedu_profiles gedu_profiles_criminal_record_check_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_criminal_record_check_by_fkey FOREIGN KEY (criminal_record_check_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gedu_profiles gedu_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_profiles
    ADD CONSTRAINT gedu_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gedu_profiles admin_full_access_gedu_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gedu_profiles ON public.gedu_profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_profiles gedus_read_own_gedu_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_gedu_profile ON public.gedu_profiles FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE gedu_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_profiles TO anon;
GRANT SELECT ON TABLE public.gedu_profiles TO authenticated;
GRANT ALL ON TABLE public.gedu_profiles TO service_role;


