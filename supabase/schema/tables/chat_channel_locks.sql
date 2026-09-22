--
-- Name: chat_channel_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_channel_locks (
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE chat_channel_locks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_channel_locks IS 'Who a moderator has silenced in a channel, and by whom. A lock takes away everything that writes — sending, editing, replying and reacting — and leaves exactly one thing: deleting your own message, because taking back something you regret is what a locked member most plausibly still wants and refusing it would make the lock a punishment rather than a control. A locked member keeps READING. Unlock sets locked_at back to NULL and never deletes the row, so the switch replicates in both directions. Read policy is the one exception on these four tables: own row plus moderators, because a channel-wide read would broadcast live to every child that a gedu had silenced a particular child.';


--
-- Name: COLUMN chat_channel_locks.locked_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_channel_locks.locked_by IS 'The moderator who last set this row''s state, lock or unlock alike. Audit only — nothing renders it. ON DELETE SET NULL, so a departed gedu leaves the act recorded without the name.';


--
-- Name: chat_channel_locks chat_channel_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channel_locks
    ADD CONSTRAINT chat_channel_locks_pkey PRIMARY KEY (channel_id, user_id);


--
-- Name: chat_channel_locks chat_channel_locks_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channel_locks
    ADD CONSTRAINT chat_channel_locks_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_channel_locks chat_channel_locks_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channel_locks
    ADD CONSTRAINT chat_channel_locks_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_channel_locks chat_channel_locks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_channel_locks
    ADD CONSTRAINT chat_channel_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_channel_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_channel_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channel_locks chat_channel_locks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_channel_locks_select ON public.chat_channel_locks FOR SELECT TO authenticated USING ((( SELECT public.is_chat_channel_member(chat_channel_locks.channel_id) AS is_chat_channel_member) AND ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_chat_channel_moderator(chat_channel_locks.channel_id) AS is_chat_channel_moderator))));


--
-- Name: TABLE chat_channel_locks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.chat_channel_locks TO authenticated;
GRANT ALL ON TABLE public.chat_channel_locks TO service_role;


