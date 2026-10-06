--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    profile_id uuid NOT NULL,
    kind public.notification_kind NOT NULL,
    channel public.notification_channel NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'Which notifications each person receives, per kind and channel. A row is a person''s explicit answer for one kind on one channel; NO ROW MEANS OFF, so every kind is off on every channel until they turn it on. A sender reads the rows with enabled = true for its kind and channel. Written only by set_notification_preference, which today only an admin may call; authenticated holds SELECT alone, and a person reads only their own rows.';


--
-- Name: COLUMN notification_preferences.channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preferences.channel IS 'How this kind reaches the person. The same kind may be answered differently on each channel.';


--
-- Name: COLUMN notification_preferences.enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preferences.enabled IS 'True: the person receives this kind on this channel. False: they turned it off. NOT NULL with no third state, because "never answered" is the absence of the row, and it means off.';


--
-- Name: COLUMN notification_preferences.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_preferences.updated_at IS 'When the answer last changed, stamped server-side. Setting the answer already on file leaves it alone.';


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (profile_id, kind, channel);


--
-- Name: notification_preferences notification_preferences_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_preferences_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_owner_read ON public.notification_preferences FOR SELECT TO authenticated USING ((profile_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


