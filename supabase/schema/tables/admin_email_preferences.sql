--
-- Name: admin_email_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_email_preferences (
    admin_id uuid NOT NULL,
    kind public.admin_email_kind NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE admin_email_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_email_preferences IS 'Which kinds of staff email each admin receives. A row is an admin''s explicit answer for one kind; NO ROW MEANS OFF, so every kind is off for every admin until they turn it on. A sender reads the rows with enabled = true for its kind. Only an admin can hold a row, because the setter is admin-only. Written only by set_admin_email_preference; authenticated holds SELECT alone, and an admin reads only their own rows.';


--
-- Name: COLUMN admin_email_preferences.enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_email_preferences.enabled IS 'True: the admin receives this kind. False: they turned it off. NOT NULL with no third state, because "never answered" is the absence of the row, and it means off.';


--
-- Name: COLUMN admin_email_preferences.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_email_preferences.updated_at IS 'When the answer last changed, stamped server-side. Setting the answer already on file leaves it alone.';


--
-- Name: admin_email_preferences admin_email_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_email_preferences
    ADD CONSTRAINT admin_email_preferences_pkey PRIMARY KEY (admin_id, kind);


--
-- Name: admin_email_preferences admin_email_preferences_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_email_preferences
    ADD CONSTRAINT admin_email_preferences_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: admin_email_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_email_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_email_preferences admin_email_preferences_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_email_preferences_owner_read ON public.admin_email_preferences FOR SELECT TO authenticated USING ((admin_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE admin_email_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_email_preferences TO authenticated;
GRANT ALL ON TABLE public.admin_email_preferences TO service_role;


