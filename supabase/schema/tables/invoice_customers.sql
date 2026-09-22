--
-- Name: invoice_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fennoa_customer_no text NOT NULL,
    invoice_name text NOT NULL,
    street text NOT NULL,
    postal_code text NOT NULL,
    city text NOT NULL,
    country_code text DEFAULT 'FI'::text NOT NULL,
    your_reference text,
    invoice_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_invoice_customers_city_present CHECK ((btrim(city) <> ''::text)),
    CONSTRAINT chk_invoice_customers_country_code_shape CHECK ((country_code ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT chk_invoice_customers_fennoa_customer_no_present CHECK ((btrim(fennoa_customer_no) <> ''::text)),
    CONSTRAINT chk_invoice_customers_invoice_name_present CHECK ((btrim(invoice_name) <> ''::text)),
    CONSTRAINT chk_invoice_customers_invoice_text_present_if_set CHECK (((invoice_text IS NULL) OR (btrim(invoice_text) <> ''::text))),
    CONSTRAINT chk_invoice_customers_postal_code_present CHECK ((btrim(postal_code) <> ''::text)),
    CONSTRAINT chk_invoice_customers_street_present CHECK ((btrim(street) <> ''::text)),
    CONSTRAINT chk_invoice_customers_your_reference_present_if_set CHECK (((your_reference IS NULL) OR (btrim(your_reference) <> ''::text)))
);


--
-- Name: TABLE invoice_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoice_customers IS 'One row per FENNOA CUSTOMER School of Gaming invoices for municipality clubs — the buyer a Finvoice 3.0 file is addressed to, matched by Fennoa on fennoa_customer_no. A buyer is a CUSTOMER and not a municipality: one city can be two customers (library clubs and school clubs bought by two departments under two agreements) and an association can be the customer for clubs running inside a municipality it is not. So the link is per CLUB — products.invoice_customer_id — and nothing may derive one from a club''s location. THIS TABLE NEVER REFERENCES `locations`, by owner rule: location data is geography and has to work for every country we operate in, while this is Finnish contract data, so the customer carries its own postal address rather than pointing at a place. What lives here is only what the FILE needs: the customer number, the invoice name, the address, an optional "your reference" (a PO number or a contact) and optional extra invoice text. Payment terms, e-invoice routing and department names stay on the Fennoa customer card, which owns them. Admin-only end to end: SELECT for authenticated behind an admin policy, and no write grant at all — the only writers are create_invoice_customer and update_invoice_customer. No delete in v1: a customer a club points at cannot go anyway, because that foreign key is ON DELETE RESTRICT.';


--
-- Name: COLUMN invoice_customers.fennoa_customer_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.fennoa_customer_no IS 'The customer''s number in Fennoa, e.g. F0037. This is the join key between the exported file and Fennoa''s own ledger: it is written into BuyerPartyIdentifier and is how the import finds the buyer. UNIQUE, because two rows claiming one Fennoa customer would produce two files Fennoa would post to the same account with no way to tell which was meant.';


--
-- Name: COLUMN invoice_customers.invoice_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.invoice_name IS 'The buyer''s name as it must read on the invoice — the legal or agreed billing name, which is not always the name anybody says out loud. Stored rather than derived from a municipality''s name for exactly that reason, and because a customer may be an association with no municipality name to derive from.';


--
-- Name: COLUMN invoice_customers.street; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.street IS 'The buyer''s street address. Required even though Fennoa''s own customer card holds one, because the Finvoice import demands a buyer postal address INSIDE the file — a file without it is refused.';


--
-- Name: COLUMN invoice_customers.postal_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.postal_code IS 'The buyer''s postal code. Free text rather than a reference to the postal code table: this is the address printed on an invoice to a buyer who may be outside Finland, and validating it against Finnish geography would refuse a correct foreign address.';


--
-- Name: COLUMN invoice_customers.city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.city IS 'The buyer''s post town. Part of the address block, and unrelated to which municipality a club runs in — a customer''s billing address and a club''s location are two different facts and are allowed to disagree.';


--
-- Name: COLUMN invoice_customers.country_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.country_code IS 'ISO 3166-1 alpha-2, uppercase, defaulting to FI because every customer today is Finnish. A CHECK on the SHAPE and nothing more: which countries we bill in is contract data that moves as agreements land, so an enum would need a migration per country.';


--
-- Name: COLUMN invoice_customers.your_reference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.your_reference IS 'The buyer''s own reference for the invoice — a purchase-order number, or the person at the customer who owns the agreement. Optional: many customers ask for none, and the serializer omits the element when there is nothing to put in it. NULL or a real value, never a blank string.';


--
-- Name: COLUMN invoice_customers.invoice_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.invoice_text IS 'Extra free text the customer wants on every invoice, as authored lines. Optional, and NULL or real for the same reason your_reference is. Not markdown and not rendered anywhere in the app: it is copy for a Finvoice document, so it travels as typed.';


--
-- Name: COLUMN invoice_customers.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.created_at IS 'When the customer was recorded. Server-stamped.';


--
-- Name: COLUMN invoice_customers.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_customers.updated_at IS 'When the customer was last edited, maintained by the invoice_customers_updated_at trigger rather than by any writer — a timestamp a caller supplies proves nothing about when the row changed.';


--
-- Name: invoice_customers invoice_customers_fennoa_customer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_customers
    ADD CONSTRAINT invoice_customers_fennoa_customer_no_key UNIQUE (fennoa_customer_no);


--
-- Name: invoice_customers invoice_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_customers
    ADD CONSTRAINT invoice_customers_pkey PRIMARY KEY (id);


--
-- Name: invoice_customers invoice_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoice_customers_updated_at BEFORE UPDATE ON public.invoice_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invoice_customers admins_read_invoice_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_invoice_customers ON public.invoice_customers FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: invoice_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE invoice_customers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.invoice_customers TO authenticated;
GRANT ALL ON TABLE public.invoice_customers TO service_role;


