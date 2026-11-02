--
-- Name: klaviyo_profile_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.klaviyo_profile_outbox (
    customer_id uuid NOT NULL,
    seq bigint DEFAULT 1 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    leased_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    CONSTRAINT klaviyo_profile_outbox_attempts_nonnegative CHECK ((attempts >= 0)),
    CONSTRAINT klaviyo_profile_outbox_seq_positive CHECK ((seq >= 1))
);


--
-- Name: TABLE klaviyo_profile_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.klaviyo_profile_outbox IS 'Parents whose Klaviyo profile has something not yet told: one row per parent, filed by enqueue_klaviyo_profiles from triggers on every table the Klaviyo snapshot reads, and deleted by finish_klaviyo_profile_job once a sync has told everything up to the row''s seq. NO foreign key to profiles, on purpose: a deleted parent stays filed, the snapshot then returns nothing for them, and the sync deletes their Klaviyo profile (found by its external id, the profile id). The sync route works it through claim_klaviyo_profile_jobs, which leases rows, because no lock can be held across the HTTP calls a sync makes. A row whose sync has failed 12 times in a row stays, with next_attempt_at at infinity, until the parent changes again. Service role only; RLS on with no policy.';


--
-- Name: COLUMN klaviyo_profile_outbox.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_profile_outbox.customer_id IS 'The parent''s profile id, which is also their Klaviyo external id. Not a foreign key: the row must outlive the profile it names.';


--
-- Name: COLUMN klaviyo_profile_outbox.seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_profile_outbox.seq IS 'Bumped on every enqueue. A sync claims a seq and finishes against it: a finish that finds a different seq knows the parent changed while it ran, and runs again.';


--
-- Name: COLUMN klaviyo_profile_outbox.next_attempt_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_profile_outbox.next_attempt_at IS 'When the row is next due: now on every enqueue, pushed out by the backoff on a failed sync, and infinity once 12 syncs in a row have failed.';


--
-- Name: COLUMN klaviyo_profile_outbox.leased_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_profile_outbox.leased_until IS 'Set when a sync claims the row and cleared when it finishes. While it is in the future no other sync claims the row; one in the past is a sync that died, and the row is claimable again.';


--
-- Name: COLUMN klaviyo_profile_outbox.attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_profile_outbox.attempts IS 'Claims since the last enqueue; reset to 0 by every enqueue. Drives the backoff and the 12-attempt stop.';


--
-- Name: COLUMN klaviyo_profile_outbox.last_error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_profile_outbox.last_error IS 'What the last failed sync reported, kept for whoever investigates a stuck row.';


--
-- Name: klaviyo_profile_outbox klaviyo_profile_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.klaviyo_profile_outbox
    ADD CONSTRAINT klaviyo_profile_outbox_pkey PRIMARY KEY (customer_id);


--
-- Name: klaviyo_profile_outbox_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX klaviyo_profile_outbox_next_attempt_at_idx ON public.klaviyo_profile_outbox USING btree (next_attempt_at);


--
-- Name: klaviyo_profile_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.klaviyo_profile_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE klaviyo_profile_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.klaviyo_profile_outbox TO service_role;


