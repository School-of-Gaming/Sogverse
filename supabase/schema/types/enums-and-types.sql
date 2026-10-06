--
-- Name: billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_mode AS ENUM (
    'paid',
    'free',
    'external_contract'
);


--
-- Name: catalogue_image_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.catalogue_image_purpose AS ENUM (
    'product',
    'library_cover',
    'landing_image'
);


--
-- Name: TYPE catalogue_image_purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.catalogue_image_purpose IS 'What a catalogue picture is for: ''product'', a product''s picture; ''library_cover'', a Library article''s cover; or ''landing_image'', a picture on a landing page. Each purpose has its own storage bucket (product-images, library-covers, landing-images) and its own exact stored size; both live in the application''s one purpose map, and the size is enforced by the upload routes, which measure the bytes. No aspect ratio is stored: a purpose outlives any one crop.';


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
-- Name: gedu_qualification; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gedu_qualification AS ENUM (
    'neuroinclusive',
    'consumer_products'
);


--
-- Name: TYPE gedu_qualification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.gedu_qualification IS 'A qualification an admin grants a game educator. neuroinclusive: qualified to run groups in products tagged neuroinclusive (product_tag). consumer_products: cleared to run the products families pay for themselves, which are the consumer_club, camp and event product types, everything except municipality_club. The name is broader than "consumer" on purpose: in this codebase "consumer" alone means the consumer_club product type, and this qualification also covers camps and events. What a product requires is product_required_qualifications. A gedu lacking one cannot see or offer on a substitution request for such a product; an admin assigning or seating them is warned and may proceed. The app lists them in the order declared here, so a new value goes where it should appear.';


--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_type AS ENUM (
    'boy',
    'girl',
    'non_binary'
);


--
-- Name: invoice_billing_cadence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_billing_cadence AS ENUM (
    'monthly',
    'quarterly',
    'half_yearly'
);


--
-- Name: TYPE invoice_billing_cadence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.invoice_billing_cadence IS 'How often an invoice customer is invoiced: every calendar month, every calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), or every calendar half-year (Jan–Jun, Jul–Dec). A period is a run of whole calendar months, and its invoice is produced in the period''s last month.';


--
-- Name: library_article_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.library_article_category AS ENUM (
    'online_safety',
    'screen_time',
    'learning',
    'games_explained',
    'for_schools'
);


--
-- Name: TYPE library_article_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.library_article_category IS 'The Library''s five categories; every published article is in exactly one. The app uses these values as they are, in the index''s ?category= links and as the keys of its category labels, so there is one spelling everywhere. There is no news category on purpose: the Library holds what a parent can still use next year, and a dated announcement is not that.';


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
-- Name: notification_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_channel AS ENUM (
    'email'
);


--
-- Name: TYPE notification_channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.notification_channel IS 'How a notification reaches a person. email: a mail to the address on their profile. The settings page groups its toggles by channel, in the order declared here.';


--
-- Name: notification_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_kind AS ENUM (
    'session_report_copy'
);


--
-- Name: TYPE notification_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.notification_kind IS 'What a notification a person can opt into is about. session_report_copy: the copy of a session report mailed to its sender when a gedu or an admin emails the report to the group''s families; an admin who opted in on the email channel is in its CC. Every kind is off on every channel until the person turns it on. The app lists them in the order declared here, so a new value goes where it should appear.';


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


