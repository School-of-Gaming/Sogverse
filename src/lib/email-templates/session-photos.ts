import { DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { escapeHtml, groundFill } from "./utils";

/**
 * The session report's photo grid — the one block in this directory whose
 * content is pictures.
 *
 * **One photo per row, at every width.** It used to be two to a row, with an
 * odd tail spanning and a media query in the shell stacking the pairs on a
 * phone; both are gone. A pair splits the mail's content column in half, and a
 * half of a phone column is a picture nobody can see — while the pairs also
 * bought the shell a second reason to carry a media query, which is a rule a
 * client is entitled to drop. A single column is the same arrangement at every
 * width, needs nothing from the stylesheet, and gives a photograph all the room
 * the mail has.
 *
 * **It is still a module of its own rather than part of the template**, because
 * a picture's box is arithmetic with rules of its own and the template composes
 * documents. Nothing is exported to the shell any more: the stacking query's
 * class name, breakpoint and gutter went with the pairs, and the well's own
 * ground-following tone is one of the two the whole directory shares through
 * `groundFill()` — so this module names no selector of its own and the shell
 * imports nothing from it.
 *
 * **Every box is arithmetic from the stored dimensions, under a height budget —
 * never from the column it sits in.** A photo laid out at the card's full width
 * would reserve about 750px of nothing for a blocked portrait, which is
 * precisely the render this mail has to look good in: the report is what many
 * parents read, images are off by default in a large share of inboxes, and a
 * photo can also be deleted long after the mail was sent. So the shape is
 * decided before a byte of JPEG is fetched, painted as a toned well the moment
 * the mail opens, and the picture arrives inside a hole that was already the
 * right shape.
 *
 * The one thing that is *not* arithmetic any more is the picture's drawn width,
 * and that is the change: the `<img>` is fluid (`width:100%`, `height:auto`)
 * under a `max-width`, so a landscape photo fills whatever column the client
 * gives it instead of being frozen at a phone's. Mail has no `object-fit`, so a
 * fluid width is also what keeps the picture undistorted — the client derives
 * the height from the intrinsic ratio rather than from a number we rounded.
 */

/**
 * The tallest a photo may be drawn, and the column the reserved well is sized
 * for. The two numbers do different jobs and it is worth being exact about
 * which.
 *
 * **`PHOTO_MAX_HEIGHT` is the height budget, and it is what caps a portrait.**
 * Width alone would let a 9:16 photo take the column and reserve a screen and a
 * half of nothing when it is blocked. 400px is a rectangle a reader scrolls
 * past. It sets each photo's `max-width` too, as `cap × ratio`: a 16:9 lands at
 * 711px and so fills any column this mail has, a square stops at 400, a 9:16 at
 * 225.
 *
 * **`PHOTO_PHONE_COLUMN` is what the *well* is sized from, and it is the narrow
 * end on purpose.** The well is a table cell's `height`, which every client
 * treats as a minimum rather than as a fixed size, so the number to put in it
 * is the smallest correct one: the height the photo has at the phone's content
 * column — 360px, the mobile design floor, less the shell's two 16px gutters.
 * On a wider column a loaded landscape simply grows past it and the cell grows
 * with it; a *blocked* one leaves a well that is the phone's height and the
 * column's width, which is a shorter hole than the picture would have filled
 * and never a taller one. The alternative — sizing every well for the widest
 * column — reserves a hole bigger than the picture on every narrow render,
 * which is the failure this whole design is about.
 */
export const PHOTO_MAX_HEIGHT = 400;
export const PHOTO_PHONE_COLUMN = 328;

/** The vertical gap between one photo and the next. */
const PHOTO_ROW_GAP = 8;

/**
 * The well's tone: a step off whichever ground the shell has put it on.
 *
 * On a phone the content sits straight on the dark ground, so the well takes
 * the card's tone and reads as a rectangle; above the shell's breakpoint the
 * same well is inside the card and takes the darker ground instead. Both halves
 * come from the one table the whole directory shares, so the well is toned by
 * the same mechanism as the staff mail's quoted box and the outlined button
 * rather than by a rule of its own.
 */
const WELL_GROUND = groundFill("step");

/**
 * How far from square a stored pair may be and still be believed.
 *
 * Real photos never approach it — the client normalizes to a ~2048px longest
 * edge and the shapes in practice run 9:16 to 16:9 — but the table's CHECK
 * permits 4096×1, and a degenerate pair must not emit an absurd box into a mail
 * nobody can correct afterwards. The same limit the app's gallery uses.
 *
 * **It is a believability test, not a clamp, and that is a correction.** The
 * box used to be built from the ratio *clamped* to this limit, which quietly
 * produced the worst render available: the box was drawn at 4:1 while the
 * picture is fluid and draws itself at its true ratio, so a stored 1×4096 got a
 * 1px cap and a 4px well holding a 4096px-tall sliver — a hole nothing fills
 * and a picture nothing contains. A pair this far from square is not a photo we
 * can size; it takes the same square fallback as a pair that cannot make a
 * ratio at all, which reserves a sane rectangle and lets the picture sit in it.
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
 * The three numbers a photo's markup is built from, from its stored dimensions.
 *
 * `maxWidth` is how wide the picture may ever be drawn — the height budget
 * spent at this photo's own ratio, and never more than the stored width, since
 * upscaling a small JPEG only makes it soft. `phoneWidth` and `wellHeight` are
 * the box that same picture has at the phone's content column: the height the
 * reserved well states, and the pixel pair the markup carries for the one
 * engine that reads no CSS at all.
 *
 * **Nonsense in, a square out**, and "nonsense" covers two things. A zero, a
 * negative or a non-finite dimension cannot produce a ratio, and a `NaN`
 * reaching a `width` attribute is how a whole table collapses. A pair further
 * from square than `PHOTO_ASPECT_LIMIT` produces a ratio nothing sensible can
 * be built from either — see that constant for why it is a believability test
 * rather than a clamp. The route and a CHECK both refuse the first kind, so
 * that branch should be unreachable; it exists because the cost of being wrong
 * about it is a mail that cannot be resent.
 */
export function sessionPhotoBox(
  width: number,
  height: number,
): { maxWidth: number; phoneWidth: number; wellHeight: number } {
  const ratio = width / height;
  const usable =
    Number.isFinite(ratio) &&
    width > 0 &&
    height > 0 &&
    ratio >= 1 / PHOTO_ASPECT_LIMIT &&
    ratio <= PHOTO_ASPECT_LIMIT;
  if (!usable) {
    return {
      maxWidth: PHOTO_MAX_HEIGHT,
      phoneWidth: PHOTO_PHONE_COLUMN,
      wellHeight: PHOTO_PHONE_COLUMN,
    };
  }
  const maxWidth = Math.max(1, Math.round(Math.min(PHOTO_MAX_HEIGHT * ratio, width)));
  const phoneWidth = Math.min(PHOTO_PHONE_COLUMN, maxWidth);
  return {
    maxWidth,
    phoneWidth,
    wellHeight: Math.max(1, Math.min(PHOTO_MAX_HEIGHT, Math.round(phoneWidth / ratio))),
  };
}

/**
 * One photo: a table capped at that picture's own maximum width, painted as a
 * toned well, with a fluid picture on top of it.
 *
 * **The well is the point, and it is a cell rather than a background on the
 * image.** A cell paints whether the `<img>` is blocked, deleted, still in
 * flight, or stripped out of the document altogether, and it is the same
 * rectangle in all four cases — while an `<img>` a client removed takes its own
 * background with it. Its fill is declared twice, as everything in this
 * directory that depends on a background is, and its radius is the app's — the
 * picture carries the same one, so the loaded and the blocked render have
 * identical corners in a client that rounds them and identical square ones in a
 * client that does not.
 *
 * The fill is a step off whichever ground the shell has put the well on — see
 * `WELL_GROUND` above.
 *
 * **The pixel `width` and `height` on the picture are for the one engine that
 * reads no CSS, and they are the phone's box on purpose.** Outlook on Windows
 * renders through Word, which honours a `width="100%"` attribute literally and
 * ignores `max-width` on both the table and the image — so a fluid picture with
 * no pixel pair beside it arrives there at the full column whatever its shape,
 * which for a 1080×1920 portrait is a metre of tower and for a 100×60 thumbnail
 * is an upscale. Stating the phone box as attributes gives that engine exactly
 * the layout the shell already promises it: no card, one column, the picture at
 * the size a phone would draw it. Every CSS-capable client overrides both with
 * the inline `width:100%;height:auto;max-width`, so nothing else sees them.
 *
 * The height is stated as an attribute *and* in the style, because a client
 * honours one or the other and either reserves the same box before anything is
 * fetched. It is a minimum in both, which is what makes one number serve two
 * column widths: a loaded picture on a desktop column is taller than the phone
 * height this well states, and the cell grows to it. It also means the blocked
 * render's `<img>` box and the well behind it are the same rectangle rather
 * than two.
 *
 * `alt` is empty on purpose. There is nothing true to write in it: nobody
 * captions these, the file name is a UUID, and a row of "Session photo"
 * repeated five times is noise in a blocked render and worse in a screen
 * reader. The sentence above the grid is what names what these are.
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
  return `<table role="presentation" width="${box.phoneWidth}" cellpadding="0" cellspacing="0" style="margin:0 auto;width:100%;max-width:${box.maxWidth}px;">
            <tr>
              <td class="${WELL_GROUND.className}" height="${box.wellHeight}" align="center" valign="middle" style="${WELL_GROUND.fill}border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.md};height:${box.wellHeight}px;font-size:0;line-height:0;">
                <img src="${src}" width="${box.phoneWidth}" height="${box.wellHeight}" alt="" style="display:block;width:100%;height:auto;max-width:${box.maxWidth}px;border:0;outline:none;text-decoration:none;border-radius:${RADIUS.md};" />
              </td>
            </tr>
          </table>`;
}

/**
 * Every photo on a session, one to a row.
 *
 * **One column at every width, and it is the same table in a phone and in a
 * desktop client.** The pairs this replaced were half a column each, which on
 * the mail's own mobile-first shell is a thumbnail of a child's build; they also
 * bought the shell a second reason to carry a media query, and a layout that
 * depends on a stylesheet is a layout two of the clients we care about do not
 * have. What was given up is the denser desktop grid — genuinely nicer at 700px,
 * and not worth a rule that has to be true in a client that ignores it. The odd
 * count's spanning tail went with the pairs: with one column there is no empty
 * half for a last photo to sit beside.
 *
 * The rows are separated by padding on the cell rather than by `cellspacing`,
 * because `cellspacing` puts the same gap around the outside of the table as
 * between its rows, and the space under the last photo belongs to the section
 * rather than to the grid.
 */
export function sessionPhotoGrid(photos: readonly SessionReportPhoto[]): string {
  if (photos.length === 0) return "";
  const rows = photos.map((photo, index) => {
    const gap = index === photos.length - 1 ? "" : `padding-bottom:${PHOTO_ROW_GAP}px;`;
    return `<tr><td align="center" valign="top" style="${gap}">${photoWell(photo)}</td></tr>`;
  });
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${rows.join("\n      ")}
    </table>`;
}
