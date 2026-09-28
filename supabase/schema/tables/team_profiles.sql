--
-- Name: team_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_profiles (
    user_id uuid NOT NULL,
    nickname text,
    title text,
    pick smallint,
    photo_path text,
    opted_in boolean DEFAULT false NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    approval_decided_by uuid,
    approval_decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_profiles_approval_stamped CHECK (((NOT approved) OR (approval_decided_at IS NOT NULL))),
    CONSTRAINT team_profiles_nickname_check CHECK (((nickname IS NULL) OR ((nickname = btrim(nickname)) AND ((char_length(nickname) >= 1) AND (char_length(nickname) <= 32))))),
    CONSTRAINT team_profiles_photo_path_in_own_folder CHECK (((photo_path IS NULL) OR (photo_path ~ (('^'::text || (user_id)::text) || '/[^/]+$'::text)))),
    CONSTRAINT team_profiles_pick_check CHECK (((pick IS NULL) OR ((pick >= 1) AND (pick <= 16)))),
    CONSTRAINT team_profiles_public_only_when_ready CHECK (((NOT approved) OR opted_in)),
    CONSTRAINT team_profiles_title_check CHECK (((title IS NULL) OR ((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 60)))))
);


--
-- Name: TABLE team_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.team_profiles IS 'One member of staff''s team profile: an admin''s or a Gedu''s, keyed by their profile id. Name and spoken languages are not stored here; they are read from profiles. Written only by save_team_profile (content and the checkbox) and set_team_profile_approval (an admin making a profile public or hiding it); authenticated holds SELECT alone. A profile is public when an admin has made it public (approved), which a CHECK allows only while it is marked ready (opted_in).';


--
-- Name: COLUMN team_profiles.nickname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.nickname IS 'What gamers know the person as. A name they chose, never translated. NULL for none.';


--
-- Name: COLUMN team_profiles.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.title IS 'An admin''s office title, e.g. "Chief Engineer". Always NULL for a Gedu, whose title is the role itself; save_team_profile refuses one.';


--
-- Name: COLUMN team_profiles.pick; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.pick IS 'The accent colour the person picked, a SOG-UI pick id from 1 to 16, or NULL for none: the page then carries the brand''s colours alone.';


--
-- Name: COLUMN team_profiles.photo_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.photo_path IS 'The photo''s object name in the team-photos bucket, always inside the person''s own folder: <user_id>/<name>. The client crops every upload to an 800 × 1000 portrait before it is stored. NULL for none, which keeps the profile incomplete.';


--
-- Name: COLUMN team_profiles.opted_in; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.opted_in IS 'The profile''s "ready" mark. Not consent: the person or any admin may save it, only while the profile is complete; while it is on, every save has to leave the profile complete. A save that passes NULL keeps it as stored. Saving the profile not ready also hides it (approved becomes false).';


--
-- Name: COLUMN team_profiles.approved; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.approved IS 'Whether an admin has made the profile public. Set true only by set_team_profile_approval and only while the checkbox is on; set false by that function (an admin hiding it) or by save_team_profile whenever a save leaves the checkbox off, so re-ticking ready waits for an admin again. Never true while opted_in is false (CHECK team_profiles_public_only_when_ready). While it is true, later edits go live with no second look.';


--
-- Name: COLUMN team_profiles.approval_decided_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.approval_decided_by IS 'The admin who last made the profile public or hid it, or NULL before any admin has, or once that admin''s account is gone (ON DELETE SET NULL: losing the admin must never take a profile down). Unticking ready hides the profile without being an admin''s decision, and leaves this as it was.';


--
-- Name: COLUMN team_profiles.approval_decided_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_profiles.approval_decided_at IS 'When an admin last made the profile public or hid it, or NULL before any admin has. Never NULL while approved. Left as it was when unticking ready hides the profile.';


--
-- Name: team_profiles team_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profiles
    ADD CONSTRAINT team_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: team_profiles team_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER team_profiles_updated_at BEFORE UPDATE ON public.team_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_profiles team_profiles_approval_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profiles
    ADD CONSTRAINT team_profiles_approval_decided_by_fkey FOREIGN KEY (approval_decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: team_profiles team_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_profiles
    ADD CONSTRAINT team_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: team_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: team_profiles team_profiles_owner_or_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_profiles_owner_or_admin_read ON public.team_profiles FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: TABLE team_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.team_profiles TO authenticated;
GRANT ALL ON TABLE public.team_profiles TO service_role;


