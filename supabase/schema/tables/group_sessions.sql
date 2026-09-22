--
-- Name: group_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    session_date date NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    report text,
    gedu_note text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    report_emailed_at timestamp with time zone,
    report_emailed_by uuid,
    CONSTRAINT chk_group_sessions_ends_after_starts CHECK ((ends_at > starts_at))
);


--
-- Name: TABLE group_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_sessions IS 'Lazily materialized session records: one row per (group, product-local date), written only when a report, a note or an attendance mark needs somewhere to live. starts_at/ends_at are a snapshot of the schedule at materialization and are never re-derived.';


--
-- Name: COLUMN group_sessions.report_emailed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_sessions.report_emailed_at IS 'When this session''s report was emailed to the group''s families, and NULL until it has been — the AT-MOST-ONCE MARKER for that mail. Set by claim_group_session_report_email before any mail is composed, which is what makes two concurrent sends impossible; cleared again only by the route, and only when EVERY send failed and therefore no family received anything. A partial failure keeps it set on purpose. Never cleared by an edit to the report: there is no resend, and a gedu fixing a typo afterwards does not get to mail the families a second version.';


--
-- Name: COLUMN group_sessions.report_emailed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_sessions.report_emailed_by IS 'The gedu whose click sent the report, stamped alongside report_emailed_at. Audit only — it is on neither feed and nothing renders it; the card''s author chip reads updated_by. ON DELETE SET NULL, so a departed gedu leaves the send recorded without the name.';


--
-- Name: group_sessions group_sessions_group_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_group_date_key UNIQUE (group_id, session_date);


--
-- Name: CONSTRAINT group_sessions_group_date_key ON group_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT group_sessions_group_date_key ON public.group_sessions IS 'One session per group per local calendar day — a deliberate architectural bet. It blocks multi-slot days (morning + afternoon camps), which we do not run; in exchange the key survives every schedule edit but a weekday move, and entry ids can be (group_id, session_date). Revisiting multi-slot days means revisiting this constraint.';


--
-- Name: group_sessions group_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_pkey PRIMARY KEY (id);


--
-- Name: group_sessions_group_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_sessions_group_date_idx ON public.group_sessions USING btree (group_id, session_date DESC);


--
-- Name: group_sessions group_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER group_sessions_updated_at BEFORE UPDATE ON public.group_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: group_sessions group_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_sessions group_sessions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: group_sessions group_sessions_report_emailed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_report_emailed_by_fkey FOREIGN KEY (report_emailed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_sessions group_sessions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_sessions
    ADD CONSTRAINT group_sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE group_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_sessions TO service_role;


