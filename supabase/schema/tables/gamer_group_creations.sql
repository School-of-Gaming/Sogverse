--
-- Name: gamer_group_creations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_group_creations (
    group_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    creations jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT chk_gamer_group_creations_shape CHECK (((jsonb_typeof(creations) = 'array'::text) AND (NOT (creations @? 'strict $?(@.size() < 1 || @.size() > 20)'::jsonpath)) AND (NOT (creations @? '$[*]?(@.type() != "object")'::jsonpath)) AND (NOT (creations @? '$[*]?(!(exists (@."title")) || !(exists (@."url")))'::jsonpath)) AND (NOT (creations @? '$[*]?(@."title".type() != "string" || @."url".type() != "string")'::jsonpath)) AND (NOT (creations @? '$[*].keyvalue()?(@."key" != "title" && @."key" != "url")'::jsonpath)) AND (NOT (creations @? '$[*]?(@."title" like_regex "^[[:space:]]*$" || @."url" like_regex "^[[:space:]]*$")'::jsonpath)) AND (NOT (creations @? '$[*]?(@."title" like_regex "^.{201,}" flag "s")'::jsonpath)) AND (NOT (creations @? '$[*]?(@."url" like_regex "^(.{250}){8}." flag "s")'::jsonpath))))
);


--
-- Name: TABLE gamer_group_creations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gamer_group_creations IS 'One row per (group, member): the things that person made during this group''s run, as an ORDERED JSONB array of {title, url} objects. Array order is display order — there is no position column and no reorder affordance, so staff retype to rearrange. Written by staff (an admin, or a gedu assigned to the product), read by that member and their family: this is the one piece of staff-authored per-member data that IS family-visible, which is a property of which documents emit it and not of this table''s access, since no family reads the table either. The URL is raw text with NO validation, by owner decision — the family card parses it and renders a plain label rather than an anchor when it does not parse as http(s), which is why the title is required. ABSENCE OF A ROW is what "no creations" means everywhere: an empty list DELETES the row rather than storing [], and the CHECK refuses an empty array so the two states cannot both exist. Strictly keyed to the group, so the list does not follow a member moved to another group, and a member who leaves leaves their row behind — unreachable from every surface and refused by the write RPC''s target check, an accepted leftover exactly as the note''s is. Deleting the GROUP does delete the row, by FK. No Data API role holds a grant on this table and RLS is on with no policy at all: every read rides a document RPC, every write goes through set_gamer_group_creations, and all of those are SECURITY DEFINER.';


--
-- Name: COLUMN gamer_group_creations.group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_creations.group_id IS 'The group the list is filed under. ON DELETE CASCADE — the list belongs to the group, so deleting the group deletes it. Accepted: group deletion is rare admin cleanup, and the same choice the note makes.';


--
-- Name: COLUMN gamer_group_creations.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_creations.participant_id IS 'The person the creations belong to — whoever holds the seat, adult or child, the same subject participations.participant_id names. References profiles rather than participations so a seat rewritten in place does not take the list with it; membership is asserted by the write RPC''s target check instead.';


--
-- Name: COLUMN gamer_group_creations.creations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_creations.creations IS 'The ordered list: a JSONB array of objects with EXACTLY the keys title and url, both non-blank strings, title at most 200 characters and url at most 2000, at least one and at most twenty entries. All of that is the table''s CHECK, which is a loud backstop rather than a routine error path — the dialog drops a fully blank row and refuses to save a half-filled one, so a violation reaching here means a non-UI caller. The write RPC deliberately does not normalise the value (no trimming, no key filtering): rebuilding each element would silently discard the extra keys this CHECK exists to refuse.';


--
-- Name: COLUMN gamer_group_creations.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_creations.updated_by IS 'Who last wrote the list. ON DELETE SET NULL: a departed gedu''s account must not delete the work they recorded. Stored from day one and displayed NOWHERE in v1 — no reader joins profiles for it — so this and updated_at are provenance held against a later need, not fields with a surface behind them.';


--
-- Name: gamer_group_creations gamer_group_creations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_creations
    ADD CONSTRAINT gamer_group_creations_pkey PRIMARY KEY (group_id, participant_id);


--
-- Name: gamer_group_creations gamer_group_creations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gamer_group_creations_updated_at BEFORE UPDATE ON public.gamer_group_creations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gamer_group_creations gamer_group_creations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_creations
    ADD CONSTRAINT gamer_group_creations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: gamer_group_creations gamer_group_creations_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_creations
    ADD CONSTRAINT gamer_group_creations_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gamer_group_creations gamer_group_creations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_creations
    ADD CONSTRAINT gamer_group_creations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gamer_group_creations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_group_creations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE gamer_group_creations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gamer_group_creations TO service_role;


