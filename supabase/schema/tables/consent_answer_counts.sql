--
-- Name: consent_answer_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_answer_counts (
    day date NOT NULL,
    answer public.consent_answer NOT NULL,
    page text,
    count integer NOT NULL,
    CONSTRAINT consent_answer_counts_count_check CHECK ((count > 0)),
    CONSTRAINT consent_answer_counts_page_check CHECK (((page IS NULL) OR ((page ~ '^/'::text) AND (char_length(page) <= 2048))))
);


--
-- Name: TABLE consent_answer_counts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_answer_counts IS 'The cookie banner''s answers, counted: how many devices gave each answer on each UTC day, on each page. Only a device''s first answer is counted, never a change of an existing one. Holds no identifier of any kind — no IP, user agent, cookie, session or account — so a row says how many and never who. Anyone can inflate a count through the public route that writes it; that is accepted. Written only by count_consent_answer; service role only.';


--
-- Name: COLUMN consent_answer_counts.day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_answer_counts.day IS 'The UTC day the answers were given.';


--
-- Name: COLUMN consent_answer_counts.page; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_answer_counts.page IS 'The marketing page the banner was answered on, as its internal path (locale stripped, slug untranslated, ids kept, never a query); NULL for any page that is not a marketing page.';


--
-- Name: COLUMN consent_answer_counts.count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_answer_counts.count IS 'How many answers this row stands for. A row exists only once one has been counted.';


--
-- Name: consent_answer_counts consent_answer_counts_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_answer_counts
    ADD CONSTRAINT consent_answer_counts_key UNIQUE NULLS NOT DISTINCT (day, answer, page);


--
-- Name: consent_answer_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_answer_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE consent_answer_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.consent_answer_counts TO service_role;


