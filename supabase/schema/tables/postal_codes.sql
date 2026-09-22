--
-- Name: postal_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postal_codes (
    country_code text NOT NULL,
    postal_code text NOT NULL,
    location_id uuid NOT NULL
);


--
-- Name: TABLE postal_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.postal_codes IS 'Postal code -> municipality, one row per (country, code, place) fact. An alternative key onto a locations row, never a level of the hierarchy. Nothing references this table, which is what makes a refresh a plain delete-and-reinsert rather than the retire-never-delete discipline locations lives under. Public reference data: anon, authenticated and service_role may SELECT, nobody may write from a client, and rows land through generated data migrations. service_role holds SELECT because search_locations is SECURITY INVOKER, reads this table for its postal match arm, and is executable by that role.';


--
-- Name: COLUMN postal_codes.country_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postal_codes.country_code IS 'ISO 3166-1 alpha-2, matching the locations row this points at. Part of the key rather than derivable from it because the lookup starts here: a caller has a country and a code and no id yet, and codes are not unique across countries.';


--
-- Name: COLUMN postal_codes.postal_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postal_codes.postal_code IS 'The code exactly as the upstream source spells it — no normalization, no padding, no case folding. Every seeded country''s codes are fixed-width digits (Finland and France alike), so there is nothing to normalize yet; a country whose codes carry spaces or letters will need that decision made deliberately rather than inherited.';


--
-- Name: COLUMN postal_codes.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postal_codes.location_id IS 'The municipality the code reaches. ON DELETE CASCADE, and safe here precisely because nothing references postal rows: losing them costs a lookup, never a coverage claim or a stored pick. Seeds resolve it by joining (country_code, type = ''municipality'', external_code), so a country whose level maps no official code cannot be seeded this way.';


--
-- Name: postal_codes postal_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postal_codes
    ADD CONSTRAINT postal_codes_pkey PRIMARY KEY (country_code, postal_code, location_id);


--
-- Name: idx_postal_codes_code_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postal_codes_code_trgm ON public.postal_codes USING gin (postal_code extensions.gin_trgm_ops);


--
-- Name: INDEX idx_postal_codes_code_trgm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_postal_codes_code_trgm IS 'Serves the postal match arm of search_locations, which asks for codes starting with a folded needle across every country at once. Trigram rather than btree because the needle arrives as an InitPlan over the search function''s probe CTE, and PostgreSQL''s LIKE-prefix-to-range rewrite needs a plan-time Const; GIN extracts its query keys at execution time instead, exactly as the locations search blob index does.';


--
-- Name: idx_postal_codes_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postal_codes_location_id ON public.postal_codes USING btree (location_id);


--
-- Name: postal_codes postal_codes_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postal_codes
    ADD CONSTRAINT postal_codes_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: postal_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.postal_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: postal_codes postal_codes_are_public_reference_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY postal_codes_are_public_reference_data ON public.postal_codes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: TABLE postal_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.postal_codes TO anon;
GRANT SELECT ON TABLE public.postal_codes TO authenticated;
GRANT SELECT ON TABLE public.postal_codes TO service_role;


