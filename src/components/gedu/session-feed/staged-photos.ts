import type { SessionPhoto } from "@/components/session-feed";
import type { SessionPhotoErrorCode } from "@/services/gedu-sessions";

/**
 * The photo half of a session card's **draft** — what the gedu has picked and
 * what they have crossed out, held in the browser until Save.
 *
 * Photos used to attach the instant they were picked, which made them the one
 * thing on an open editor that was already stored while everything around it was
 * unsaved. That split is gone *(owner)*: the whole card edit lives in memory and
 * the backend is touched only by Save, so a photo is exactly as provisional as a
 * line of the write-up until the same button commits both.
 */

/**
 * One photo the browser has prepared and is holding.
 *
 * It carries its own **encoded** dimensions, which is what lets the tile be
 * drawn at the exact size its stored twin will occupy — the box is right from
 * the first frame, so nothing in the strip moves when the save lands.
 *
 * The blob is the normalized JPEG, ready to upload untouched; the object URL is
 * how it is drawn in the meantime. **The strip mints these and the feed owns
 * them** — a URL has to be revoked, and only the feed outlives the editor that
 * a staged photo has to survive.
 */
export interface StagedSessionPhoto {
  /** Local identity, stable for as long as the photo is staged. Never a stored id. */
  key: string;
  /** `URL.createObjectURL` of the normalized JPEG. Revoked when the entry is dropped. */
  url: string;
  /** The normalized JPEG itself — what Save uploads. */
  file: Blob;
  width: number;
  height: number;
}

/**
 * Everything one card's Save still has to do about photos: the pictures to
 * upload, and the stored ids to delete.
 *
 * Two lists rather than a rewritten photo array, because the two are separate
 * writes with separate failure modes — and because a stored photo the gedu has
 * *not* touched must never be re-sent.
 */
export interface StagedSessionPhotos {
  adds: readonly StagedSessionPhoto[];
  /** Stored ids marked for removal. The tiles are already off the strip. */
  removals: readonly string[];
}

/** A card with nothing staged — the resting state, and the shape a fresh editor opens on. */
export const NO_STAGED_PHOTOS: StagedSessionPhotos = { adds: [], removals: [] };

/**
 * What one card's save has **already done** this visit: the deletions that went
 * through, and the uploads that landed, as the stored rows they now are.
 *
 * This exists because the staged set above is emptied operation by operation as
 * the save runs — which is exactly what makes a second press retry the remainder
 * and nothing twice, and is also what leaves it unable to say what the strip
 * should draw. The `photos` the card renders from are a **prop**, and they do not
 * change until the feed refetches; so in the window between an operation landing
 * and that refetch arriving, the staged set alone would put the crossed-out tile
 * back on the strip, take the uploaded one off it, and derive the Add button's
 * cap arithmetic from neither number. The worst shape of it is the one a gedu is
 * actually staring at: a report at the cap, one photo crossed out and one picked,
 * the deletion landed and the upload refused — six tiles including the one they
 * removed, no Add button, and a failure line underneath.
 *
 * So the two halves are kept apart. `StagedSessionPhotos` is the **retry ledger**
 * — what is still owed — and this is the **render's memory** of what has landed.
 * Read together they are the arrangement the gedu left, and they go on being it
 * through a partial failure and until the next editor opens.
 *
 * **It cannot outlive its own truth.** Every id here is folded into a derivation
 * that the refetched props make a no-op: a removal filters an array the row has
 * already left, and an upload is skipped rather than drawn twice once the same id
 * arrives in `photos`. The record becomes invisible when the props catch up
 * rather than having to be cleared in time to avoid being wrong.
 */
export interface LandedSessionPhotos {
  /** Stored ids whose deletion has gone through. Their tiles stay off the strip. */
  removedIds: readonly string[];
  /**
   * The photos this save uploaded, as the stored rows they now are — the id the
   * route answered with, and the encoded dimensions the tile was already drawn
   * at, so nothing about the box changes when it stops being a local preview.
   * The blob behind each was let go the moment its upload landed, which is what
   * makes the stored id the only address left to draw it from.
   */
  added: readonly SessionPhoto[];
}

/** A card whose save has landed nothing — the resting state, and what a fresh editor opens on. */
export const NO_LANDED_PHOTOS: LandedSessionPhotos = {
  removedIds: [],
  added: [],
};

/**
 * The photos on the report **as the gedu has left it** — the run the strip
 * draws: what is stored, minus everything crossed out or already deleted, plus
 * everything this save has already uploaded.
 *
 * A staged removal takes its tile off the strip immediately, exactly as deleting
 * a paragraph takes it out of the draft: the removal is not stored yet, and
 * Cancel is what puts it back. A *landed* one keeps it off, for the window in
 * which the deletion is real but the props have not heard about it yet.
 *
 * **Uploaded photos join at the end of the run**, which is both where the stored
 * order will put them and where the layout's slack already sits — a tile that
 * arrives late there moves nothing already on screen. They are dropped rather
 * than appended once the same id turns up in `photos`, so the refetch replaces
 * this record silently instead of doubling it.
 */
export function keptPhotos(
  photos: readonly SessionPhoto[],
  staged: StagedSessionPhotos,
  landed: LandedSessionPhotos,
): readonly SessionPhoto[] {
  const gone = new Set([...staged.removals, ...landed.removedIds]);
  const stored =
    gone.size === 0 ? photos : photos.filter((photo) => !gone.has(photo.id));
  if (landed.added.length === 0) return stored;
  const already = new Set(stored.map((photo) => photo.id));
  return [...stored, ...landed.added.filter((photo) => !already.has(photo.id))];
}

/**
 * How many photos this report would hold if the card were saved right now —
 * what the cap is measured against.
 *
 * The kept run plus what is still staged to upload: the number a gedu can *see*
 * on the strip, which is the only number the affordances may be derived from.
 */
export function stagedPhotoCount(
  photos: readonly SessionPhoto[],
  staged: StagedSessionPhotos,
  landed: LandedSessionPhotos,
): number {
  return keptPhotos(photos, staged, landed).length + staged.adds.length;
}

/**
 * The staged photo state of one card, and the four things that change it.
 *
 * Bundled rather than threaded as six props because they travel together
 * through the feed's row and are meaningless apart: the state lives with the
 * save (see the feed's own note), and the strip is the surface that edits it.
 */
export interface SessionPhotoEditing {
  staged: StagedSessionPhotos;
  /**
   * What this card's save has already done — the other half of what the strip
   * draws. Required rather than optional because the pair is the derivation: a
   * caller that supplied only the staged half would render a strip that is
   * correct right up until the first operation lands.
   */
  landed: LandedSessionPhotos;
  /**
   * The refusal on screen, or `null` — from a pick the browser would not decode
   * *or* from a Save the route refused, since a gedu cares what to do next
   * rather than which side answered.
   */
  error: SessionPhotoErrorCode | null;
  /** Hold one normalized picture until Save. */
  onStageAdd: (photo: StagedSessionPhoto) => void;
  /** Let go of one staged picture and the bytes behind it. */
  onUnstageAdd: (key: string) => void;
  /** Cross out one stored photo. Nothing is deleted until Save. */
  onStageRemoval: (imageId: string) => void;
  /** Say what was refused, or clear the line. */
  onError: (code: SessionPhotoErrorCode | null) => void;
}
