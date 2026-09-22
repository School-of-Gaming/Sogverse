--
-- Name: chat_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.chat_channel_type NOT NULL,
    group_id uuid NOT NULL,
    session_opens_at timestamp with time zone NOT NULL,
    session_ends_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_chat_channels_window_order CHECK ((session_ends_at > session_opens_at))
);


--
-- Name: TABLE chat_channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_channels IS 'One chat log''s identity. For a `group_session` channel that is one product group''s one session window, keyed by (group_id, session_opens_at) — the same key voice_private_zone_occupants carries, and the same instant the voice token route hands a joiner as `sessionOpensAt`, so a room and its chat agree on which window they are. Materialized idempotently by ensure_chat_channel and by nothing else. Deliberately NOT related to group_sessions by a foreign key: that table''s ensure function is unguarded behind staff-only callers, and a participant-callable RPC reaching it would manufacture phantom session rows in staff feeds.';


--
-- Name: COLUMN chat_channels.session_opens_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_channels.session_opens_at IS 'When the room opens — the session start MINUS the voice join margin, i.e. exactly the voice token route''s `windowOpensAt`. SERVER-DERIVED, never accepted from a caller, and snapshotted rather than re-derived: a schedule edit moves future windows and leaves this log where it happened. Half of the row''s natural key.';


--
-- Name: COLUMN chat_channels.session_ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_channels.session_ends_at IS 'When the room closes — session end PLUS the voice leave margin, i.e. the token route''s `windowClosesAt`. Server-derived and snapshotted like its partner. This is the instant the FAMILY read bound is measured from (see is_chat_channel_member); staff have no time bound, because after-the-fact review is the point of keeping the rows.';


--
-- Name: chat_channels chat_channels_group_window_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_group_window_key UNIQUE (group_id, session_opens_at);


--
-- Name: chat_channels chat_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_pkey PRIMARY KEY (id);


--
-- Name: chat_channels_group_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_channels_group_window_idx ON public.chat_channels USING btree (group_id, session_opens_at DESC);


--
-- Name: chat_channels chat_channels_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: chat_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channels chat_channels_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_channels_select ON public.chat_channels FOR SELECT TO authenticated USING (( SELECT public.is_chat_channel_member(chat_channels.id) AS is_chat_channel_member));


--
-- Name: TABLE chat_channels; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.chat_channels TO authenticated;
GRANT ALL ON TABLE public.chat_channels TO service_role;


