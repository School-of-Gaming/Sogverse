--
-- Name: substitution_notification_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substitution_notification_outbox (
    request_id uuid NOT NULL,
    seq bigint DEFAULT 1 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    leased_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    CONSTRAINT substitution_notification_outbox_attempts_nonnegative CHECK ((attempts >= 0)),
    CONSTRAINT substitution_notification_outbox_seq_positive CHECK ((seq >= 1))
);


--
-- Name: TABLE substitution_notification_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.substitution_notification_outbox IS 'Substitution requests whose notifications have something not yet told: one row per request, filed by enqueue_substitution_notification from triggers on the request, its offers and its session''s cancellation, and deleted by finish_substitution_notification_job once a sync has told everything up to the row''s seq. The sync route works it through claim_substitution_notification_jobs, which leases rows, because no lock can be held across the HTTP calls a sync makes. A row whose sync has failed 12 times in a row stays, with next_attempt_at at infinity, until the request changes again. Service role only; RLS on with no policy.';


--
-- Name: COLUMN substitution_notification_outbox.seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_outbox.seq IS 'Bumped on every enqueue. A sync claims a seq and finishes against it: a finish that finds a different seq knows the request changed while it ran, and runs again.';


--
-- Name: COLUMN substitution_notification_outbox.next_attempt_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_outbox.next_attempt_at IS 'When the row is next due: now on every enqueue, pushed out by the backoff on a failed sync, and infinity once 12 syncs in a row have failed.';


--
-- Name: COLUMN substitution_notification_outbox.leased_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_outbox.leased_until IS 'Set when a sync claims the row and cleared when it finishes. While it is in the future no other sync claims the row; one in the past is a sync that died, and the row is claimable again.';


--
-- Name: COLUMN substitution_notification_outbox.attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_outbox.attempts IS 'Claims since the last enqueue; reset to 0 by every enqueue. Drives the backoff and the 12-attempt stop.';


--
-- Name: COLUMN substitution_notification_outbox.last_error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_outbox.last_error IS 'What the last failed sync reported, kept for whoever investigates a stuck row.';


--
-- Name: substitution_notification_outbox substitution_notification_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notification_outbox
    ADD CONSTRAINT substitution_notification_outbox_pkey PRIMARY KEY (request_id);


--
-- Name: substitution_notification_outbox_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX substitution_notification_outbox_next_attempt_at_idx ON public.substitution_notification_outbox USING btree (next_attempt_at);


--
-- Name: substitution_notification_outbox substitution_notification_outbox_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notification_outbox
    ADD CONSTRAINT substitution_notification_outbox_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE;


--
-- Name: substitution_notification_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.substitution_notification_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE substitution_notification_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.substitution_notification_outbox TO service_role;


