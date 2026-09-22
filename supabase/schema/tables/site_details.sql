--
-- Name: site_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_details (
    location_id uuid NOT NULL,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_details site_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_details
    ADD CONSTRAINT site_details_pkey PRIMARY KEY (location_id);


--
-- Name: site_details site_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER site_details_updated_at BEFORE UPDATE ON public.site_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: site_details trg_validate_site_details_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_site_details_location BEFORE INSERT OR UPDATE OF location_id ON public.site_details FOR EACH ROW EXECUTE FUNCTION public.validate_site_details_location();


--
-- Name: site_details site_details_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_details
    ADD CONSTRAINT site_details_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: site_details admin_full_access_site_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_site_details ON public.site_details TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: site_details gedu_read_site_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_read_site_details ON public.site_details FOR SELECT TO authenticated USING ((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role));


--
-- Name: site_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_details ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE site_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_details TO authenticated;


