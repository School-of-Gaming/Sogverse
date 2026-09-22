--
-- Name: session_substitution_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_substitution_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    session_date date NOT NULL,
    requested_by uuid NOT NULL,
    role public.gedu_assignment_role NOT NULL,
    reason public.substitution_reason,
    reason_note text,
    status public.substitution_request_status DEFAULT 'open'::public.substitution_request_status NOT NULL,
    substitute_id uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_substitution_not_self CHECK ((substitute_id IS DISTINCT FROM requested_by)),
    CONSTRAINT chk_substitution_reason_note_length CHECK ((char_length(reason_note) <= 500)),
    CONSTRAINT chk_substitution_state CHECK (((status = 'substituted'::public.substitution_request_status) = ((substitute_id IS NOT NULL) AND (approved_by IS NOT NULL) AND (approved_at IS NOT NULL))))
);


--
-- Name: TABLE session_substitution_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_substitution_requests IS 'One row per (group, session date, ABSENT GEDU): "I cannot make this session", and — once an admin has answered it — who is standing in. The seat is the PERSON rather than the role, because two primaries of one group may both be out the same day and "who did which job" has to stay answerable. There is no separate substitutions table: every substitution exists because somebody was absent, so the request IS the row, and an admin setting a sub with no request files one on the absent gedu''s behalf, created already `substituted`. WITHDRAWN ROWS ARE HISTORY and do not block a new request for the same seat — the live-seat unique index is partial on exactly that. A request nobody substitutes on becomes UNFILLED once its date is past, which is a DERIVED state of an open request and not a stored one: the date already says it, and a stored status would need a clock. The SUB-OF-SUB CHAIN needs no column either — a gedu appearing as one row''s substitute_id and another row''s requested_by on the same (group, date) IS the link. Nothing here materializes a group_sessions row, deliberately: a substitution set on a PAST date would write a past-dated row, and municipality invoicing reads a past-dated row as "the session ran". Neither `authenticated` nor `anon` holds any grant — every read and write goes through the SECURITY DEFINER RPCs below, the same posture as group_sessions.';


--
-- Name: COLUMN session_substitution_requests.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_substitution_requests.role IS 'The role being substituted, snapshotted at filing time from the requester''s assignment role — or, when the requester is themselves a sub, from the role on the substituted request they hold. Snapshotted rather than joined because invoicing asks what job was done on the day, and an admin editing the permanent assignment months later must not rewrite that answer.';


--
-- Name: COLUMN session_substitution_requests.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_substitution_requests.reason IS 'Why the gedu is away — `sick` or `other` — and ADMIN-VISIBLE ONLY: it reaches the admin Substitutions page and the admin session document, and every gedu-facing document emits it as null. A `sick` category is health-related data about a contractor; the Discord tickets it replaces carry the same, so nothing new is disclosed, but no retention rule exists for either yet. Nullable because the gedu path requires it (RPC-enforced) and the admin''s off-platform-substitution path cannot.';


--
-- Name: COLUMN session_substitution_requests.substitute_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_substitution_requests.substitute_id IS 'The sub, once an admin has approved one — and null in every other state, by the chk_substitution_state CHECK. Clearing a substitution or withdrawing a substituted request blanks it, so this column answers "who is substituting" and never "who once was"; the latter is not a question the platform promises to answer, because an admin correcting a mistake should leave no phantom substitution behind for invoicing to bill.';


--
-- Name: session_substitution_requests session_substitution_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_requests
    ADD CONSTRAINT session_substitution_requests_pkey PRIMARY KEY (id);


--
-- Name: idx_session_substitution_requests_group_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_substitution_requests_group_date ON public.session_substitution_requests USING btree (group_id, session_date);


--
-- Name: idx_session_substitution_requests_substitute_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_substitution_requests_substitute_id ON public.session_substitution_requests USING btree (substitute_id) WHERE (status = 'substituted'::public.substitution_request_status);


--
-- Name: session_substitution_requests_live_seat; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_substitution_requests_live_seat ON public.session_substitution_requests USING btree (group_id, session_date, requested_by) WHERE (status <> 'withdrawn'::public.substitution_request_status);


--
-- Name: session_substitution_requests session_substitution_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER session_substitution_requests_updated_at BEFORE UPDATE ON public.session_substitution_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: session_substitution_requests session_substitution_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_requests
    ADD CONSTRAINT session_substitution_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: session_substitution_requests session_substitution_requests_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_requests
    ADD CONSTRAINT session_substitution_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: session_substitution_requests session_substitution_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_requests
    ADD CONSTRAINT session_substitution_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: session_substitution_requests session_substitution_requests_substitute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_requests
    ADD CONSTRAINT session_substitution_requests_substitute_id_fkey FOREIGN KEY (substitute_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: session_substitution_requests admin_full_access_session_substitution_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_session_substitution_requests ON public.session_substitution_requests TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: session_substitution_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_substitution_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE session_substitution_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_substitution_requests TO service_role;


