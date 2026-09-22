--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid NOT NULL,
    channel_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text,
    image_width integer,
    image_height integer,
    reply_to_message_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    edited_at timestamp with time zone,
    hidden_at timestamp with time zone,
    hidden_by uuid,
    image_stored_at timestamp with time zone,
    CONSTRAINT chk_chat_messages_display_length CHECK (((body IS NULL) OR (char_length(regexp_replace(body, '@\[([^][]{1,64})\]\(([0-9a-fA-F-]{36})\)'::text, '@\1'::text, 'g'::text)) <= 500))),
    CONSTRAINT chk_chat_messages_image_height CHECK (((image_height IS NULL) OR ((image_height > 0) AND (image_height <= 4096)))),
    CONSTRAINT chk_chat_messages_image_width CHECK (((image_width IS NULL) OR ((image_width > 0) AND (image_width <= 4096)))),
    CONSTRAINT chk_chat_messages_stored_implies_image CHECK (((image_stored_at IS NULL) OR (image_width IS NOT NULL))),
    CONSTRAINT chk_chat_messages_text_xor_image CHECK ((((body IS NOT NULL) AND (btrim(body) <> ''::text) AND (image_width IS NULL) AND (image_height IS NULL)) OR ((body IS NULL) AND (image_width IS NOT NULL) AND (image_height IS NOT NULL))))
);


--
-- Name: TABLE chat_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_messages IS 'One message. Text XOR one image, never both — the composer fans a burst out into one image-only row per picture plus one text row. Removal is a SOFT delete (hidden_at/hidden_by) and nothing else: the row and the bytes survive, the reader''s place is kept by a tombstone that holds the row''s spot, and a moderator keeps reading the original, which is the moment the record matters most. Rows are never physically deleted — v1 has no retention mechanism, by decision — except by CASCADE when the channel, its group or the sender''s own account goes. Written only by send_chat_message, send_chat_image_message, edit_chat_message, hide_chat_message and restore_chat_message; `authenticated` holds SELECT and nothing more.';


--
-- Name: COLUMN chat_messages.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.id IS 'Client-supplied, so the optimistic echo reconciles by identity. A hostile caller can therefore choose the id of their own message and nothing else — the primary key refuses a collision and every other column is stamped by the RPC.';


--
-- Name: COLUMN chat_messages.body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.body IS 'The message text, or NULL on an image row. Mentions ride INSIDE it as `@[Name](id)` rather than in a join table: the name so a body read anywhere at all still says who was meant, the id so the highlight keys on an account rather than on a string anybody could type. The send and edit RPCs validate every token''s id against the channel roster, and the display-length CHECK measures the flattened form.';


--
-- Name: COLUMN chat_messages.image_width; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.image_width IS 'The stored image''s pixel width on an image row, NULL on a text row. SERVER-MEASURED by the upload route''s re-encode — a client-claimed number never reaches this column — and the sole input to the thumbnail''s box geometry, because nothing measures a decoded image in a scrolling log.';


--
-- Name: COLUMN chat_messages.image_height; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.image_height IS 'The stored image''s pixel height. See `image_width` — same provenance, same sanity bound, and both are NULL or both are set by the XOR constraint.';


--
-- Name: COLUMN chat_messages.hidden_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.hidden_by IS 'Who removed this message — the sender themselves, or a moderator. AUDIT ONLY: nothing in the UI reads it and the tombstone is identical either way, so a room is never told which of the two happened. It exists for the psql review path (docs/runbooks/remote-supabase-psql.md), where "who removed this" has to be answerable. Cleared again by restore_chat_message, because after a restore nothing was removed. ON DELETE SET NULL, so a departed moderator leaves the removal recorded without the name.';


--
-- Name: COLUMN chat_messages.image_stored_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.image_stored_at IS 'When this image message''s object finished landing in the chat-images bucket — NULL while the bytes are still in flight (or were lost: an upload failure hides the row and never sets this). Written once, by mark_chat_image_stored, after the storage write returns; MONOTONE — nothing ever clears it, because the object is upsert:false and never deleted. The flag''s realtime UPDATE is what tells every subscriber the picture is fetchable, so clients render and fetch an image only when this is set — which is what closes the row-before-bytes race by construction. NULL on a text message, enforced by chk_chat_messages_stored_implies_image.';


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_messages_channel_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_channel_order_idx ON public.chat_messages USING btree (channel_id, created_at, id);


--
-- Name: chat_messages_channel_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_channel_sender_idx ON public.chat_messages USING btree (channel_id, sender_id);


--
-- Name: chat_messages chat_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_hidden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_hidden_by_fkey FOREIGN KEY (hidden_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT TO authenticated USING (( SELECT public.is_chat_channel_member(chat_messages.channel_id) AS is_chat_channel_member));


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


