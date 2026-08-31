import { DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { escapeHtml, pinnedFill } from "./utils";

/**
 * The session report's photo grid — the one block in this directory whose
 * content is pictures.
 *
 * **It is a module of its own rather than part of the template**, because two
 * files have to agree about it: the report composes the grid, and the shell
 * carries the one rule that cannot be written inline (the media query that
 * stacks the pairs on a phone). The class name, the breakpoint and the gutter
 * are exported for exactly that reason, so the selector in the shell cannot
 * drift away from the markup it is written for. It is not in `blocks.ts` for
 * the same reason the report's ruled facts are not: one mail wants it, and a
 * shared block with one caller is a helper pretending to be a vocabulary.
 *
 * **Every box is arithmetic from the stored dimensions, under a height budget
 * as well as a width one — never the column's width.** A photo laid out at the
 * card's full width would reserve about 750px of nothing for a blocked
 * portrait, which is precisely the render this mail has to look good in: the
 * report is what many parents read, images are off by default in a large share
 * of inboxes, and a photo can also be deleted long after the mail was sent.
 * So the box is decided before a byte of JPEG is fetched, painted as a toned
 * well the moment the mail opens, and the picture arrives inside a hole that
 * was already the right shape. The same discipline the app's gallery follows,
 * for the same reason, with one difference: mail has no `object-fit`, so the
 * picture is stretched to its box rather than contained in it, and the box is
 * derived to a whole pixel from a clamped ratio so the stretch is never more
 * than a fraction of a percent.
 */

/** The class the shell's media query stacks. Emitted only from here. */
export const PHOTO_CELL_CLASS = "photo-cell";

/**
 * The gap between photos, as `cellspacing` — the one gutter Outlook has never
 * argued with, which is why the button row uses it too. The stacked cells
 * borrow the same number for their vertical padding, so one gap is one value.
 */
export const PHOTO_GUTTER = 8;

/**
 * How wide and how tall a photo's box may be.
 *
 * **The width is set by the narrowest render, not the widest.** Stacked on a
 * phone, a cell is the whole content column, and the smallest column any client
 * gives us is a 320px viewport less the shell's 20px gutters and the panel's
 * 32px padding — 216px. A box wider than that would push the mail's own table
 * past the card and hand the reader a horizontal scroll, which no amount of
 * desktop prettiness pays for. On a desktop card the cell is 236px, so a box
 * sits inside it with 20px to spare and is centred in it.
 *
 * **The height budget is what a portrait costs.** It binds for anything
 * narrower than 216/180 — a square lands at 180×180, a 9:16 photo at 101×180 —
 * while a 16:9 screenshot is limited by the width instead and comes out
 * 216×122. So the tallest thing a blocked mail reserves for one photo is 180px,
 * whatever shape it is.
 */
export const PHOTO_BOX = { maxWidth: 216, maxHeight: 180 } as const;

/**
 * Below this viewport width the pairs stack. It is arithmetic rather than a
 * round number: two cells plus the gutters between and around them fill the
 * content column, and at 560px each cell is exactly `PHOTO_BOX.maxWidth`, so
 * that is the last width at which a pair still fits.
 */
export const PHOTO_STACK_BREAKPOINT = 560;

/**
 * How far from square a box may get, either way.
 *
 * Real photos never approach it — the client normalizes to a ~2048px longest
 * edge and the shapes in practice run 9:16 to 16:9 — but the table's CHECK
 * permits 4096×1, and a degenerate pair must not emit an absurd width into a
 * mail nobody can correct afterwards. The same limit the app's gallery uses.
 */
const PHOTO_ASPECT_LIMIT = 4;

/**
 * One photo, as the mail needs it: a URL an email client can fetch with a bare
 * GET, and the dimensions the box is derived from.
 *
 * **The URL arrives composed, like every other URL in this directory.** A
 * builder never resolves one — the route derives it from the row id through the
 * session-image helper, and the testing tool points at committed demo art — so
 * this module stays a pure composer with no notion of a bucket.
 *
 * The shape is declared here rather than imported from the feature's contracts:
 * the two feed documents each carry their own image summary, and a mail is a
 * third reader that should not be coupled to either.
 */
export interface SessionReportPhoto {
  /** Absolute, unauthenticated URL — composed by the caller. */
  src: string;
  /** The stored pixel width of the JPEG. */
  width: number;
  /** The stored pixel height of the JPEG. */
  height: number;
}

/**
 * The box a photo is drawn in, from its stored dimensions.
 *
 * **Nonsense in, a square out.** A zero, a negative or a non-finite dimension
 * cannot produce a ratio, and a `NaN` reaching a `width` attribute is how a
 * whole table collapses. The route and a CHECK both refuse such a pair, so this
 * branch should be unreachable; it exists because the cost of being wrong about
 * that is a mail that cannot be resent.
 */
export function sessionPhotoBox(
  width: number,
  height: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: PHOTO_BOX.maxHeight, height: PHOTO_BOX.maxHeight };
  }
  const ratio = Math.min(
    Math.max(width / height, 1 / PHOTO_ASPECT_LIMIT),
    PHOTO_ASPECT_LIMIT,
  );
  // Fit the width first, then let the height budget take over for anything
  // squarer than the box itself.
  const boxHeight = Math.min(PHOTO_BOX.maxHeight, PHOTO_BOX.maxWidth / ratio);
  return {
    width: Math.max(1, Math.min(PHOTO_BOX.maxWidth, Math.round(boxHeight * ratio))),
    height: Math.max(1, Math.min(PHOTO_BOX.maxHeight, Math.round(boxHeight))),
  };
}

/**
 * One photo: a nested table sized to the box, painted as a toned well, with the
 * picture on top of it.
 *
 * **The well is the point, and it is a cell rather than a background on the
 * image.** A cell of exactly the box's size paints whether the `<img>` is
 * blocked, deleted, still in flight, or stripped out of the document
 * altogether, and it is the same rectangle in all four cases. Its fill is
 * declared twice, as everything in this directory that depends on a background
 * is, and its radius is the app's — the picture carries the same one, so the
 * loaded and the blocked render have identical corners in a client that rounds
 * them and identical square ones in a client that does not.
 *
 * `alt` is empty on purpose. There is nothing true to write in it: nobody
 * captions these, the file name is a UUID, and a row of "Session photo" repeated
 * five times is noise in a blocked render and worse in a screen reader. The
 * sentence above the grid is what names what these are.
 *
 * `border:0` and `text-decoration:none` kill the frame and underline Outlook and
 * Gmail draw around a missing image; `display:block` kills the baseline gap
 * under it, and the zeroed font metrics on the cell keep the well from being
 * taller than the picture it holds.
 */
function photoWell(photo: SessionReportPhoto): string {
  const box = sessionPhotoBox(photo.width, photo.height);
  // Escaped, unlike the app-generated hrefs this directory embeds raw: this is
  // the one URL here built around a value off a row, and escaping a
  // well-formed one changes nothing.
  const src = escapeHtml(photo.src);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td width="${box.width}" height="${box.height}" align="center" valign="middle" style="${pinnedFill(DARK_THEME.bg)}border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.md};width:${box.width}px;height:${box.height}px;font-size:0;line-height:0;">
                <img src="${src}" width="${box.width}" height="${box.height}" alt="" style="display:block;width:${box.width}px;height:${box.height}px;border:0;outline:none;text-decoration:none;border-radius:${RADIUS.md};" />
              </td>
            </tr>
          </table>`;
}

/** One cell of the grid. A lone last photo takes the whole row instead of half. */
function photoCell(photo: SessionReportPhoto, span: 1 | 2): string {
  const width = span === 2 ? "" : ` width="50%"`;
  const colspan = span === 2 ? ` colspan="2"` : "";
  return `<td class="${PHOTO_CELL_CLASS}"${width}${colspan} align="center" valign="top">${photoWell(photo)}</td>`;
}

/**
 * Every photo on a session, two to a row.
 *
 * **An odd count ends with the last photo spanning the row, centred**, rather
 * than beside an empty cell. An empty half is the one arrangement that reads as
 * a fault — a hole where a sixth photo was meant to be — and it is also the one
 * arrangement that gets worse as the mail gets wider. Spanning costs nothing:
 * the box is the same size either way (its width budget is set by the phone,
 * not by the cell), so the odd photo is simply centred over the full column and
 * a single-photo report is that same shape with one row.
 */
export function sessionPhotoGrid(photos: readonly SessionReportPhoto[]): string {
  if (photos.length === 0) return "";
  const rows: string[] = [];
  for (let index = 0; index < photos.length; index += 2) {
    // Sliced rather than indexed twice, so the tail row is decided by a length
    // the compiler can see rather than by a lookup it believes cannot miss.
    const pair = photos.slice(index, index + 2);
    rows.push(
      pair.length === 1
        ? `<tr>${photoCell(pair[0], 2)}</tr>`
        : `<tr>${photoCell(pair[0], 1)}${photoCell(pair[1], 1)}</tr>`,
    );
  }
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="${PHOTO_GUTTER}" style="margin:0 0 24px;">
      ${rows.join("\n      ")}
    </table>`;
}
