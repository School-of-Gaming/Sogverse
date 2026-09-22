--
-- Name: chat_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_reactions (
    message_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    code text NOT NULL,
    channel_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_chat_reactions_code CHECK ((code = ANY (ARRAY['thumbs_up'::text, 'heart'::text, 'laugh'::text, 'surprised'::text, 'celebrate'::text, 'thinking'::text])))
);

ALTER TABLE ONLY public.chat_reactions REPLICA IDENTITY FULL;


--
-- Name: TABLE chat_reactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_reactions IS 'One person''s one reaction to one message, unique on (message, sender, code) and toggled by toggle_chat_reaction. Carries REPLICA IDENTITY FULL because un-reacting is a DELETE and a channel_id-filtered postgres_changes subscription can only receive a DELETE whose OLD row carries the filter column — the messages and locks tables are never deleted (soft delete and unlock are UPDATEs) and keep the default identity.';


--
-- Name: COLUMN chat_reactions.channel_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_reactions.channel_id IS 'The channel of this reaction''s message. Denormalized so a realtime subscription can filter on one column and so the RLS policy is a direct membership question rather than a join. Stamped from the message row inside toggle_chat_reaction and never taken from the caller, which is what stops a reaction being filed under a channel its message is not in.';


--
-- Name: chat_reactions chat_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_pkey PRIMARY KEY (message_id, sender_id, code);


--
-- Name: chat_reactions_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_reactions_channel_idx ON public.chat_reactions USING btree (channel_id);


--
-- Name: chat_reactions chat_reactions_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_reactions chat_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_reactions chat_reactions_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_reactions chat_reactions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_reactions_select ON public.chat_reactions FOR SELECT TO authenticated USING (( SELECT public.is_chat_channel_member(chat_reactions.channel_id) AS is_chat_channel_member));


--
-- Name: TABLE chat_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.chat_reactions TO authenticated;
GRANT ALL ON TABLE public.chat_reactions TO service_role;


