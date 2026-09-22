--
-- Name: session_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    status text NOT NULL,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_session_attendance_status CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text])))
);


--
-- Name: TABLE session_attendance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_attendance IS 'One row per explicit attendance mark. A roster member with NO row here is unanswered, never absent — the three-state distinction a boolean cannot express. Marks are written one at a time and reverting to unmarked deletes the row, so two gedus marking different children in one session never clobber each other.';


--
-- Name: COLUMN session_attendance.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_attendance.participant_id IS 'The profile the mark is about — whoever holds the seat, matching participations.participant_id.';


--
-- Name: session_attendance session_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_pkey PRIMARY KEY (id);


--
-- Name: session_attendance session_attendance_session_participant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_participant_key UNIQUE (session_id, participant_id);


--
-- Name: session_attendance_participant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_attendance_participant_idx ON public.session_attendance USING btree (participant_id);


--
-- Name: session_attendance_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_attendance_session_idx ON public.session_attendance USING btree (session_id);


--
-- Name: session_attendance session_attendance_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: session_attendance session_attendance_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: session_attendance session_attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.group_sessions(id) ON DELETE CASCADE;


--
-- Name: session_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE session_attendance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_attendance TO service_role;


