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

COMMENT ON TABLE public.session_cancellations IS 'One row per cancelled session, keyed exactly as group_sessions is: (group, product-local date). Written and removed only by cancel_session and restore_session (admin-only); no client role holds a grant, and RLS is on with no policy. A cancellation may share its key with a group_sessions row, and then it wins: the row is kept but frozen (every write on a cancelled date is refused with P0026, under the advisory lock cancel_session also takes), the family feed stops carrying it, and every reader that treats a stored row as "the session ran" excludes it until the session is restored — whatever the schedule does afterwards. Whether a row is in effect is group_session_is_cancelled''s answer and no reader''s own: a cancellation on a date with neither a schedule projection nor a stored row is INERT, never surfaced, and kept so that moving the schedule back re-applies it.';


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
-- Name: session_cancellations session_cancellations_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER session_cancellations_notify AFTER INSERT OR DELETE ON public.session_cancellations FOR EACH ROW EXECUTE FUNCTION public.notify_session_cancellation_changed();


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


