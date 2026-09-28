--
-- Name: session_cancellations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_cancellations (
    group_id uuid NOT NULL,
    session_date date NOT NULL,
    reason text,
    cancelled_by uuid NOT NULL,
    cancelled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_session_cancellations_reason CHECK (((reason IS NULL) OR (((char_length(reason) >= 1) AND (char_length(reason) <= 500)) AND (reason = btrim(reason)))))
);


--
-- Name: TABLE session_cancellations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_cancellations IS 'One row per cancelled session, keyed exactly as group_sessions is: (group, product-local date). Written and removed only by cancel_session and restore_session (admin-only); no client role holds a grant, and RLS is on with no policy. A cancellation and a group_sessions row for the same key never coexist: cancelling refuses a date that has a stored record, and ensure_group_session refuses to materialize one on a cancelled date, both under the same advisory lock. A cancellation on a date the schedule no longer projects is INERT — it subtracts only from projected dates and is never surfaced by itself — and is kept so that moving the schedule back re-applies it.';


--
-- Name: COLUMN session_cancellations.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_cancellations.reason IS 'Why the session was cancelled, admin-only on every read, exactly as a substitution reason is. Trimmed and nulled when blank by cancel_session; the CHECK caps it at 500 characters.';


--
-- Name: COLUMN session_cancellations.cancelled_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_cancellations.cancelled_by IS 'The admin who cancelled (or last re-worded) the cancellation. RESTRICT rather than SET NULL because the column is NOT NULL: who called a session off is part of the record.';


--
-- Name: session_cancellations session_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_cancellations
    ADD CONSTRAINT session_cancellations_pkey PRIMARY KEY (group_id, session_date);


--
-- Name: session_cancellations session_cancellations_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_cancellations
    ADD CONSTRAINT session_cancellations_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: session_cancellations session_cancellations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_cancellations
    ADD CONSTRAINT session_cancellations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: session_cancellations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_cancellations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE session_cancellations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_cancellations TO service_role;


