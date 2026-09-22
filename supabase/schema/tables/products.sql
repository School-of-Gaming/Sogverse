--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_type public.product_type NOT NULL,
    billing_mode public.billing_mode NOT NULL,
    min_age integer,
    max_age integer,
    spoken_language_code public.spoken_language NOT NULL,
    image_path text,
    location_id uuid,
    is_remote boolean NOT NULL,
    start_date date NOT NULL,
    end_date date,
    timezone text NOT NULL,
    seat_count integer,
    waitlist_enabled boolean DEFAULT true NOT NULL,
    registration_opens_at timestamp with time zone NOT NULL,
    is_visible boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    topic public.product_topic NOT NULL,
    primary_gedu_fee_cents integer,
    assistant_gedu_fee_cents integer,
    municipality_fee_cents integer,
    for_gamers boolean DEFAULT true NOT NULL,
    for_parents boolean DEFAULT false NOT NULL,
    tag public.product_tag,
    region_lock_country text,
    image_id uuid,
    requires_gamer_creations boolean DEFAULT false NOT NULL,
    invoice_customer_id uuid,
    CONSTRAINT chk_products_age_range CHECK (((min_age IS NULL) OR (max_age IS NULL) OR (max_age >= min_age))),
    CONSTRAINT chk_products_ages_iff_for_gamers CHECK (
CASE
    WHEN for_gamers THEN ((min_age IS NOT NULL) AND (max_age IS NOT NULL))
    ELSE ((min_age IS NULL) AND (max_age IS NULL))
END),
    CONSTRAINT chk_products_date_range CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT chk_products_event_single_date CHECK (((product_type <> 'event'::public.product_type) OR (NOT (end_date IS DISTINCT FROM start_date)))),
    CONSTRAINT chk_products_external_contract_muni CHECK (((billing_mode <> 'external_contract'::public.billing_mode) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_has_an_audience CHECK ((for_gamers OR for_parents)),
    CONSTRAINT chk_products_in_person_has_location CHECK (((is_remote = true) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_invoice_customer_only_for_muni CHECK (((invoice_customer_id IS NULL) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_municipality_fee_only_for_muni CHECK (((municipality_fee_cents IS NULL) OR (product_type = 'municipality_club'::public.product_type))),
    CONSTRAINT chk_products_non_consumer_has_end_date CHECK (((product_type = 'consumer_club'::public.product_type) OR (end_date IS NOT NULL))),
    CONSTRAINT chk_products_online_muni_has_location CHECK (((NOT ((is_remote = true) AND (product_type = 'municipality_club'::public.product_type))) OR (location_id IS NOT NULL))),
    CONSTRAINT chk_products_online_non_muni_no_location CHECK (((NOT ((is_remote = true) AND (product_type <> 'municipality_club'::public.product_type))) OR (location_id IS NULL))),
    CONSTRAINT chk_products_region_lock_country_shape CHECK (((region_lock_country IS NULL) OR (region_lock_country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT products_assistant_gedu_fee_cents_check CHECK (((assistant_gedu_fee_cents IS NULL) OR (assistant_gedu_fee_cents >= 0))),
    CONSTRAINT products_max_age_check CHECK (((max_age IS NULL) OR (max_age >= 0))),
    CONSTRAINT products_min_age_check CHECK (((min_age IS NULL) OR (min_age >= 0))),
    CONSTRAINT products_municipality_fee_cents_check CHECK (((municipality_fee_cents IS NULL) OR (municipality_fee_cents > 0))),
    CONSTRAINT products_primary_gedu_fee_cents_check CHECK (((primary_gedu_fee_cents IS NULL) OR (primary_gedu_fee_cents >= 0))),
    CONSTRAINT products_seat_count_check CHECK (((seat_count IS NULL) OR (seat_count >= 1)))
);


--
-- Name: COLUMN products.image_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.image_path IS 'The object key every reader paints. DERIVED, with no exceptions: trg_products_apply_image_path writes the linked entry''s path on every products write and NULLs the column whenever image_id is NULL, so an app-supplied value is always inert and this column has exactly one writer. It deliberately carries NO foreign key into product_images(path): a second relationship between these two tables makes every PostgREST embed of product_images ambiguous (PGRST201) unless every caller hints it, and the trigger already guarantees what such a key would check. See 00198''s header before adding one.';


--
-- Name: COLUMN products.for_gamers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.for_gamers IS 'Children may occupy a seat on this product. Default true: every product that existed before 00173 is gamers-only, and stays so.';


--
-- Name: COLUMN products.for_parents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.for_parents IS 'Adults may occupy a seat on this product themselves — a parents'' evening, a family outing, a club a parent attends alongside their child. Independent of for_gamers: a product may be for either, or both.';


--
-- Name: COLUMN products.tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.tag IS 'Optional design tag, NULL meaning untagged. Untagged is the ordinary state and renders nothing anywhere — no chip on the card, no chip on the detail hero, no explanation block — exactly as a gamers-only audience renders no badge. There is no default and no backfill: every product authored before 00178 is untagged because nobody has said otherwise.';


--
-- Name: COLUMN products.region_lock_country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.region_lock_country IS 'Optional ISO 3166-1 alpha-2 country code this product is locked to; NULL (the state of every row before 00193) means not locked, and is the ordinary case. ENFORCEMENT IS UI-ONLY BY DESIGN: nothing in this database refuses a participation on a locked product. A family''s location is self-attested and editable by them at any time, so a server-side block would check a value the blocked party can rewrite — an obstacle, never a guarantee. The shop''s signup panel reads this column and tells a parent outside the country that the product is not for them; that is the whole mechanism. Two accepted consequences: a determined parent can restate their location and enrol, and a parent who moves after enroling keeps their seat, because the lock gates the enrolment decision and is never re-run against an existing one. The CHECK constrains the shape only (two uppercase letters). WHICH countries may be chosen is the seeded half of SUPPORTED_COUNTRIES in the application config, enforced by the write contract and the admin picker, because that list changes as location rows are seeded and an enum here would both need a migration per country and turn an already-stored lock into a violation the day one is un-seeded. Unrelated to the municipality-club country binding, which constrains a muni club''s location pickers and says nothing about who may enrol.';


--
-- Name: COLUMN products.image_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.image_id IS 'The catalogue entry this product shows, or NULL for no picture. Anon-readable like the rest of products (it is a UUID and reveals nothing), but only admins can resolve it against product_images. Writing it is what changes a product''s picture — image_path is derived and must not be written directly.';


--
-- Name: COLUMN products.requires_gamer_creations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.requires_gamer_creations IS 'Does this product contractually require a creation from every member? An ADMIN decision, deliberately not derived from `topic`: not every roblox_studio product is Roblox-sponsored, so a contract obligation is stated rather than inferred. STAFF-FACING ONLY — a family sees nothing different on a flagged product, and no family document carries this column. What it changes is SIGNALS, never the authoring surface: adding a creation is the same gesture on every product, and the flag only makes the final session''s completeness gain a fourth condition (every current roster member has at least one creation) beside attendance, the report and the report mail. Defaults false, so flagging a product IS the opt-in and no epoch gating is needed. An open-ended product (end_date NULL) may be flagged and never owes, because it has no final session.';


--
-- Name: COLUMN products.invoice_customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.invoice_customer_id IS 'The Fennoa customer this municipality club is invoiced to, or NULL where nobody has said yet. Per CLUB rather than per municipality on purpose: one city can be two customers (library clubs and school clubs under two agreements) and an association can be the customer for clubs running in a municipality it is not, so this may NEVER be derived from location_id. Nullable and refused later, exactly like municipality_fee_cents: a club is created before anybody has agreed who pays for it, so the invoicing page is what flags a club with no customer and blocks its file. Restricted to municipality clubs by chk_products_invoice_customer_only_for_muni, the same shape the fee column carries. ON DELETE RESTRICT, which is what makes "no delete in v1" free: a customer a club points at cannot be removed. NOTE ON EXPOSURE: `products` carries a table-level SELECT grant for `anon`, so this column joins the set an unauthenticated reader can select — known and accepted by the owner for the fee columns already, and what leaks is an opaque id, since invoice_customers itself is admin-only and holds everything that would say who the customer is.';


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: idx_products_image_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_image_id ON public.products USING btree (image_id);


--
-- Name: idx_products_invoice_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_invoice_customer ON public.products USING btree (invoice_customer_id) WHERE (invoice_customer_id IS NOT NULL);


--
-- Name: idx_products_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_location ON public.products USING btree (location_id) WHERE (location_id IS NOT NULL);


--
-- Name: idx_products_reg_opens_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_reg_opens_at ON public.products USING btree (registration_opens_at);


--
-- Name: idx_products_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_topic ON public.products USING btree (topic);


--
-- Name: idx_products_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_type ON public.products USING btree (product_type);


--
-- Name: idx_products_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_visible ON public.products USING btree (is_visible) WHERE (is_visible = true);


--
-- Name: products products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products trg_products_apply_image_path; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_apply_image_path BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.apply_product_image_path();


--
-- Name: products trg_products_seed_seat_counts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_seed_seat_counts AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_seed_product_seat_counts();


--
-- Name: products trg_validate_products_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_products_location BEFORE INSERT OR UPDATE OF location_id, is_remote, product_type ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_products_location();


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: products products_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.product_images(id) ON DELETE SET NULL;


--
-- Name: products products_invoice_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_invoice_customer_id_fkey FOREIGN KEY (invoice_customer_id) REFERENCES public.invoice_customers(id) ON DELETE RESTRICT;


--
-- Name: products products_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: products admin_full_access_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_products ON public.products TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products read_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_products ON public.products FOR SELECT TO authenticated, anon USING (public.can_read_product(id));


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;


