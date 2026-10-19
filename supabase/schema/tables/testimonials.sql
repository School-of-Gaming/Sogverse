--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_via uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_saved_by uuid,
    last_saved_via uuid
);


--
-- Name: TABLE testimonials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testimonials IS 'Marketing''s store of testimonials — real words from real parents, gamers and gedus: the record of who created each and who last saved it here, the words per language in testimonial_translations. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_testimonial, save_testimonial, save_testimonial_version and remove_testimonial_version, and nothing deletes a testimonial: once created it stays. The public reads only the testimonials a live landing page places, through list_landing_page_testimonials.';


--
-- Name: COLUMN testimonials.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonials.created_at IS 'When the testimonial was created, stamped by stamp_testimonial_saver and never moved.';


--
-- Name: COLUMN testimonials.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonials.created_by IS 'The admin who created the testimonial, stamped from auth.uid() by stamp_testimonial_saver and never changed by a save. NULL when the create had no signed-in caller (a migration, the service role, psql) or the account has since gone (SET NULL).';


--
-- Name: COLUMN testimonials.created_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonials.created_via IS 'The OAuth client — an AI app connected through the MCP endpoint — the create came through, read from the token''s client_id claim by stamp_testimonial_saver. NULL for a create made in Sogverse itself, and whenever created_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record outlives it.';


--
-- Name: COLUMN testimonials.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonials.updated_at IS 'When the testimonial was last saved, its versions included, stamped by stamp_testimonial_saver: every writer names this column, which is what fires the trigger.';


--
-- Name: COLUMN testimonials.last_saved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonials.last_saved_by IS 'The admin whose write last saved the testimonial, stamped from auth.uid() by stamp_testimonial_saver and never supplied by a statement. NULL when that write had no signed-in caller, or the account has since gone (SET NULL).';


--
-- Name: COLUMN testimonials.last_saved_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonials.last_saved_via IS 'The OAuth client the last save came through, read from the token''s client_id claim by stamp_testimonial_saver. NULL for a save made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key, as created_via.';


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: testimonials trg_testimonials_stamp_saver; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_testimonials_stamp_saver BEFORE INSERT OR UPDATE OF updated_at ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.stamp_testimonial_saver();


--
-- Name: testimonials testimonials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: testimonials testimonials_last_saved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_last_saved_by_fkey FOREIGN KEY (last_saved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: testimonials admins_read_testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_testimonials ON public.testimonials FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE testimonials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testimonials TO authenticated;
GRANT ALL ON TABLE public.testimonials TO service_role;


