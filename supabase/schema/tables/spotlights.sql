--
-- Name: spotlights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spotlights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_id uuid,
    image_path text,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_spotlights_enabled_has_image CHECK (((NOT enabled) OR (image_id IS NOT NULL)))
);


--
-- Name: TABLE spotlights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.spotlights IS 'Admin-written notes appended to every parent''s session report email, newest first: the picture and whether the spotlight is enabled here, the title and body per language in spotlight_translations. A single copy — enabled is what makes one live, with no publishing step, no dates and no position. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_spotlight, save_spotlight and delete_spotlight, and the catalogue''s repoint_spotlight_images and removal trigger. The session report email reads the enabled ones with the service role.';


--
-- Name: COLUMN spotlights.image_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlights.image_id IS 'The picture: a spotlight_image entry in the shared image catalogue, or NULL for none. Moved to the new entry by the catalogue''s replace (repoint_spotlight_images). The catalogue''s removal nulls it and switches the spotlight off in one statement (unlink_removed_spotlight_image), before the entry goes — which is why the foreign key takes no action of its own.';


--
-- Name: COLUMN spotlights.image_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlights.image_path IS 'The picture''s object name in the spotlight-images bucket, derived from image_id by apply_spotlight_image_path and never written by anything else. NULL exactly when image_id is.';


--
-- Name: COLUMN spotlights.enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlights.enabled IS 'Whether the spotlight is appended to session report emails. Set by create_spotlight and save_spotlight together with the picture. Never true without a picture (chk_spotlights_enabled_has_image).';


--
-- Name: COLUMN spotlights.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlights.created_at IS 'When the spotlight was created. The one ordering key: readers take the enabled spotlights newest first, id breaking a tie.';


--
-- Name: CONSTRAINT chk_spotlights_enabled_has_image ON spotlights; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_spotlights_enabled_has_image ON public.spotlights IS 'A spotlight may be saved without a picture but never enabled without one. The admin editor turns the switch off without a picture; this refuses the state it cannot produce.';


--
-- Name: spotlights spotlights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlights
    ADD CONSTRAINT spotlights_pkey PRIMARY KEY (id);


--
-- Name: idx_spotlights_enabled_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spotlights_enabled_created_at ON public.spotlights USING btree (created_at DESC, id DESC) WHERE enabled;


--
-- Name: idx_spotlights_image_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spotlights_image_id ON public.spotlights USING btree (image_id);


--
-- Name: spotlights trg_spotlights_apply_image_path; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_spotlights_apply_image_path BEFORE INSERT OR UPDATE ON public.spotlights FOR EACH ROW EXECUTE FUNCTION public.apply_spotlight_image_path();


--
-- Name: spotlights spotlights_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlights
    ADD CONSTRAINT spotlights_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.catalogue_images(id);


--
-- Name: spotlights admins_read_spotlights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_spotlights ON public.spotlights FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: spotlights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spotlights ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE spotlights; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.spotlights TO authenticated;
GRANT ALL ON TABLE public.spotlights TO service_role;


