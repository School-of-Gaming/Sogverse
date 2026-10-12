--
-- Name: substitution_notification_dms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substitution_notification_dms (
    request_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    discord_user_id text,
    channel_id text,
    message_id text,
    rendered_hash text,
    delivery_error text,
    accepted_dm_claimed_at timestamp with time zone,
    accepted_dm_message_id text,
    accepted_dm_sent_at timestamp with time zone
);


--
-- Name: TABLE substitution_notification_dms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.substitution_notification_dms IS 'The Discord DM a gedu was sent about a substitution request, one row per (request, gedu), and the "you are the substitute" DM sent to whoever was seated. A row is never deleted while the request stands: a sent DM follows the request''s state from then on, even after its gedu stops being eligible. Written by the sync as the service role. Service role only; RLS on with no policy.';


--
-- Name: COLUMN substitution_notification_dms.discord_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.discord_user_id IS 'The Discord user the DM went to — the account that acted as this gedu when it was sent.';


--
-- Name: COLUMN substitution_notification_dms.channel_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.channel_id IS 'The DM channel the message is in.';


--
-- Name: COLUMN substitution_notification_dms.message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.message_id IS 'The DM''s message id, which later syncs edit.';


--
-- Name: COLUMN substitution_notification_dms.rendered_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.rendered_hash IS 'A hash of the DM as last sent, so a sync whose rendering has not changed skips the edit.';


--
-- Name: COLUMN substitution_notification_dms.delivery_error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.delivery_error IS 'Why Discord refused the DM for good (the user takes no DMs, or is unknown). A row carrying one is never retried.';


--
-- Name: COLUMN substitution_notification_dms.accepted_dm_claimed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.accepted_dm_claimed_at IS 'Claimed before the "you are the substitute" DM is sent, so it goes at most once per (request, gedu); nulled again when a send fails in a way worth retrying.';


--
-- Name: COLUMN substitution_notification_dms.accepted_dm_message_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.accepted_dm_message_id IS 'The "you are the substitute" DM''s message id.';


--
-- Name: COLUMN substitution_notification_dms.accepted_dm_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notification_dms.accepted_dm_sent_at IS 'When the "you are the substitute" DM was sent.';


--
-- Name: substitution_notification_dms substitution_notification_dms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notification_dms
    ADD CONSTRAINT substitution_notification_dms_pkey PRIMARY KEY (request_id, gedu_id);


--
-- Name: substitution_notification_dms_gedu_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX substitution_notification_dms_gedu_id_idx ON public.substitution_notification_dms USING btree (gedu_id);


--
-- Name: substitution_notification_dms substitution_notification_dms_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notification_dms
    ADD CONSTRAINT substitution_notification_dms_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: substitution_notification_dms substitution_notification_dms_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notification_dms
    ADD CONSTRAINT substitution_notification_dms_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE;


--
-- Name: substitution_notification_dms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.substitution_notification_dms ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE substitution_notification_dms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.substitution_notification_dms TO service_role;


