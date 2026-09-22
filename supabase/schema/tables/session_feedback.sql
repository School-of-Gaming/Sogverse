--
-- Name: session_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_feedback (
    group_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    session_opens_at timestamp with time zone NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_session_feedback_answers_shape CHECK (((jsonb_typeof(answers) = 'object'::text) AND (jsonb_array_length(jsonb_path_query_array(answers, '$.keyvalue()'::jsonpath)) <= 32) AND (NOT (answers @? 'strict $.*?(((@.type() != "number" || @ < 1) || @ > 5) || @.floor() != @)'::jsonpath)))),
    CONSTRAINT chk_session_feedback_note_length CHECK ((char_length(note) <= 2000))
);


--
-- Name: TABLE session_feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_feedback IS 'What ONE CHILD answered on the way out of ONE online session — the five-ish statements of the leave/ended feedback screen plus an optional note. NOT `feedback_submissions`, which is the help card''s free-text box anybody may send from anywhere about anything; the two names sit side by side forever, and this is the one keyed to a session. One row per (group, participant, session window), written and read by the child themselves through RLS — no function, no route. THE LAST DONE WINS: a child who drops out, rejoins and leaves again updates the row they already have, including emptying it, which is an update with an empty object and an empty note and never a delete. A first-time Done with nothing on screen writes no row at all, because the response rate''s denominator is the sessions themselves. Both foreign keys CASCADE, so a family closing its account takes its child''s feedback with it, which is what the privacy page promises about retention.';


--
-- Name: COLUMN session_feedback.session_opens_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_feedback.session_opens_at IS 'The instant the session window opened, CLIENT-ASSERTED: it arrives from the voice token response the room already holds and nothing here validates it. That is safe because this column BOUNDS NOTHING — it is a join key, and a forged value can only mis-key the forger''s own row, which the policies have already confined to them. Contrast chat_channels.session_opens_at, which carries the same name and the opposite trust: it is server-derived because it bounds what a FAMILY may read. Two columns with one name and opposite provenance have to be told apart at the column, not from memory.';


--
-- Name: COLUMN session_feedback.answers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_feedback.answers IS 'Item key -> level, for the answered items only; `{}` is a legal stored value and is what an emptied form writes. Keys are the catalogue''s stable text identifiers and are deliberately unconstrained, so adding or removing a statement is a code edit with no migration; a reader ignores keys the catalogue no longer holds. Only the shape is checked.';


--
-- Name: CONSTRAINT chk_session_feedback_answers_shape ON session_feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_session_feedback_answers_shape ON public.session_feedback IS 'The shape of `answers`, and only the shape: a JSON object, at most 32 entries, every value an integer from 1 to 5. The value clause is jsonpath in STRICT mode on purpose — lax mode auto-unwraps arrays, so `{"k": [3]}` and `{"k": []}` both slipped past it as levels. Keys are deliberately unconstrained: a statement is added or retired in the code catalogue with no migration, and this constraint is the bound on that freedom.';


--
-- Name: session_feedback session_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_pkey PRIMARY KEY (group_id, participant_id, session_opens_at);


--
-- Name: session_feedback session_feedback_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER session_feedback_updated_at BEFORE UPDATE ON public.session_feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: session_feedback session_feedback_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: session_feedback session_feedback_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: session_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: session_feedback session_feedback_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_feedback_insert ON public.session_feedback FOR INSERT TO authenticated WITH CHECK (((participant_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.has_active_participation_in_group(session_feedback.group_id) AS has_active_participation_in_group)));


--
-- Name: session_feedback session_feedback_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_feedback_select ON public.session_feedback FOR SELECT TO authenticated USING (((participant_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.has_active_participation_in_group(session_feedback.group_id) AS has_active_participation_in_group)));


--
-- Name: session_feedback session_feedback_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_feedback_update ON public.session_feedback FOR UPDATE TO authenticated USING (((participant_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.has_active_participation_in_group(session_feedback.group_id) AS has_active_participation_in_group))) WITH CHECK (((participant_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.has_active_participation_in_group(session_feedback.group_id) AS has_active_participation_in_group)));


--
-- Name: TABLE session_feedback; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.session_feedback TO authenticated;
GRANT ALL ON TABLE public.session_feedback TO service_role;


