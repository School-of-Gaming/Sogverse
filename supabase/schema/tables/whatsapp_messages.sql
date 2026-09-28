--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id text NOT NULL,
    phone text NOT NULL,
    direction text NOT NULL,
    body text,
    message_type text DEFAULT 'text'::text NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    status_error text,
    CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'received'::text])))
);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: idx_whatsapp_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages USING btree (phone, created_at DESC);


--
-- Name: whatsapp_messages whatsapp_messages_phone_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_phone_fkey FOREIGN KEY (phone) REFERENCES public.whatsapp_contacts(phone);


--
-- Name: whatsapp_messages Admins can insert whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert whatsapp_messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK ((( SELECT public.is_admin() AS is_admin) AND (direction = 'outbound'::text)));


--
-- Name: whatsapp_messages Admins can read whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read whatsapp_messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE whatsapp_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_messages TO anon;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.whatsapp_messages TO authenticated;


