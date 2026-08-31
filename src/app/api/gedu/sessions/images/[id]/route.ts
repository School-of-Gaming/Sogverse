import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SESSION_IMAGES_BUCKET,
  sessionImageObjectName,
} from "@/lib/images/session-image-url";
import { deleteSessionImageParams } from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * DELETE /api/gedu/sessions/images/[id] — remove one photo from a report.
 *
 * **The RPCs' guard is the real authorization boundary; the role gate below is
 * the coarse filter in front of it.** Both RPCs run on the caller's own client
 * and take the photo id alone — the group is resolved from the image's own
 * session row, and that resolution IS the second half of the gate. A photo
 * belonging to another group and one belonging to nothing are refused
 * identically, so this cannot be used as an oracle for real photo ids, and
 * nothing here may weaken that by looking the row up first to say which it was.
 *
 * Any gedu assigned to the group may remove any photo on it, matching how the
 * report itself is edited under the last-editor model. There is no per-photo
 * ownership; `created_by` is safeguarding audit and gates nothing.
 *
 * **The OBJECT goes first and the row second, and that order is the feature's
 * one requirement about failure.** A removal that did not remove the picture has
 * to be visible, with the photo still on the card so the gedu can try again. Row
 * first cannot offer that: the row is what every surface reads, so taking it out
 * removes the tile — and with it the retry — while the object may still be
 * sitting in a public bucket, which is the one thing removal exists to prevent.
 * Deleting the object is the kill switch for every emailed copy of the URL, so
 * it is the half that must not be skipped when it is merely inconvenient.
 *
 * Object first means the row delete is no longer what proves the caller may do
 * this, so authorization moves in front of the storage call:
 *
 * 1. `assert_can_delete_session_image` on the USER'S client — mutates nothing,
 *    and refuses exactly as the delete RPC would. The admin client below never
 *    acts for a caller whose right to this photo has not been established.
 * 2. The object, on the admin client and through the Storage API — never SQL, a
 *    SQL delete of `storage.objects` orphans the backing file. A failure here
 *    answers `removeFailed` and leaves the row alone: the tile stays, the photo
 *    is genuinely still there, and pressing remove again is a real retry.
 * 3. The row, on the user's client. Its own guard runs again on the actual
 *    delete — the check in step 1 does not replace it.
 *
 * **The TOCTOU window between the check and the delete widens nothing, but it is
 * not free.** No authorization is gained inside it: step 3 re-derives the caller
 * from `auth.uid()` exactly as step 1 did, so an assignment lost mid-request
 * makes the row delete fail rather than succeed. What the window costs is the
 * *report* of that failure. Step 3's 42501 is deliberately mapped to 204 — see
 * below — and a revocation and a concurrent delete answer with the same
 * SQLSTATE, by design, so there is no oracle-free way to tell them apart. The
 * mapping therefore accepts reading a mid-request revocation as a race the
 * caller has already won.
 *
 * **What that costs, when it happens:** the object is gone, the row survives,
 * and the gedu is told the removal succeeded — so the client drops the staged
 * removal and the next refetch brings the row back as a tile whose picture will
 * not load. It is the same broken-tile state step 3's *other* failure produces,
 * and it has the same repair: pressing remove again clears the row, because step
 * 2 treats an already-missing object as removed. Losing an assignment in the
 * seconds between two RPCs of one request is rare enough, and the repair cheap
 * enough, that this is preferred to the alternative — reporting every concurrent
 * delete as a failure, which is the common case of the two and would leave a
 * gedu retrying a removal that has already fully happened.
 *
 * **A retry of a photo whose object is already gone still clears it**, which is
 * what makes the surviving-row case self-repairing rather than permanent.
 * Verified against the live Storage API (2026-08-31): `remove()` answers
 * `{ data: [], error: null }` for a name that is not in the bucket — a missing
 * object is a successful delete, not a 404 — so step 2 passes and step 3 takes
 * the row out.
 */
export const DELETE = defineRoute({
  posture: "role-gated",
  roles: ["gedu", "admin"],
  // Removing a photo of a child from a report is a trust boundary, and it is
  // the destructive half of the pair — so it carries the same gate the report
  // mail does. Group assignment already implies an admin certified the
  // educator, so this declares the posture rather than narrowing who gets
  // through; the gate applies the certification test to a caller whose role is
  // `gedu` alone, so the admin above is unaffected.
  requireCertifiedGedu: true,
  params: deleteSessionImageParams,

  handler: async ({ supabase, params }) => {
    // --- 1. Authorization, mutating nothing --------------------------------
    const { error: guardError } = await supabase.rpc(
      "assert_can_delete_session_image",
      { p_image_id: params.id },
    );

    if (guardError) {
      const message = `assert_can_delete_session_image refused (${guardError.code}): ${guardError.message}`;
      // By SQLSTATE, never by message. 42501 covers both "not your group" and
      // "no such photo", deliberately indistinguishable.
      if (guardError.code === "42501") {
        throw new ApiError(message, 403, "notAllowed");
      }
      // Nothing was touched, so this is a removal that did not happen: the same
      // answer the gedu gets for every other incomplete removal, and the photo
      // is still on the card to try again with.
      throw new ApiError(message, 500, "removeFailed");
    }

    // --- 2. The object, on the service-role client -------------------------
    //
    // The bucket carries no policies at all — the unguessable name IS the
    // access control — so storage is the admin client's, exactly as it is for
    // the upload. Through the Storage API and never SQL: a SQL delete of
    // `storage.objects` orphans the backing file.
    const { error: objectError } = await createAdminClient()
      .storage.from(SESSION_IMAGES_BUCKET)
      .remove([sessionImageObjectName(params.id)]);

    if (objectError) {
      // The row is deliberately untouched. The photo is still listed, still
      // fetchable, and still removable — which is the whole point of doing this
      // half first — so the answer is an error the gedu can see and act on
      // rather than a 204 that claims a removal nobody performed.
      throw new ApiError(
        `the object for image ${params.id} could not be removed: ${objectError.message}`,
        502,
        "removeFailed",
      );
    }

    // --- 3. The row, on the caller's own client ----------------------------
    const { error: rowError } = await supabase.rpc(
      "delete_group_session_image",
      { p_image_id: params.id },
    );

    if (rowError) {
      if (rowError.code === "42501") {
        // The check a moment ago said this caller may remove this photo, so a
        // refusal now is read as the ROW being gone: the delete RPC answers
        // 42501 for a photo id that belongs to nothing, deliberately
        // indistinguishably from one belonging to another group. A concurrent
        // remove won the race, and between them the caller's intent is fully
        // served — object gone, row gone — so this is a success, not a refusal
        // to report. It is a *reading*, not a deduction: a caller whose
        // assignment was revoked inside this request answers 42501 too, and is
        // told the same thing. See the TOCTOU note above for why that trade is
        // taken and what it leaves on screen.
        return undefined;
      }
      // The object is gone and the row survives, so the card shows a tile whose
      // picture will not load. Answered as a failed removal, which is exactly
      // what it is: the tile's own remove control is the repair, and it works,
      // because step 2 treats an already-missing object as removed.
      throw new ApiError(
        `the object for image ${params.id} was removed but its row survives (${rowError.code}): ${rowError.message}`,
        500,
        "removeFailed",
      );
    }

    // 204. There is nothing to say: the id the caller sent is the id that is
    // gone, and the feed refetch is what redraws the strip.
    return undefined;
  },
});
