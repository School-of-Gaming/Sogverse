--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    currency text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    spoken_languages public.spoken_language[] DEFAULT '{}'::public.spoken_language[] NOT NULL,
    locale text,
    first_name text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    home_location_id uuid,
    email_verified_at timestamp with time zone,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    registration_completed_at timestamp with time zone,
    utm_content text,
    utm_term text,
    registration_marketing_consent boolean,
    signup_intent_kind text,
    signup_intent_id uuid,
    CONSTRAINT profiles_first_name_shape CHECK ((((char_length(first_name) >= 2) AND (char_length(first_name) <= 32)) AND (first_name !~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$'::text) AND (first_name ~ '[^[:space:]\u00A0\u200B\uFEFF]'::text))),
    CONSTRAINT profiles_last_name_shape CHECK (((char_length(last_name) <= 32) AND (last_name !~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$'::text))),
    CONSTRAINT profiles_phone_e164 CHECK ((phone ~ '^\d{7,15}$'::text)),
    CONSTRAINT profiles_signup_intent_kind_known CHECK (((signup_intent_kind IS NULL) OR (signup_intent_kind = ANY (ARRAY['product'::text, 'municipality_club'::text, 'landing_page'::text])))),
    CONSTRAINT profiles_signup_intent_whole CHECK (((signup_intent_kind IS NULL) = (signup_intent_id IS NULL))),
    CONSTRAINT profiles_utm_campaign_format CHECK (((utm_campaign IS NULL) OR ((btrim(utm_campaign) <> ''::text) AND (char_length(btrim(utm_campaign)) <= 200) AND (utm_campaign !~ '[[:cntrl:]]'::text) AND ("left"(btrim(utm_campaign), 1) <> ALL (ARRAY['='::text, '+'::text, '-'::text, '@'::text, chr(9), chr(13)]))))),
    CONSTRAINT profiles_utm_content_format CHECK (((utm_content IS NULL) OR ((btrim(utm_content) <> ''::text) AND (char_length(btrim(utm_content)) <= 200) AND (utm_content !~ '[[:cntrl:]]'::text) AND ("left"(btrim(utm_content), 1) <> ALL (ARRAY['='::text, '+'::text, '-'::text, '@'::text, chr(9), chr(13)]))))),
    CONSTRAINT profiles_utm_medium_format CHECK (((utm_medium IS NULL) OR ((btrim(utm_medium) <> ''::text) AND (char_length(btrim(utm_medium)) <= 200) AND (utm_medium !~ '[[:cntrl:]]'::text) AND ("left"(btrim(utm_medium), 1) <> ALL (ARRAY['='::text, '+'::text, '-'::text, '@'::text, chr(9), chr(13)]))))),
    CONSTRAINT profiles_utm_source_format CHECK (((utm_source IS NULL) OR ((btrim(utm_source) <> ''::text) AND (char_length(btrim(utm_source)) <= 200) AND (utm_source !~ '[[:cntrl:]]'::text) AND ("left"(btrim(utm_source), 1) <> ALL (ARRAY['='::text, '+'::text, '-'::text, '@'::text, chr(9), chr(13)]))))),
    CONSTRAINT profiles_utm_term_format CHECK (((utm_term IS NULL) OR ((btrim(utm_term) <> ''::text) AND (char_length(btrim(utm_term)) <= 200) AND (utm_term !~ '[[:cntrl:]]'::text) AND ("left"(btrim(utm_term), 1) <> ALL (ARRAY['='::text, '+'::text, '-'::text, '@'::text, chr(9), chr(13)])))))
);


--
-- Name: COLUMN profiles.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email IS 'Email address (NOT NULL for every role). Gamer accounts carry a generated synthetic <token>@gamer.sogverse.internal address until/unless replaced by a real one.';


--
-- Name: COLUMN profiles.spoken_languages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.spoken_languages IS 'Human languages the user speaks, as public.spoken_language values. Used for matching gamers/gedus to clubs; for a gedu it is also a substitution requirement — gedu_speaks_session_language keeps a request out of their pool, and refuses their offer, unless the session''s product is run in one of these. Distinct from locale, which controls UI translation. The enum guarantees every entry is a language we offer; the BEFORE trigger on this column is what guarantees no entry appears twice.';


--
-- Name: COLUMN profiles.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.locale IS 'BCP-47-style UI locale code (en, fi, sv, ...). Null = auto-detect from cookie/Accept-Language. Distinct from spoken_languages, which is the user''s human-language fluency.';


--
-- Name: COLUMN profiles.home_location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.home_location_id IS 'Optional municipality-level locations row: where this parent''s family lives. ON DELETE SET NULL by choice — a merged or retired reference row empties this reference rather than blocking its removal, at the cost of silently clearing the parent''s pick. Acceptable only because the field is optional and carries no entitlement.';


--
-- Name: COLUMN profiles.email_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email_verified_at IS 'When the address in profiles.email was last proven to reach this account''s owner, or NULL for "not verified" — the resting state for gamer rows, whose synthetic <token>@gamer.sogverse.internal address no inbox answers. Written only by service_role: the route that validates a signed verification link, the registration-completion routes when the identity provider that created the account reports the same address verified, and the OAuth callback when a Google identity reporting this same address verified signs into an account not yet verified. There is deliberately no UPDATE grant at any level for authenticated or anon, because a marker its own subject can set proves nothing. Reset to NULL by trg_reset_email_verification whenever profiles.email changes — the value is a claim about one address, not about the account.';


--
-- Name: COLUMN profiles.utm_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.utm_source IS 'Optional marketing provenance: the utm_source from the link this account arrived through, or NULL (the large majority). Written once and never updatable — there is deliberately no UPDATE grant, at any level, for any role but service_role. The one write is handle_new_user() from the signup metadata, except for an account created by an identity provider (Google), whose round trip carries no signup metadata: there it is the registration-completion route that makes it. Case is preserved, because Vercel reports UTM values case-sensitively. Labels only: it grants nothing, is never used for profiling or to decide what anyone is shown or charged, and gamer rows always hold NULL.';


--
-- Name: COLUMN profiles.utm_medium; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.utm_medium IS 'Optional marketing provenance: the utm_medium from the link this account arrived through, or NULL. Same rules as utm_source — write-once, no UPDATE grant, case preserved, NULL on every gamer row.';


--
-- Name: COLUMN profiles.utm_campaign; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.utm_campaign IS 'Optional marketing provenance: the utm_campaign from the link this account arrived through, or NULL. Same rules as utm_source. This is the single "utm parameter" a partner data export reports on, and campaigns issued to or for a partner are prefixed with the partner''s slug and a hyphen (lynx-summer-a, rblx-launch) — a naming convention, not a constraint, and one that cannot be retrofitted because the value is immutable once written.';


--
-- Name: COLUMN profiles.registration_completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.registration_completed_at IS 'When this account finished registering — gave its name, accepted the terms and answered the consents — or NULL while it still owes that. handle_new_user() sets it at creation for a password account, whose registration route supplies everything in the same request, and leaves it NULL for any other provider (Google), which arrives with none of it. After creation it is written only by service_role (the routes that complete a registration); there is deliberately no UPDATE grant at any level for authenticated or anon, because a parent able to set it could skip the terms. The proxy sends a customer whose value is NULL to the finish page from every protected page.';


--
-- Name: COLUMN profiles.utm_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.utm_content IS 'Optional marketing provenance: the utm_content from the link this account arrived through, or NULL. Same rules as utm_source — write-once, no UPDATE grant, case preserved, NULL on every gamer row.';


--
-- Name: COLUMN profiles.utm_term; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.utm_term IS 'Optional marketing provenance: the utm_term from the link this account arrived through, or NULL. Same rules as utm_source — write-once, no UPDATE grant, case preserved, NULL on every gamer row.';


--
-- Name: COLUMN profiles.registration_marketing_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.registration_marketing_consent IS 'The answer this parent gave at registration to "may School of Gaming send me news and offers by email": true, false, or NULL when they were never asked — every gamer and gedu row, and a parent whose registration recorded no answer. A record of what the form was told, not the current permission: the current answer to our own mailing list lives in Klaviyo, which the parent sync sends this to. Written once, by the registration routes through the service role; there is deliberately no UPDATE grant at any level for authenticated or anon.';


--
-- Name: COLUMN profiles.signup_intent_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.signup_intent_kind IS 'What this parent was trying to reach when they registered, by its meaning: `product` (a shop product page), `municipality_club` (a municipality club page) or `landing_page` (a live landing page). NULL when the registration started from none of them. Set together with signup_intent_id or not at all. Decided by the row existing and being public when the account was made, never by the URL alone, and the URL is never stored. Written once and never updatable, as the utm_* columns are: by handle_new_user() from the signup metadata, or by the registration-completion route for an account created by an identity provider (Google). No UPDATE grant for any role but service_role; gamer and gedu rows hold NULL. Not gated on the marketing cookie: it is first-party — which of our own pages the parent was trying to reach.';


--
-- Name: COLUMN profiles.signup_intent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.signup_intent_id IS 'The id of the row signup_intent_kind names: a products id for `product` and `municipality_club`, a landing_pages id for `landing_page`. No foreign key on purpose: the row may be deleted later and the fact of where the parent set out from stays true. Same write rules as signup_intent_kind.';


--
-- Name: CONSTRAINT profiles_first_name_shape ON profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT profiles_first_name_shape ON public.profiles IS 'A first name is 2 to 32 characters long, neither begins nor ends with whitespace — any character of the [[:space:]] class, or U+00A0, U+200B or U+FEFF — and holds at least one character that is none of those. Held here rather than only in the forms because a person may update their own first_name straight through the Data API. Every reader may therefore use it as it is: it is never empty, never blank and never padded.';


--
-- Name: CONSTRAINT profiles_last_name_shape ON profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT profiles_last_name_shape ON public.profiles IS 'A last name is at most 32 characters long and neither begins nor ends with whitespace — any character of the [[:space:]] class, or U+00A0, U+200B or U+FEFF. It may be empty: a gamer inherits the parent''s, and older parent accounts predate the requirement the registration forms now make.';


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_profiles_created_at_desc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_created_at_desc_id ON public.profiles USING btree (created_at DESC, id);


--
-- Name: INDEX idx_profiles_created_at_desc_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_profiles_created_at_desc_id IS 'The order every list read of profiles asks for: newest first, id breaking a tie. Written DESC-then-ASC rather than as a plain ascending pair because a backwards read of (created_at, id) orders id descending on a tie, which is not the order the readers use — so the planner would sort instead, and the keyset page would cost a full scan. `created_at` is NOT NULL, so the nulls ordering DESC implies is unreachable.';


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_profiles_home_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_home_location_id ON public.profiles USING btree (home_location_id) WHERE (home_location_id IS NOT NULL);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: profiles profiles_klaviyo_parent_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_klaviyo_parent_changed AFTER UPDATE ON public.profiles FOR EACH ROW WHEN ((((old.role = 'customer'::public.user_role) OR (new.role = 'customer'::public.user_role)) AND (((((((((((((((((((old.email IS DISTINCT FROM new.email) OR (old.first_name IS DISTINCT FROM new.first_name)) OR (old.last_name IS DISTINCT FROM new.last_name)) OR (old.phone IS DISTINCT FROM new.phone)) OR (old.locale IS DISTINCT FROM new.locale)) OR (old.spoken_languages IS DISTINCT FROM new.spoken_languages)) OR (old.home_location_id IS DISTINCT FROM new.home_location_id)) OR (old.currency IS DISTINCT FROM new.currency)) OR (old.email_verified_at IS DISTINCT FROM new.email_verified_at)) OR (old.role IS DISTINCT FROM new.role)) OR (old.registration_completed_at IS DISTINCT FROM new.registration_completed_at)) OR (old.utm_source IS DISTINCT FROM new.utm_source)) OR (old.utm_medium IS DISTINCT FROM new.utm_medium)) OR (old.utm_campaign IS DISTINCT FROM new.utm_campaign)) OR (old.utm_content IS DISTINCT FROM new.utm_content)) OR (old.utm_term IS DISTINCT FROM new.utm_term)) OR (old.signup_intent_kind IS DISTINCT FROM new.signup_intent_kind)) OR (old.signup_intent_id IS DISTINCT FROM new.signup_intent_id)) OR (old.registration_marketing_consent IS DISTINCT FROM new.registration_marketing_consent)))) EXECUTE FUNCTION public.klaviyo_parent_profile_changed();


--
-- Name: profiles profiles_klaviyo_parent_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_klaviyo_parent_deleted AFTER DELETE ON public.profiles FOR EACH ROW WHEN ((old.role = 'customer'::public.user_role)) EXECUTE FUNCTION public.klaviyo_parent_profile_deleted();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles trg_reset_email_verification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reset_email_verification BEFORE UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.reset_email_verification_on_email_change();


--
-- Name: TRIGGER trg_reset_email_verification ON profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_reset_email_verification ON public.profiles IS 'Empties profiles.email_verified_at whenever profiles.email actually changes: the marker is a claim about one address, so it cannot be allowed to follow the account onto a new one. Fires on UPDATE OF email, which includes a SET that rewrites the same value, so the body tests IS DISTINCT FROM and leaves an unchanged address verified.';


--
-- Name: profiles trg_validate_profile_spoken_languages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_profile_spoken_languages BEFORE INSERT OR UPDATE OF spoken_languages ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_profile_spoken_languages();


--
-- Name: profiles profiles_home_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_home_location_id_fkey FOREIGN KEY (home_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles admin_full_access_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_profiles ON public.profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: profiles parents_view_linked_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_view_linked_gamers ON public.profiles FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (id IN ( SELECT parent_gamer.gamer_id
   FROM public.parent_gamer
  WHERE (parent_gamer.parent_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles users_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_profile ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (role = ( SELECT public.get_user_role() AS get_user_role))));


--
-- Name: profiles users_view_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_view_own_profile ON public.profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.spoken_languages; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(spoken_languages) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.locale; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(locale) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.first_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(first_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.last_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(last_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.home_location_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(home_location_id) ON TABLE public.profiles TO authenticated;


