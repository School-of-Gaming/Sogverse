import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { CHAT_IMAGE_MAX_BYTES } from "@/lib/constants/chat";
import { reencodeJpeg } from "@/lib/images/reencode-jpeg.server";
import { createAdminClient } from "@/lib/supabase/admin";
// The contracts module directly rather than the feature barrel: the barrel also
// carries the React Query hooks, which are a browser module this route has no
// use for and no business pulling into a serverless function.
import {
  CHAT_IMAGES_BUCKET,
  CHAT_LOCKED_SQLSTATE,
  chatImageUploadFields,
  chatImageUploadResponse,
  type ChatImageUploadFields,
} from "@/services/chat/chat.contracts";

const ROUTE_LABEL = "/api/chat/images";

/**
 * A year. The object is named by a message id that can never be reused and is
 * uploaded with `upsert: false`, so the bytes behind one name cannot change.
 * The same figure the session photos and the product catalogue use.
 */
const IMMUTABLE_CACHE_CONTROL = "31536000";

/** JPEG's start-of-image marker, followed by the first segment's own marker. */
const JPEG_SOI = [0xff, 0xd8, 0xff];

/**
 * POST /api/chat/images — send one picture into a chat channel.
 *
 * Multipart: the channel, the client-generated message id the optimistic echo
 * is already drawn under, an optional reply target, and one JPEG the browser
 * has already normalized.
 *
 * **The only API route the chat feature has**, and it exists for the object
 * rather than the row: storing bytes needs the service-role client a browser
 * must never hold. Everything else on this surface is a guarded RPC called
 * straight from the caller's own session.
 *
 * **The RPC on the caller's own client is the authorization; this route's gate
 * is only "somebody is signed in".** `send_chat_image_message` asks whether the
 * caller is a member of *this* channel and whether a moderator has locked them,
 * which is a question about a row this route would otherwise have to re-derive.
 * So the posture widens from the session-photo route's staff gate to any
 * authenticated caller — every participant in a scheduled room may send a
 * picture (decided: the room is authenticated and parent-linked throughout, the
 * EXIF strip below is server-enforced, and persistence makes everything
 * reviewable), and the membership question is answered where it lives.
 *
 * A policy-scoped read of the channel row sits in front of the re-encode, and it
 * is a **cost gate rather than a second boundary**: the decode is the expensive
 * step and nothing should spend it for a caller who is not in the channel. It
 * decides nothing the RPC does not decide again.
 *
 * **Verify, then re-encode.** The magic-byte sniff and the byte cap are what
 * make "the bucket holds a conforming JPEG under the cap" a property rather
 * than a hope, since this route is the bucket's only writer. The re-encode is
 * the half the session-photo route did not have and chat cannot do without: the
 * uploader here is any child or parent rather than an assigned member of staff,
 * so the EXIF/GPS strip has to survive a modified client, and the dimensions
 * the row stores have to be measured rather than claimed — a fabricated
 * `1 × 20000` would be a layout bomb in every viewer's log. The route
 * re-encodes; it does not rescue: an image whose true dimensions are
 * implausible is refused by the RPC's own bound.
 *
 * **Row first, then object, and a failed upload tombstones the row.** The order
 * is what keeps the guard in front of the bytes. The compensation is a *hide*
 * rather than a delete, and deliberately: the INSERT has already reached every
 * subscriber over realtime by the time storage answers, and messages are never
 * physically deleted — there is no DELETE for a subscriber to receive, so a
 * hard delete would leave every other client drawing a picture that will never
 * arrive. Hiding is an UPDATE, it replicates, and it turns the row into the
 * same tombstone any removed message leaves.
 */
export const POST = defineRoute({
  posture: "any-authenticated",
  reason:
    "any member of the channel may send a picture, and 'member of this channel' is a question about a row rather than about a role — the guarded send RPC on the caller's own client answers it, along with whether a moderator has locked them. A role gate here would be the wrong shape twice over: a gamer, a parent, a gedu and an admin are all equally entitled, and none of them is entitled in a channel they are not in. So the session is what this gate checks, and the RPC is the boundary",
  response: chatImageUploadResponse,

  handler: async ({ request, supabase }) => {
    const upload = await readChatImageUpload(request);

    // --- 1. The cost gate ----------------------------------------------------
    //
    // **A cheap read that stands in front of an expensive one.** The re-encode
    // below is the costly step — a decode plus an encode, bounded but not free —
    // and without this it runs for anybody signed in, on any channel id they
    // care to type. So the channel row is read first on the CALLER'S OWN client:
    // the SELECT policy answers through `is_chat_channel_member`, so a
    // non-member — or a family member past their channel's read window — gets
    // zero rows and is refused before a pixel is decoded.
    //
    // **This is not the authorization and must not be mistaken for one.** The
    // guarded `send_chat_image_message` RPC below is the boundary: it asks the
    // same membership question *and* whether a moderator has locked the caller,
    // and it is what the row's existence depends on. This only decides whether
    // the work is worth doing.
    const { data: channel, error: channelError } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("id", upload.fields.channelId)
      .maybeSingle();
    if (channelError) throw channelError;
    if (channel === null) {
      throw new ApiError(
        `no readable chat channel ${upload.fields.channelId} for this caller`,
        403,
      );
    }

    // --- 2. The re-encode ----------------------------------------------------
    //
    // Before the row, because the row stores what this measures. Orientation is
    // baked into the pixels and every scrap of metadata — EXIF, GPS, the
    // capture time — is dropped, which is the enforced half of the safety
    // guarantee: no client can post a picture of a child carrying coordinates.
    let stored;
    try {
      stored = await reencodeJpeg(upload.bytes);
    } catch (cause) {
      throw new ApiError(
        `the upload would not decode past its JPEG marker: ${String(cause)}`,
        415,
      );
    }

    // --- 3. The row, on the caller's own client ------------------------------
    const { data: createdAt, error } = await supabase.rpc(
      "send_chat_image_message",
      {
        p_id: upload.fields.id,
        p_channel_id: upload.fields.channelId,
        p_width: stored.width,
        p_height: stored.height,
        p_reply_to_message_id: upload.fields.replyToMessageId,
      },
    );

    // Only the lock is reshaped, and only because the client acts on it: a send
    // refused by a lock must offer no retry — the lock's own realtime arrival
    // is what disables the composer, and the refusal merely raced it — so the
    // code travels and the caller drops its echo rather than drawing a button
    // that cannot work. Every other refusal is rethrown untouched for the
    // shared error table to map: the membership guard's 42501 to a 403, an
    // implausible dimension or an unreplyable target's check violation to a
    // 400, a reused id to a 409.
    if (error?.code === CHAT_LOCKED_SQLSTATE) {
      throw new ApiError(
        `send_chat_image_message refused: ${error.message}`,
        403,
        CHAT_LOCKED_SQLSTATE,
      );
    }
    if (error) throw error;
    if (typeof createdAt !== "string") {
      throw new ApiError("send_chat_image_message returned no stamp", 500);
    }

    // --- 4. The object, on the service-role client ---------------------------
    //
    // The bucket is private and its one policy grants SELECT alone, so a write
    // has to bypass RLS — which is the whole of what the admin client is doing
    // here. The object's name IS the message id, so no path is stored and
    // `upsert: false` can only ever collide with itself.
    const bucket = createAdminClient().storage.from(CHAT_IMAGES_BUCKET);
    const { error: uploadError } = await bucket.upload(
      upload.fields.id,
      stored.bytes,
      {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      },
    );

    if (uploadError) {
      console.error(
        `[${ROUTE_LABEL}] storage upload failed for message ${upload.fields.id}:`,
        uploadError,
      );
      // The object first, and best-effort: on the ordinary failure there is
      // nothing there to remove, but an upload that failed *after* its bytes
      // landed would leave one behind that no row names.
      const { error: sweepError } = await bucket.remove([upload.fields.id]);
      if (sweepError) {
        console.error(
          `[${ROUTE_LABEL}] post-failure object sweep failed for message ${upload.fields.id}:`,
          sweepError,
        );
      }
      // Then the row, on the same client the insert ran on — hiding one's own
      // message is the one write a lock leaves, so this compensation cannot
      // itself be refused by a lock that landed mid-upload.
      const { error: hideError } = await supabase.rpc("hide_chat_message", {
        p_id: upload.fields.id,
      });
      if (hideError) {
        // Loudly, and then stop. The row survives naming an object that does
        // not exist, which draws as the empty image box every viewer's renderer
        // already handles, and a moderator's remove control is its repair.
        console.error(
          `[${ROUTE_LABEL}] compensation failed — message ${upload.fields.id} survives with no object:`,
          hideError,
        );
      }
      throw new ApiError(
        `the image object could not be stored: ${uploadError.message}`,
        500,
      );
    }

    return {
      id: upload.fields.id,
      createdAt,
      width: stored.width,
      height: stored.height,
    };
  },
});

/** What one verified upload carries: the bytes, and the fields beside them. */
interface ChatImageUpload {
  bytes: Buffer;
  fields: ChatImageUploadFields;
}

/**
 * Read the multipart body and refuse anything the bucket must not hold.
 *
 * The refusals carry no stable codes, and that is a decision rather than an
 * omission: the chat surface answers a refused send with the failed bubble and
 * its retry, whatever went wrong, and the one refusal it genuinely treats
 * differently is a lock — which comes from the RPC, not from here.
 */
async function readChatImageUpload(request: Request): Promise<ChatImageUpload> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (cause) {
    throw new ApiError(
      `the request was not multipart/form-data: ${String(cause)}`,
      400,
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("no 'file' field in the form", 400);
  }

  // Size before bytes, and not to save memory: `formData()` above has already
  // buffered the whole body, and what bounds that is the platform's ~4.5 MB
  // request limit. The order is about the answer — an over-cap file gets the
  // same refusal whatever its first three bytes say.
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    throw new ApiError(
      `the upload is ${file.size} bytes, over the ${CHAT_IMAGE_MAX_BYTES} cap`,
      413,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The magic-byte sniff, and the whole of what "this is a JPEG" means here.
  // The declared content type is the client's claim about its own file and is
  // not consulted. It runs before the re-encode rather than being left to it:
  // sharp would happily decode a PNG or a WebP, and one format in the bucket is
  // a property worth keeping deliberately rather than by accident.
  if (!JPEG_SOI.every((byte, index) => bytes[index] === byte)) {
    throw new ApiError(
      "the upload does not begin with a JPEG start-of-image marker",
      415,
    );
  }

  const parsed = chatImageUploadFields.safeParse({
    id: formData.get("id"),
    channelId: formData.get("channelId"),
    // A form carries no nulls: an absent field is how "not a reply" is spelled,
    // and `undefined` is what the optional schema and the RPC both take for it.
    replyToMessageId: formData.get("replyToMessageId") ?? undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `the form field '${String(issue.path[0] ?? "")}' did not parse: ${issue.message}`,
      400,
    );
  }

  return { bytes, fields: parsed.data };
}
