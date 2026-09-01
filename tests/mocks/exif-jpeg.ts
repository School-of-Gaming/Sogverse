import sharp from "sharp";

/**
 * JPEG fixtures that carry the metadata an upload route has to strip, and the
 * one-line check that says whether any survived.
 *
 * **Built rather than committed as a binary.** A checked-in photo would be a
 * blob nobody can read in a diff, and the two things these tests care about —
 * that GPS tags went in, and that an orientation tag rotates the pixels — are
 * exactly what a builder can state in words. The fixture is tiny (a few dozen
 * pixels) because nothing here is about image quality.
 *
 * Shared by both upload routes' tests on purpose: the EXIF/GPS strip is one
 * server-side mechanism covering both, so one fixture proves it in both places
 * and neither test can quietly drift into checking something weaker.
 */

/** The copyright string the fixture carries, so a survivor is greppable. */
export const EXIF_FIXTURE_COPYRIGHT = "Sogverse GPS fixture";

/** Where the fixture claims it was taken. Helsinki, to the degree. */
export const EXIF_FIXTURE_GPS_LATITUDE = "60/1 10/1 0/1";

/** @see EXIF_FIXTURE_GPS_LATITUDE */
export const EXIF_FIXTURE_GPS_LONGITUDE = "24/1 56/1 0/1";

/**
 * When it claims to have been taken — and the one GPS field a test can look for
 * in the raw bytes.
 *
 * The coordinates themselves are EXIF *rationals*: pairs of integers written as
 * binary, so the string above is how the tag is authored and not how it is
 * stored, and grepping the file for it would fail on a fixture that really does
 * carry the location. `GPSDateStamp` is an ASCII field, so it survives into the
 * bytes verbatim and is the honest thing to assert on.
 */
export const EXIF_FIXTURE_GPS_DATE_STAMP = "2026:09:01";

/**
 * The fixture's pixel dimensions **as stored in the file** — before the
 * orientation tag is applied.
 *
 * The tag is `6` (rotate 90°), so a consumer that honours it sees these two
 * swapped. That swap is what makes the test's dimension assertion mean
 * something: a route that stored what the client claimed, or that re-encoded
 * without baking the orientation in, would answer with these numbers this way
 * round.
 */
export const EXIF_FIXTURE_ENCODED_WIDTH = 40;

/** @see EXIF_FIXTURE_ENCODED_WIDTH */
export const EXIF_FIXTURE_ENCODED_HEIGHT = 10;

/**
 * A JPEG carrying GPS coordinates, a copyright string and an orientation tag.
 *
 * What a phone photo of a session looks like in the one respect that matters: a
 * picture of a child that names where it was taken.
 */
export async function exifBearingJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: EXIF_FIXTURE_ENCODED_WIDTH,
      height: EXIF_FIXTURE_ENCODED_HEIGHT,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .withMetadata({
      // 6 — rotate 90° clockwise. `withMetadata` rather than `withExif` because
      // only the former writes an orientation a decoder acts on.
      orientation: 6,
      exif: {
        IFD0: { Copyright: EXIF_FIXTURE_COPYRIGHT },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: EXIF_FIXTURE_GPS_LATITUDE,
          GPSLongitudeRef: "E",
          GPSLongitude: EXIF_FIXTURE_GPS_LONGITUDE,
          GPSDateStamp: EXIF_FIXTURE_GPS_DATE_STAMP,
        },
      },
    })
    .jpeg()
    .toBuffer();
}

/** A plain JPEG with no metadata at all, at whatever size a case wants. */
export async function plainJpeg(width = 24, height = 16): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 90, b: 160 } },
  })
    .jpeg()
    .toBuffer();
}

/**
 * Whether a JPEG carries an EXIF block at all.
 *
 * A raw byte scan for the APP1 segment's own `Exif\0\0` header rather than a
 * question put to an image library: the claim being tested is about the bytes
 * that were stored, and asking the same library that wrote them whether it can
 * still find its own metadata is a weaker question than whether the marker is
 * in there.
 */
export function carriesExif(bytes: Uint8Array): boolean {
  return Buffer.from(bytes).includes(Buffer.from("Exif\0\0", "latin1"));
}

/** Whether a string appears anywhere in the bytes, tag structure aside. */
export function containsText(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(needle, "latin1"));
}
