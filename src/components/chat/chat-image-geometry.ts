import { sessionThumbnailWidth } from "@/components/session-feed/session-photo-geometry";

/**
 * How tall a chat thumbnail is drawn.
 *
 * Shorter than a session photo's, because a chat log is a column of many small
 * things and a picture at report scale would be the only thing on screen. The
 * *arithmetic* is the session gallery's — shared height, natural width, wrap,
 * every box computed from stored dimensions and nothing measured — so this
 * module supplies the height and borrows the function rather than restating the
 * ratio clamp and its degenerate-input guard a second time.
 */
export const CHAT_IMAGE_THUMB_HEIGHT = 112;

/** The width a chat thumbnail's box takes, from the stored dimensions. */
export function chatThumbnailWidth(width: number, height: number): number {
  return sessionThumbnailWidth(width, height, CHAT_IMAGE_THUMB_HEIGHT);
}
