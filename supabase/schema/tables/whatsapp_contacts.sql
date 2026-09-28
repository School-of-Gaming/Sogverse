--
-- Name: whatsapp_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_contacts (
    phone text NOT NULL,
    wa_name text,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_contacts whatsapp_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_contacts
    ADD CONSTRAINT whatsapp_contacts_pkey PRIMARY KEY (phone);


--
-- Name: idx_whatsapp_contacts_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_contacts_last_message ON public.whatsapp_contacts USING btree (last_message_at DESC);


--
-- Name: whatsapp_contacts Admins can insert whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert whatsapp_contacts" ON public.whatsapp_contacts FOR INSERT TO authenticated WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_contacts Admins can read whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read whatsapp_contacts" ON public.whatsapp_contacts FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_contacts Admins can update whatsapp_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update whatsapp_contacts" ON public.whatsapp_contacts FOR UPDATE TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE whatsapp_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_contacts TO anon;
GRANT ALL ON TABLE public.whatsapp_contacts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_contacts TO authenticated;


