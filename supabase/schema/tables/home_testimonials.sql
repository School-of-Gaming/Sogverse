--
-- Name: home_testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_testimonials (
    spot public.home_testimonial_spot NOT NULL,
    "position" smallint NOT NULL,
    testimonial_id uuid NOT NULL,
    CONSTRAINT chk_home_testimonials_spot_size CHECK ((("position" >= 1) AND ("position" <=
CASE spot
    WHEN 'feature'::public.home_testimonial_spot THEN 1
    WHEN 'safety'::public.home_testimonial_spot THEN 2
    WHEN 'row'::public.home_testimonial_spot THEN 3
    ELSE NULL::integer
END)))
);


--
-- Name: TABLE home_testimonials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.home_testimonials IS 'Which testimonial fills which position of which home spot; About shows the same testimonials in the same groups. Written only by migrations: which testimonial sits where on the site''s front door is a developer''s decision, while its words are an admin''s, so no Data API role holds a write grant and no function writes it. A spot may be partly filled or empty. SELECT for authenticated behind an admin policy; the public reads it through list_home_testimonials.';


--
-- Name: COLUMN home_testimonials."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.home_testimonials."position" IS 'The testimonial''s place within its spot, from 1, in reading order. At most the spot''s size (chk_home_testimonials_spot_size).';


--
-- Name: COLUMN home_testimonials.testimonial_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.home_testimonials.testimonial_id IS 'The testimonial shown there. A testimonial is in at most one home position (uq_home_testimonials_testimonial), so About never shows it twice. RESTRICT: the app never deletes a testimonial, and this keeps a hand delete from taking a quote off the home page.';


--
-- Name: CONSTRAINT chk_home_testimonials_spot_size ON home_testimonials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_home_testimonials_spot_size ON public.home_testimonials IS 'A spot holds at most its size: feature 1, safety 2, row 3.';


--
-- Name: home_testimonials home_testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_testimonials
    ADD CONSTRAINT home_testimonials_pkey PRIMARY KEY (spot, "position");


--
-- Name: home_testimonials uq_home_testimonials_testimonial; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_testimonials
    ADD CONSTRAINT uq_home_testimonials_testimonial UNIQUE (testimonial_id);


--
-- Name: home_testimonials home_testimonials_testimonial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_testimonials
    ADD CONSTRAINT home_testimonials_testimonial_id_fkey FOREIGN KEY (testimonial_id) REFERENCES public.testimonials(id) ON DELETE RESTRICT;


--
-- Name: home_testimonials admins_read_home_testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_home_testimonials ON public.home_testimonials FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: home_testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.home_testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE home_testimonials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.home_testimonials TO authenticated;
GRANT ALL ON TABLE public.home_testimonials TO service_role;


