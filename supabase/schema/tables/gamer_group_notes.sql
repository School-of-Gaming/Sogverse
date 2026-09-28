--
-- Name: gamer_group_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_group_notes (
    group_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT chk_gamer_group_notes_length CHECK ((((char_length(note) >= 1) AND (char_length(note) <= 2000)) AND (btrim(note) <> ''::text)))
);


--
-- Name: TABLE gamer_group_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gamer_group_notes IS 'One row per (group, member): what the staff running that group need to know about that person before the session starts. Plain text, not markdown — a note is read in the box it was typed in, and offering headings would invite composing a document rather than jotting. Strictly keyed to the group, so a note does NOT follow a member who is moved: it is about how THIS group is going, and half of them would be stale or actively misleading in the next one. A member who leaves the group leaves their row behind, unreachable from every surface (all of them render the group''s active roster) and refused by the write RPC''s target check — an ACCEPTED leftover, not an oversight, and deliberately not cleaned up. Deleting the GROUP does delete the note, by FK. No Data API role holds a grant on this table and RLS is on with no policy at all: every read rides a roster document or get_group_staff_overlay, every write goes through set_gamer_group_note, and all of those are SECURITY DEFINER. Absence of a row is what "no note" means everywhere. One further consequence of the retention, also reviewed and accepted: a member who leaves and later RETURNS to the group silently regains their old row, and every surface presents it as current — the note dialog names its writer but not its date. Dating the edit line is the known follow-up if months-old guidance resurfacing this way ever misleads in practice.';


--
-- Name: COLUMN gamer_group_notes.group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_notes.group_id IS 'The group the note is filed under. ON DELETE CASCADE — a note belongs to the group, so deleting the group deletes it. This is the one orphan case that IS cleaned up, and the FK is what cleans it.';


--
-- Name: COLUMN gamer_group_notes.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_notes.participant_id IS 'The person the note is about — whoever holds the seat, adult or child, the same subject participations.participant_id names. References profiles rather than participations so a seat rewritten in place does not take the note with it; membership is asserted by the write RPC''s target check instead.';


--
-- Name: COLUMN gamer_group_notes.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_group_notes.updated_by IS 'Who last wrote it, surfaced to other staff as "Last edited by {first name}". ON DELETE SET NULL: a departed gedu''s account must not delete the note they wrote — the note stands and the read simply shows no editor line. There is no history here; only the last editor is stored.';


--
-- Name: gamer_group_notes gamer_group_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_pkey PRIMARY KEY (group_id, participant_id);


--
-- Name: gamer_group_notes gamer_group_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gamer_group_notes_updated_at BEFORE UPDATE ON public.gamer_group_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gamer_group_notes gamer_group_notes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: gamer_group_notes gamer_group_notes_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gamer_group_notes gamer_group_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_group_notes
    ADD CONSTRAINT gamer_group_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gamer_group_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_group_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE gamer_group_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gamer_group_notes TO service_role;


