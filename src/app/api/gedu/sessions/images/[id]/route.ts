import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SESSION_IMAGES_BUCKET,
  sessionImageObjectName,
} from "@/lib/images/session-image-url";
import { deleteSessionImageParams } from "@/services/gedu-sessions/gedu-sessions.contracts";

const ROUTE_LABEL = "/api/gedu/sessions/images/[id]";

/**
 * DELETE /api/gedu/sessions/images/[id] — remove one photo from a report.
 *
 * **The RPC's guard is the real authorization boundary; the role gate below is
 * the coarse filter in front of it.** The delete runs on the caller's own
 * client and takes the photo id alone — the group is resolved from the image's
 * own session row, and that resolution IS the second half of the gate. A photo
 * belonging to another group and one belonging to nothing are refused
 * identically, so this cannot be used as an oracle for real photo ids, and
 * nothing here may weaken that by looking the row up first to say which it was.
 *
 * Any gedu assigned to the group may remove any photo on it, matching how the
 * report itself is edited under the last-editor model. There is no per-photo
 * ownership; `created_by` is safeguarding audit and gates nothing.
 *
 * **Row first, then the object, and through the Storage API — never SQL.** A
 * SQL delete of `storage.objects` orphans the backing file, which is a verified
 * Supabase behaviour. If the object delete fails it is logged and that is all:
 * the row is gone, so the URL is dead to the app, an already-emailed copy simply
 * stops loading, and the leftover bytes are recoverable by joining derived
 * object names against `storage.objects.name` — the same reconciliation the
 * product catalogue's orphans get. Deleting the object is the kill switch for
 * every emailed copy of the URL, which is why it is not skipped when it is
 * merely inconvenient.
 */
export const DELETE = defineRoute({
  posture: "role-gated",
  roles: ["gedu", "admin"],
  params: deleteSessionImageParams,

  handler: async ({ supabase, params }) => {
    const { error } = await supabase.rpc("delete_group_session_image", {
      p_image_id: params.id,
    });

    if (error) {
      const message = `delete_group_session_image refused (${error.code}): ${error.message}`;
      // By SQLSTATE, never by message. 42501 covers both "not your group" and
      // "no such photo", deliberately indistinguishable.
      if (error.code === "42501") {
        throw new ApiError(message, 403, "notAllowed");
      }
      throw new ApiError(message, 500, "uploadFailed");
    }

    const { error: objectError } = await createAdminClient()
      .storage.from(SESSION_IMAGES_BUCKET)
      .remove([sessionImageObjectName(params.id)]);

    if (objectError) {
      // Logged, and the request still succeeded: the row is what every surface
      // reads, and it is gone. Retrying here would be machinery for a state the
      // orphan join already covers.
      console.error(
        `[${ROUTE_LABEL}] the row for image ${params.id} was deleted but its object was not:`,
        objectError,
      );
    }

    // 204. There is nothing to say: the id the caller sent is the id that is
    // gone, and the feed refetch is what redraws the strip.
    return undefined;
  },
});
