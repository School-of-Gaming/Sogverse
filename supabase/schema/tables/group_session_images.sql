--
-- Name: group_session_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_session_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT chk_group_session_images_height CHECK (((height > 0) AND (height <= 4096))),
    CONSTRAINT chk_group_session_images_width CHECK (((width > 0) AND (width <= 4096)))
);


--
-- Name: TABLE group_session_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_session_images IS 'The photos attached to one session''s report — mostly in-game screenshots. One row per upload, and the row''s id is also the object''s name in the public `session-images` bucket (`<id>.jpg`), which is why there is no path column: it would restate the primary key. The name is a random UUID rather than a content hash on purpose — the unguessable name IS the access control (see the migration header''s unlisted-not-private model), and per-upload identity means deleting one report''s photo can never collide with another report that attached identical bytes. Dedup is a non-goal. RLS on with ZERO policies and no grant to `authenticated`: the same posture group_sessions itself carries, so the two RPCs below are the only way in and a grant added by accident still fails closed. A photo lives exactly as long as its report — removed by a gedu or an admin, or CASCADEd away when the session row goes — and there is no timer, no reaper and no scheduled job.';


--
-- Name: COLUMN group_session_images.width; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.width IS 'The stored image''s pixel width, MEASURED SERVER-SIDE by the upload route''s re-encode. All gallery and email geometry is arithmetic from this and `height` — never measured at render — which is what lets server HTML and first client paint agree and keeps a mail laying out correctly with every image blocked. The form still carries a claimed pair, but only as an early plausibility refusal that gives the gedu dimension copy rather than a generic failure; it never reaches this column. The CHECK''s 4096 is a SANITY ceiling, deliberately looser than the client''s ~2048 px edge cap and not derived from it — the route refuses a decode past it before the insert, and this is what stands behind that.';


--
-- Name: COLUMN group_session_images.height; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.height IS 'The stored image''s pixel height. See `width` — the same server-side measurement, the same sanity ceiling, and both are written by the route from what its re-encode saw rather than from anything a client sent.';


--
-- Name: COLUMN group_session_images.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.created_by IS 'Who uploaded this photo. AUDIT ONLY, and specifically for safeguarding: these are pictures concerning children and "who put this here" must be answerable. It gates nothing — removal is role-based, matching how the report itself is edited — and it appears on no feed. The exact mirror of group_sessions.report_emailed_by, ON DELETE SET NULL included, so a departed gedu leaves the upload recorded without the name.';


--
-- Name: COLUMN group_session_images.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.group_session_images.created_at IS 'When the photo was attached, and the DISPLAY ORDER key: every renderer orders by (created_at, id). Stamped with clock_timestamp() rather than now() because the insert runs under the session row''s lock, where a transaction-start stamp can tie or invert against lock-acquisition order; the id is the sub-tick tiebreaker.';


--
-- Name: group_session_images group_session_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_images
    ADD CONSTRAINT group_session_images_pkey PRIMARY KEY (id);


--
-- Name: group_session_images_session_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_session_images_session_order_idx ON public.group_session_images USING btree (session_id, created_at, id);


--
-- Name: group_session_images group_session_images_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_images
    ADD CONSTRAINT group_session_images_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_session_images group_session_images_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_session_images
    ADD CONSTRAINT group_session_images_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.group_sessions(id) ON DELETE CASCADE;


--
-- Name: group_session_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_session_images ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE group_session_images; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_session_images TO service_role;


