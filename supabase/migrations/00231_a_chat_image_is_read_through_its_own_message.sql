-- A chat image is read through its own message.
--
-- The storage half of chat images: one PRIVATE bucket, and one SELECT policy on
-- storage.objects that is the whole read boundary for the bytes.
--
-- WHY PRIVATE, WHERE session-images IS PUBLIC-UNLISTED
--
-- The session-images bucket is public because report *emails* must fetch a
-- photo with a bare GET — no cookies, no place to type a code — so possession
-- of an unguessable URL is its whole security model. Chat has no email
-- consumer, so it inherits none of that: the bucket is private, every read is a
-- signed URL the viewer mints for themselves, and minting one requires SELECT
-- on the object under storage RLS. That single fact is what lets one policy be
-- the entire boundary — membership, the family time bound and the hidden state
-- all ride on it, because they all ride on `is_chat_channel_member`.
--
-- Two consequences, bought together and on purpose: no chat image is shareable
-- outside the platform beyond one URL's bounded lifetime, and hiding a message
-- RETRACTS its picture — fresh mints are refused for everyone but a moderator
-- the moment `hidden_at` is set, while the bytes stay for staff review. There
-- is no storage action in the hide path at all; the policy reads `hidden_at`
-- live.
--
-- THE OBJECT'S NAME IS THE MESSAGE ROW'S ID, AND THAT IS THE JOIN
--
-- The session-images pattern — the row's primary key IS the object name, so
-- there is no path column to keep in step — with the extension dropped, because
-- a private object is fetched through a signed URL that carries its own
-- content type and nothing reads the name for a file suffix. So the policy
-- resolves an object back to its message by that id, and the message is what
-- knows which channel it is in.
--
-- The id is cast inside a CASE guarded by a uuid-shaped regex rather than cast
-- directly. Nothing in this bucket can be named anything else — the upload
-- route is its only writer — but AND is not short-circuiting in SQL, so a
-- direct `name::uuid` could raise on an object in ANOTHER bucket if the planner
-- evaluated it before the bucket test. CASE *does* guarantee its order, so a
-- name that is not a uuid yields NULL and matches no row instead of erroring
-- the whole query. The cast (rather than comparing `m.id::text = name`) is what
-- keeps the lookup on the primary key index: one history load mints up to 200
-- URLs in a batch, and each one evaluates this policy.
--
-- NO WRITE POLICY, DELIBERATELY
--
-- The upload route stores the object with the service-role client, which
-- bypasses RLS entirely, and nothing else ever writes here. So `authenticated`
-- gets SELECT through the policy below and no INSERT/UPDATE/DELETE policy
-- exists — a client-side upload attempt fails closed rather than being
-- something a later reader has to reason about.
--
-- THE SIZE LIMIT IS THE SESSION-PHOTO NUMBER
--
-- 3 MB — SESSION_PHOTO_MAX_BYTES, one set of image limits platform-wide. The
-- upload route enforces the same cap before it reads a byte, so this is the
-- backstop rather than the gate; the session-images bucket sets none because
-- its route was its only writer either way, and this one sets it because a
-- bucket a child's upload reaches deserves the belt as well as the braces.
--
-- Remember that `storage.buckets` rows and `storage.objects` policies never
-- appear in `schema.sql` and are invisible to the type generator — the
-- documented exception — so this file is where this bucket's current state
-- lives.

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-images', 'chat-images', false, 3145728)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The one policy
-- ---------------------------------------------------------------------------

CREATE POLICY chat_images_member_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1
        FROM public.chat_messages m
       WHERE m.id = CASE
                      WHEN objects.name ~
                           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN objects.name::uuid
                    END
         AND public.is_chat_channel_member(m.channel_id)
         -- A hidden message's picture is retracted: only a moderator may still
         -- mint a URL for it. An already-minted URL survives until it expires,
         -- which is the accepted edge — the same one the hidden-body wire
         -- exposure records for text.
         AND (
           m.hidden_at IS NULL
           OR public.is_chat_channel_moderator(m.channel_id)
         )
    )
  );
