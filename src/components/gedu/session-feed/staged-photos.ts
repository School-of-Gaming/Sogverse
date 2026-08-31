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
 * The stored photos still on the report **as the gedu has left it** — the run
 * the strip draws, with anything crossed out this session already gone.
 *
 * A staged removal takes its tile off the strip immediately, exactly as deleting
 * a paragraph takes it out of the draft: the removal is not stored yet, and
 * Cancel is what puts it back.
 */
export function keptPhotos(
  photos: readonly SessionPhoto[],
  staged: StagedSessionPhotos,
): readonly SessionPhoto[] {
  if (staged.removals.length === 0) return photos;
  return photos.filter((photo) => !staged.removals.includes(photo.id));
}

/**
 * How many photos this report would hold if the card were saved right now —
 * what the cap is measured against.
 *
 * Stored minus staged removals plus staged adds: the number a gedu can see on
 * the strip, which is the only number the affordances may be derived from.
 */
export function stagedPhotoCount(
  photos: readonly SessionPhoto[],
  staged: StagedSessionPhotos,
): number {
  return keptPhotos(photos, staged).length + staged.adds.length;
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
