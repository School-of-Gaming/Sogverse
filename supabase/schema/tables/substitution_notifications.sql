--
-- Name: substitution_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substitution_notifications (
    request_id uuid NOT NULL,
    announced_at timestamp with time zone NOT NULL,
    slack_channel_id text,
    slack_message_ts text,
    slack_rendered_hash text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE substitution_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.substitution_notifications IS 'A substitution request that has been ANNOUNCED — the row''s existence is the fact — and the Slack message that announces it. Written by the sync, as the service role, the first time it finds the request open; a request filed already substituted and never open is never announced and gets no row. Once a row exists every later change to the request updates the messages, whatever state the request is in. Service role only; RLS on with no policy.';


--
-- Name: COLUMN substitution_notifications.announced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notifications.announced_at IS 'When the sync first found the request open and announced it.';


--
-- Name: COLUMN substitution_notifications.slack_channel_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notifications.slack_channel_id IS 'The Slack channel the message was posted to; null until it is posted, or when Slack is not configured.';


--
-- Name: COLUMN substitution_notifications.slack_message_ts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notifications.slack_message_ts IS 'The Slack message''s ts, its id within the channel, stored straight after posting so later syncs edit the message rather than post another.';


--
-- Name: COLUMN substitution_notifications.slack_rendered_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.substitution_notifications.slack_rendered_hash IS 'A hash of the message as last sent, so a sync whose rendering has not changed skips the edit.';


--
-- Name: substitution_notifications substitution_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notifications
    ADD CONSTRAINT substitution_notifications_pkey PRIMARY KEY (request_id);


--
-- Name: substitution_notifications substitution_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER substitution_notifications_updated_at BEFORE UPDATE ON public.substitution_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: substitution_notifications substitution_notifications_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitution_notifications
    ADD CONSTRAINT substitution_notifications_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE;


--
-- Name: substitution_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.substitution_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE substitution_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.substitution_notifications TO service_role;


