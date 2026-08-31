import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SESSION_IMAGES_BUCKET,
  sessionImageObjectName,
} from "@/lib/images/session-image-url";
import {
  addSessionImageFields,
  addSessionImageResponse,
  SESSION_PHOTO_CAP,
  SESSION_PHOTO_CAP_REACHED_SQLSTATE,
  SESSION_PHOTO_MAX_BYTES,
  type AddSessionImageFields,
} from "@/services/gedu-sessions/gedu-sessions.contracts";

const ROUTE_LABEL = "/api/gedu/sessions/images";

/**
 * A year, and safe by construction: the object is named by a `gen_random_uuid()`
 * primary key and uploaded with `upsert: false`, so the bytes at a given URL can
 * never change. The same figure the product catalogue uses, for the same reason.
 */
const IMMUTABLE_CACHE_CONTROL = "31536000";

/** JPEG's start-of-image marker, followed by the first segment's own marker. */
const JPEG_SOI = [0xff, 0xd8, 0xff];

/**
 * POST /api/gedu/sessions/images — attach one photo to a session's report.
 *
 * Multipart: the group id, the session date, the claimed pixel dimensions, and
 * one already-normalized JPEG. The browser has decoded, downscaled and
 * re-encoded it before it got here, which is what strips EXIF/GPS, turns any
 * accepted input format into the one format the report email can render
 * everywhere, and keeps the body far under the platform's ~4.5 MB function
 * limit.
 *
 * **This route verifies; it never rescues.** A magic-byte sniff and a byte cap,
 * and anything non-conforming is refused with a stable code the UI translates —
 * that is what makes "the bucket can only contain a conforming JPEG" a property
 * of the system rather than a hope, because this route is the bucket's only
 * writer. There is no server-side re-encode and no SOF parser: the first is more
 * expensive than the refusal and could not decode HEIC anyway, and the second
 * would defend a mis-sized layout box against an already-assigned staff member
 * with hand-rolled binary parsing.
 *
 * **The RPC's assignment guard is the real authorization boundary; the role gate
 * below is the coarse filter in front of it.** The insert runs on the CALLER'S
 * OWN client, exactly as every other session write does, and refuses anyone who
 * is neither an admin nor a gedu assigned to this group — so the route never has
 * to re-derive who teaches what. What the gate adds is that a customer or a
 * gamer is turned away before a file is read at all.
 *
 * **Row first, then object, and the row does not survive a failed upload.** This
 * deliberately inverts the product catalogue's order (object first, orphan
 * tolerated): there an object is content-addressed and an orphan is harmless,
 * while here a row whose object never landed is a broken image on the staff
 * card and in every mail sent afterwards. So a failed upload is compensated by
 * deleting the row. If the compensation ALSO fails, that is logged loudly and
 * nothing else happens — the surviving row renders as a broken thumbnail and the
 * ordinary remove control is its repair.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["gedu", "admin"],
  response: addSessionImageResponse,

  handler: async ({ request, supabase }) => {
    const upload = await readSessionImageUpload(request);

    // --- 1. The row, on the caller's own client ----------------------------
    //
    // The guard inside it is the authorization. It also materializes the
    // session row if this is the first thing ever recorded against that date,
    // counts under the row's lock — which is what stops two tabs overshooting
    // the cap — and hands back the id the object is about to be named by.
    const { data: imageId, error } = await supabase.rpc(
      "add_group_session_image",
      {
        p_group_id: upload.fields.groupId,
        p_session_date: upload.fields.sessionDate,
        p_width: upload.fields.width,
        p_height: upload.fields.height,
        // The cap travels from the contracts constant rather than living in
        // SQL, which is what makes raising it a one-line change.
        p_max_images: SESSION_PHOTO_CAP,
      },
    );

    if (error) throw attachFailure(error);
    if (typeof imageId !== "string") {
      throw new ApiError(
        "add_group_session_image returned no id",
        500,
        "uploadFailed",
      );
    }

    // --- 2. The object, on the service-role client -------------------------
    //
    // The bucket carries no policies at all — the unguessable name IS the
    // access control — so storage is the admin client's, exactly as it is for
    // the product catalogue. `upsert: false` because a fresh UUID can only
    // collide with itself.
    const { error: uploadError } = await createAdminClient()
      .storage.from(SESSION_IMAGES_BUCKET)
      .upload(sessionImageObjectName(imageId), upload.file, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });

    if (uploadError) {
      console.error(
        `[${ROUTE_LABEL}] storage upload failed for image ${imageId}:`,
        uploadError,
      );
      // Compensation, on the same client the insert ran on: the guard that
      // admitted the insert admits this too.
      const { error: rollbackError } = await supabase.rpc(
        "delete_group_session_image",
        { p_image_id: imageId },
      );
      if (rollbackError) {
        // Loudly, and then stop. The row now names an object that does not
        // exist, which renders as a broken thumbnail on the staff card; the
        // remove control beside it is the repair, and there is no further
        // machinery for this.
        console.error(
          `[${ROUTE_LABEL}] compensation failed — row ${imageId} survives with no object:`,
          rollbackError,
        );
      }
      throw new ApiError(
        `the photo object could not be stored: ${uploadError.message}`,
        500,
        "uploadFailed",
      );
    }

    return { id: imageId };
  },
});

/** What one verified upload carries: the bytes, and the fields beside them. */
interface SessionImageUpload {
  file: File;
  fields: AddSessionImageFields;
}

/**
 * Read the multipart body and refuse anything the bucket must not hold.
 *
 * Throws an `ApiError` carrying one of the feature's stable codes rather than
 * returning a ready response, so every refusal on this route — the form's, the
 * RPC's and storage's alike — reaches the client through the one shape the UI
 * translates.
 */
async function readSessionImageUpload(
  request: Request,
): Promise<SessionImageUpload> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (cause) {
    throw new ApiError(
      `the request was not multipart/form-data: ${String(cause)}`,
      400,
      "uploadFailed",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("no 'file' field in the form", 400, "uploadFailed");
  }

  // Size before bytes: reading a 40 MB body into memory to look at three of
  // them is work the cap exists to avoid.
  if (file.size > SESSION_PHOTO_MAX_BYTES) {
    throw new ApiError(
      `the upload is ${file.size} bytes, over the ${SESSION_PHOTO_MAX_BYTES} cap`,
      413,
      "tooLarge",
    );
  }

  // The magic-byte sniff, and the whole of what "this is a JPEG" means here.
  // The declared content type is the client's claim about its own file and is
  // not consulted; the raw-HEIC side doors (a Files-app pick, a macOS
  // drag-drop) land exactly here.
  const head = new Uint8Array(await file.slice(0, JPEG_SOI.length).arrayBuffer());
  if (!JPEG_SOI.every((byte, index) => head[index] === byte)) {
    throw new ApiError(
      "the upload does not begin with a JPEG start-of-image marker",
      415,
      "notJpeg",
    );
  }

  // Parsed with `safeParse` rather than the shared body helper because that
  // helper answers a ready 400 whose message is its whole content, and this
  // route needs the failing FIELD: an out-of-range dimension is a refusal the
  // gedu is shown ("badDimensions"), while a malformed group id is a client bug
  // no copy of ours can help with.
  const parsed = addSessionImageFields.safeParse({
    groupId: formData.get("groupId"),
    sessionDate: formData.get("sessionDate"),
    width: formData.get("width"),
    height: formData.get("height"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue.path[0] ?? "");
    const isDimension = field === "width" || field === "height";
    throw new ApiError(
      `the form field '${field}' did not parse: ${issue.message}`,
      400,
      isDimension ? "badDimensions" : "uploadFailed",
    );
  }

  return { file, fields: parsed.data };
}

/**
 * Turn the insert RPC's refusal into the code the gedu is shown.
 *
 * By SQLSTATE, never by message: a reworded `RAISE` must not be able to
 * reclassify a refusal or silently change what a gedu is told.
 */
function attachFailure(error: { code?: string; message?: string }): ApiError {
  const message = `add_group_session_image refused (${error.code}): ${error.message}`;

  if (error.code === SESSION_PHOTO_CAP_REACHED_SQLSTATE) {
    // Reachable even though the editor hides its add control at the cap: two
    // tabs can race, and the RPC under the session lock is what actually
    // decides. Its copy is "remove one first", not "that did not work".
    return new ApiError(message, 409, "capReached");
  }
  if (error.code === "42501") {
    return new ApiError(message, 403, "notAllowed");
  }
  if (error.code === "23514") {
    // The route has already bounded the dimensions, so a check_violation here
    // means the session date is not one this group has scheduled (or the cap
    // parameter was absurd, which only a bug can produce). Neither is something
    // the editor can reach, so both take the generic answer.
    return new ApiError(message, 400, "uploadFailed");
  }
  return new ApiError(message, 500, "uploadFailed");
}
