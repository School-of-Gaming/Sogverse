--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.location_type NOT NULL,
    parent_id uuid,
    country_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name_i18n jsonb,
    external_code text,
    search_blob text GENERATED ALWAYS AS (public.location_search_blob(name, name_i18n, external_code)) STORED,
    geonames_id bigint,
    retired_at timestamp with time zone,
    depth smallint DEFAULT 0 NOT NULL,
    CONSTRAINT locations_no_self_parent CHECK ((parent_id IS DISTINCT FROM id))
);


--
-- Name: COLUMN locations.name_i18n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.name_i18n IS 'Locale -> display-name overrides (e.g. {"sv":"Helsingfors"}). Resolve as name_i18n[locale] ?? name. `name` holds the canonical native-language name and is never duplicated here.';


--
-- Name: COLUMN locations.external_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.external_code IS 'Official statistical code for this location in its national classification: INSEE Code officiel géographique code for FR rows (région / département / commune), Statistics Finland region (maakunta) or municipality (kunta) code for FI rows. NULL on admin-created sites, which exist in no national classification. Unique per (country_code, type) — France reuses the same code across levels.';


--
-- Name: COLUMN locations.search_blob; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.search_blob IS 'Derived, never written: the row''s folded searchable terms, separator-delimited. Read only by public.search_locations; it is present in select(*) responses and carries no information the other columns do not.';


--
-- Name: COLUMN locations.geonames_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.geonames_id IS 'GeoNames geonameid for a row sourced from the GeoNames dumps: the dedupe key for ingestion and sync, unique where present. NULL on admin-created sites and on config-declared synthetic rows GeoNames models no administrative record for. Never holds an official statistical code — that is external_code, and the two are separate columns on purpose.';


--
-- Name: COLUMN locations.retired_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.retired_at IS 'When a refresh found this place gone upstream. Retired rows are hidden from browse reads, the search function and the municipality directory, but keyed reads still return them and the ancestor walk still climbs through them: every existing FK, coverage claim and rendered chain has to keep working. Refresh never DELETEs a location row — gedu_locations cascades — so this is the only way a place leaves the pickers.';


--
-- Name: COLUMN locations.depth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.depth IS 'Distance from the root: 0 for a country row, parent.depth + 1 below. Maintained by trg_set_location_depth and never written by hand; the DEFAULT exists so the column stays optional in the generated Insert type. Search ranks broadest-first on this rather than on the location_type enum, whose declared order is wrong for any country that nests district below municipality.';


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: idx_locations_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_country ON public.locations USING btree (country_code) WHERE (country_code IS NOT NULL);


--
-- Name: idx_locations_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_parent ON public.locations USING btree (parent_id);


--
-- Name: idx_locations_search_blob; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_search_blob ON public.locations USING gin (search_blob extensions.gin_trgm_ops);


--
-- Name: idx_locations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_type ON public.locations USING btree (type);


--
-- Name: uq_locations_external_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_locations_external_code ON public.locations USING btree (country_code, type, external_code) WHERE (external_code IS NOT NULL);


--
-- Name: uq_locations_geonames_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_locations_geonames_id ON public.locations USING btree (geonames_id) WHERE (geonames_id IS NOT NULL);


--
-- Name: locations locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: locations trg_set_location_depth; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_location_depth BEFORE INSERT OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_location_depth();


--
-- Name: TRIGGER trg_set_location_depth ON locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_set_location_depth ON public.locations IS 'Keeps locations.depth equal to the ancestor-chain length: 0 when parent_id is NULL, parent.depth + 1 otherwise. Fires on every INSERT and UPDATE so the column cannot be forged from outside. LIMIT, stated so nobody assumes otherwise: a FOR EACH ROW trigger corrects the row it is handed and cannot re-depth that row''s descendants, so re-parenting a node that HAS descendants would leave their depth stale. Nothing does that — nothing above `site` is ever created or moved by the application, sync never reparents without a human widening the migration by hand, and the FI/FR cutover re-parents only sites, which are leaves. A future migration that reparents a non-leaf must re-run the recursive backfill in this file.';


--
-- Name: locations locations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: locations admin_manage_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_locations ON public.locations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: locations anon_read_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_locations ON public.locations FOR SELECT TO anon USING (true);


--
-- Name: locations authenticated_read_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_locations ON public.locations FOR SELECT TO authenticated USING (true);


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.locations TO authenticated;


