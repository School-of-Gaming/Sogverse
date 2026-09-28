--
-- Name: billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_mode AS ENUM (
    'paid',
    'free',
    'external_contract'
);


--
-- Name: chat_channel_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_channel_type AS ENUM (
    'group_session'
);


--
-- Name: TYPE chat_channel_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.chat_channel_type IS 'What a chat channel IS, and therefore which membership rule answers "who can read it". `group_session` is the chat of one scheduled voice-room session window. The seam a later direct-message or staff channel extends: add a value here and a branch to is_chat_channel_member / is_chat_channel_moderator, and every table, policy and RPC below is unchanged.';


--
-- Name: effective_product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.effective_product_status AS ENUM (
    'pending',
    'running',
    'completed'
);


--
-- Name: TYPE effective_product_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.effective_product_status IS 'The lifecycle a reader sees, computed at read time and stored nowhere: pending (the start date has not arrived), running (it has, and the end date has not passed), completed (it has, and the end date has passed). Derived from start_date and end_date alone, each compared against today in the product''s own timezone. There is no state for a product whose end date passed while it was still pending: start_date is NOT NULL and chk_products_date_range keeps end_date on or after it, so a product that has not started cannot have ended.';


--
-- Name: gamer_photo_consent_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gamer_photo_consent_type AS ENUM (
    'lynx_educate'
);


--
-- Name: TYPE gamer_photo_consent_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.gamer_photo_consent_type IS 'The photo permissions a parent can hold on behalf of a gamer. One value, lynx_educate: School of Gaming does not use children''s photographs on its own products and so does not ask, and the Roblox Programme delivered with Lynx Educate is the one place real photographs of children arise. Named for the PARTY exactly as marketing_consent_type is, rather than for the activity — because an enum value here is a standing permission over a child''s image and, like a marketing consent and unlike a consent DOCUMENT, it has no text to version and no republication for a stored row to outlive. A future partner is a new value and a new sentence; what the enum buys is that a typo cannot become a permission nobody can find to revoke.';


--
-- Name: gamer_sign_in; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gamer_sign_in AS ENUM (
    'parent',
    'username',
    'email'
);


--
-- Name: gedu_assignment_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gedu_assignment_role AS ENUM (
    'primary',
    'assistant'
);


--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_type AS ENUM (
    'boy',
    'girl',
    'non_binary'
);


--
-- Name: location_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.location_type AS ENUM (
    'country',
    'region',
    'municipality',
    'district',
    'site'
);


--
-- Name: marketing_consent_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.marketing_consent_type AS ENUM (
    'school_of_gaming',
    'lynx_educate'
);


--
-- Name: TYPE marketing_consent_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.marketing_consent_type IS 'The marketing permissions a parent can hold. school_of_gaming is our own mailing list, asked for at parent registration. lynx_educate is our partner''s, asked for only on products an admin has attached it to — see product_marketing_consents. An enum rather than a whitelist table because a marketing consent, unlike a consent DOCUMENT, has no text to version and no republication for a stored row to outlive: it is a standing permission to mail, and the party it names is the whole of it.';


--
-- Name: participation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.participation_status AS ENUM (
    'reserving',
    'active',
    'waitlisted',
    'completed'
);


--
-- Name: TYPE participation_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.participation_status IS 'Participation lifecycle. ''reserving'' is RETIRED (2026-08): paid participations are created at payment confirmation, so nothing writes it. PostgreSQL cannot drop an enum value, hence it remains listed.';


--
-- Name: payment_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_purpose AS ENUM (
    'bundle',
    'subscription_invoice',
    'single_payment',
    'reservation_duplicate'
);


--
-- Name: product_tag; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_tag AS ENUM (
    'neuroinclusive',
    'beginner',
    'advanced'
);


--
-- Name: TYPE product_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.product_tag IS 'Who a product was DESIGNED for, as opposed to who may hold a seat on it (that is the audience — for_gamers/for_parents). Exactly one per product or none at all. The label copy lives in messages/, not here: this enum stores the value and nothing else, the same arrangement product_topic has. ''neuroinclusive'' is deliberately not ''neurodivergent-friendly'' — the -friendly suffix implies every unlabelled club is unfriendly, where this states a design property without ranking the rest of the catalogue.';


--
-- Name: product_topic; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_topic AS ENUM (
    'minecraft_java',
    'minecraft_education',
    'minecraft_bedrock',
    'fortnite',
    'roblox_studio',
    'pokemon_go',
    'rocket_league',
    'creator_studio',
    'programming',
    'ai',
    'esports',
    'game_studio',
    'digital_safety'
);


--
-- Name: product_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_type AS ENUM (
    'consumer_club',
    'municipality_club',
    'camp',
    'event'
);


--
-- Name: spoken_language; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.spoken_language AS ENUM (
    'fi',
    'sv',
    'en',
    'fr'
);


--
-- Name: TYPE spoken_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.spoken_language IS 'A human language a club is delivered in, or that a person speaks. Distinct from profiles.locale, which is which translation of the app someone sees: a Finnish-speaking parent may read the app in Finnish and want their child in an English club. Display names are never stored — the UI asks Intl.DisplayNames for the name in the reader''s own locale — so this type carries codes and nothing else. Adding a value is a code change as well as a migration: the flag map in src/components/ui/language-flag.tsx is keyed by this enum and will not compile without an entry. The vocabulary only grows: a language is added with ALTER TYPE ... ADD VALUE, but PostgreSQL cannot drop an enum value, so one we stop delivering in is retired by no longer offering it and remains listed here.';


--
-- Name: substitution_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.substitution_reason AS ENUM (
    'sick',
    'other'
);


--
-- Name: substitution_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.substitution_request_status AS ENUM (
    'open',
    'substituted',
    'withdrawn'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'customer',
    'gamer',
    'gedu'
);


