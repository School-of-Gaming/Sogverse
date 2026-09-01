-- A chat image announces when its bytes land.
--
-- The missing half of the two-write image send. The upload route writes the
-- message row first (00229 — the guard in front of the bytes) and the object
-- second, and until now nothing durable recorded that the second write
-- happened: the row reached every subscriber over realtime while the bytes
-- were still in flight, storage emits no events, and a receiver's read attempt
-- refused for earliness carried no promise of a correction. The observed
-- failure: a burst's later images stay blank on every other client until a
-- full reload.
--
-- THE FIX IS A FLAG ON THE ROW, BECAUSE THE ROW IS WHERE EVENTS ALREADY LIVE.
--
-- `image_stored_at` is NULL from the insert and flipped by the route the
-- moment the storage write returns, via the RPC below. That UPDATE replicates
-- to every subscriber on the channel's existing `postgres_changes` stream —
-- chat_messages is already in the publication (00230 is the inspection for
-- that) and its UPDATEs already flow, which is how hide and restore travel —
-- so the flag's arrival IS the event that tells a client the bytes exist. The
-- happens-before chain that closes the race by construction rather than by
-- retry: object committed -> flag committed -> payload delivered -> read
-- attempted, all against the same database. A client cannot ask early,
-- because the only thing that makes it ask is a commit that postdates the
-- object.
--
-- THE FLAG IS MONOTONE, AND EVERYTHING LEANS ON THAT.
--
-- Nothing ever sets it back to NULL: the object is uploaded with
-- `upsert: false`, is never replaced, and is never deleted (bytes survive a
-- hide, for staff review — the route's failure compensation runs only when
-- this flag was never set). NULL -> value, once, is the whole life of the
-- column, which is what lets a client merge it across snapshot races with
-- `cached ?? fetched` and be exactly right: a fetched NULL can never
-- legitimately override a held value.
--
-- BACKFILL: EVERY EXISTING IMAGE ROW IS MARKED STORED.
--
-- Every image row written before this migration either has its object (the
-- upload route returns success only after the storage write) or is already the
-- hidden tombstone the route's compensation left, whose object was swept and
-- which renders as a tombstone regardless of the flag. Without the backfill,
-- shipping the client's "render only when stored" gate would blank every
-- historical picture. The one edge knowingly accepted: a compensation-swept
-- tombstone is marked stored too — hidden rows are indistinguishable from
-- moderator-hidden real images here — so a moderator opening one meets the
-- broken-image state every viewer's renderer already handles.
--
-- SUPERSEDES 00231'S "SHAREABLE WITHIN ONE URL'S LIFETIME" EDGE.
--
-- 00231 is pushed and immutable, and its policy stays live and stays the
-- entire read boundary. What changes (owner decision, 2026-09-01) is HOW that
-- policy is exercised: the client stops minting per-viewer signed URLs — the
-- 12-hour bearer tokens whose "an already-minted URL survives until it
-- expires" edge 00231 records as accepted — and instead fetches bytes through
-- an authenticated app route that calls storage download ON THE CALLER'S OWN
-- SESSION, so the same SELECT policy answers every read at fetch time. The
-- superseded edge shrinks to "bytes already in a member's own browser cache",
-- and no capability URL a child could copy out of a share sheet exists at
-- all. Hiding a message therefore retracts its picture from the next fetch
-- onward, not merely from the next mint.
--
-- CLASSIFICATION: SELF-SCOPING, LIKE THE REST OF 00229'S SURFACE.
--
-- The guard is keyed to auth.uid() through ownership — only the sender of a
-- message may mark it stored — so the caller's identity determines the scope
-- of every answer (§3.4 of docs/architecture/db-authorization.md). Directly
-- callable harm is bounded to self-harm: a modified client marking its own
-- never-uploaded image stored makes every receiver's fetch 404 into the same
-- broken-image state a vanished object already produces, on the caller's own
-- message, moderatable like nuisance text.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_messages
  ADD COLUMN image_stored_at timestamptz,
  -- Only an image message can be marked stored. Text rows keep NULL forever,
  -- and the text-XOR-image CHECK from 00228 stands untouched beside this.
  ADD CONSTRAINT chk_chat_messages_stored_implies_image CHECK (
    image_stored_at IS NULL OR image_width IS NOT NULL
  );

COMMENT ON COLUMN public.chat_messages.image_stored_at IS
  'When this image message''s object finished landing in the chat-images '
  'bucket — NULL while the bytes are still in flight (or were lost: an upload '
  'failure hides the row and never sets this). Written once, by '
  'mark_chat_image_stored, after the storage write returns; MONOTONE — nothing '
  'ever clears it, because the object is upsert:false and never deleted. The '
  'flag''s realtime UPDATE is what tells every subscriber the picture is '
  'fetchable, so clients render and fetch an image only when this is set — '
  'which is what closes the row-before-bytes race by construction. NULL on a '
  'text message, enforced by chk_chat_messages_stored_implies_image.';

-- The backfill (see header): every pre-existing image row is stored or a
-- swept tombstone, and a NULL here would blank it for good under the new
-- client gate.
UPDATE public.chat_messages
   SET image_stored_at = created_at
 WHERE image_width IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. mark_chat_image_stored
-- ---------------------------------------------------------------------------
--
-- Called by the upload route on the UPLOADER'S OWN client, immediately after
-- the storage write returns — the same client the insert ran on, keeping
-- "the guarded RPCs are the only writers to chat_messages" a true sentence.
--
-- OWNERSHIP IS THE WHOLE GUARD — no membership check and NO LOCK CHECK,
-- deliberately, and for one shared reason: this is the COMPLETION of a write
-- that send_chat_image_message already authorized moments ago, not a new act.
-- A lock landing mid-upload, or a family member's read window closing
-- mid-upload, must not be able to strand a legitimately sent picture as
-- permanently blank — the same reasoning that keeps the lock check out of
-- hide_chat_message's own-message path.
--
-- NO HIDDEN CHECK either: a moderator hiding the picture while its bytes are
-- still landing must not strand the flag, because the moderator's own dimmed
-- original needs it to fetch. The two UPDATEs touch disjoint columns and both
-- survive, in either order.

CREATE FUNCTION public.mark_chat_image_stored(p_id uuid)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_sender_id uuid;
  v_is_image  boolean;
  v_stored_at timestamptz;
BEGIN
  SELECT m.sender_id, m.image_width IS NOT NULL
    INTO v_sender_id, v_is_image
    FROM public.chat_messages m
   WHERE m.id = p_id;

  -- A message that does not exist and one somebody else sent answer
  -- IDENTICALLY, exactly as edit_chat_message refuses: the caller has no
  -- right to learn which it was, so this cannot be an oracle for message ids.
  IF v_sender_id IS NULL OR v_sender_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_image THEN
    RAISE EXCEPTION 'That message has no image to mark as stored'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent by COALESCE: the first call stamps, any repeat returns the
  -- standing stamp untouched — the write side of the column's monotonicity.
  UPDATE public.chat_messages
     SET image_stored_at = COALESCE(image_stored_at, now())
   WHERE id = p_id
  RETURNING chat_messages.image_stored_at INTO v_stored_at;

  RETURN v_stored_at;
END;
$$;

COMMENT ON FUNCTION public.mark_chat_image_stored(uuid) IS
  'Record that the caller''s OWN image message''s object has landed, stamping '
  'image_stored_at (idempotently — a standing stamp is returned, never moved). '
  'Called by the upload route on the uploader''s own client the moment the '
  'storage write returns; the resulting realtime UPDATE is the event that '
  'tells every subscriber the picture is fetchable. Ownership is the whole '
  'guard: no membership, lock or hidden check, because this completes a send '
  'that send_chat_image_message already authorized, and none of those landing '
  'mid-upload may strand a legitimate picture as permanently blank. A missing '
  'row and somebody else''s row are refused identically with 42501; a text '
  'message with check_violation. Returns image_stored_at.';

REVOKE EXECUTE ON FUNCTION public.mark_chat_image_stored(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_chat_image_stored(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_image_stored(uuid) TO service_role;
