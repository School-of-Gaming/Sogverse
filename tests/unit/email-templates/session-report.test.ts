import { describe, it, expect, beforeAll } from "vitest";
import {
  buildSessionReportEmail,
  sessionReportSubject,
} from "@/lib/email-templates/session-report";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import {
  PHOTO_MAX_HEIGHT,
  PHOTO_PHONE_COLUMN,
  PHOTO_WELL_CLASS,
  sessionPhotoBox,
  type SessionReportPhoto,
} from "@/lib/email-templates/session-photos";
import { BRAND, DARK_THEME, STATUS } from "@/lib/constants/colors";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const PRODUCT_URL = "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15";

const base = {
  gamerName: "Aino",
  geduName: "Marianne",
  productName: "Minecraft: Cozy Adventures",
  groupName: "Usvalaakso: Kettukallio",
  sessionDate: "Thursday, 20 August 2026",
  sessionTime: "16:30–18:00 EEST",
  reportMarkdown: "# **Lanterns over the Harbour**\n\nToday we welcomed a new member.\n\n## Next week\n\nMore building.",
  productUrl: PRODUCT_URL,
};

describe("buildSessionReportEmail", () => {
  it("names the gamer, the gedu, the product, the group, the date and the time", () => {
    const html = buildSessionReportEmail(t, "en", base);
    for (const value of [
      "Aino",
      "Marianne",
      "Minecraft: Cozy Adventures",
      "Usvalaakso: Kettukallio",
      "Thursday, 20 August 2026",
      "16:30–18:00 EEST",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("renders the report's markdown as headings and paragraphs", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toMatch(/<h1 [^>]*><strong>Lanterns over the Harbour<\/strong><\/h1>/);
    expect(html).toMatch(/<h2 [^>]*>Next week<\/h2>/);
    expect(html).toContain("Today we welcomed a new member.");
  });

  it("strips a link in the report down to its label", () => {
    const html = buildSessionReportEmail(t, "en", {
      ...base,
      reportMarkdown: "Read [the wiki](https://evil.example/page) first.",
    });
    expect(html).toContain("Read the wiki first.");
    expect(html).not.toContain("evil.example");
    // The only anchor in the mail is the My SOG button.
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("escapes HTML typed into the report", () => {
    const html = buildSessionReportEmail(t, "en", {
      ...base,
      reportMarkdown: "Tricky <img src=x onerror=alert(1)> text & more",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("text &amp; more");
  });

  it("escapes the facts the caller passes in", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, groupName: "A <b>&</b> B" });
    expect(html).toContain("A &lt;b&gt;&amp;&lt;/b&gt; B");
  });

  it("links the product's page in My SOG, where the reports live", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toContain(`href="${PRODUCT_URL}"`);
    expect(html).toContain("View in My SOG");
    expect(html).toContain("the earlier ones and the upcoming sessions");
  });

  /**
   * Gmail flips a button label's colour by luminance and theme; the label
   * carries a class the layout pins to one colour through the Gmail-only
   * background-clip rule. Both halves have to be present for it to work.
   */
  it("pins the button label's colour against Gmail's theme rewriting", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toMatch(/<a href="[^"]+" target="_blank" class="cta-on-brand"/);
    expect(html).toContain("u + .body .cta-on-brand");
  });

  it("keeps brand color out of the report body", () => {
    const html = buildSessionReportEmail(t, "en", base);
    // From the report's title to its last paragraph — the button below it is
    // brand-filled by design. Both ends must be found, or the slice is empty
    // and the assertion below passes on nothing.
    const from = html.indexOf("Lanterns over the Harbour");
    const to = html.indexOf("More building.");
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const body = html.slice(from, to);
    expect(body).not.toContain(BRAND.act);
    expect(body).not.toContain(BRAND.world);
  });
});

/**
 * The staff copy is the same mail with one thing added, and both halves of that
 * matter: the banner has to be there when the copy is asked for, and it has to
 * be absent from every family mail — a parent reading "this is a copy that went
 * to the group's families" would be worse than the confusion the banner exists
 * to end.
 */
describe("the staff copy's banner", () => {
  const LABEL = "Gedu and Admin copy";
  const IS_A_COPY = "This is a copy of the session report that went to the group";
  const PRIVACY = "Every family received their own separate email";

  it("opens the staff copy by saying what it is and what the families got", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, staffCopy: true });

    expect(html).toContain(LABEL);
    expect(html).toContain(IS_A_COPY);
    expect(html).toContain(PRIVACY);
  });

  it("says all of it above the intro, where the reader's alarm already is", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, staffCopy: true });

    // The gedu's name is in the intro sentence and nowhere else in the mail.
    const intro = html.indexOf("Marianne");
    expect(intro).toBeGreaterThan(0);
    expect(html.indexOf(LABEL)).toBeLessThan(intro);
    expect(html.indexOf(PRIVACY)).toBeLessThan(intro);
  });

  it("is absent from the mail a family receives", () => {
    for (const html of [
      buildSessionReportEmail(t, "en", base),
      buildSessionReportEmail(t, "en", { ...base, staffCopy: false }),
    ]) {
      expect(html).not.toContain(LABEL);
      expect(html).not.toContain(IS_A_COPY);
      expect(html).not.toContain(PRIVACY);
    }
  });

  /**
   * The flag's default is the family mail: an absent `staffCopy` and an explicit
   * `false` produce the identical document, byte for byte. That is what this
   * pins — two renders of the current builder against each other, not this
   * builder against the one that predated the flag, which no assertion here can
   * reach.
   */
  it("renders the same family mail whether the flag is absent or false", () => {
    expect(buildSessionReportEmail(t, "en", { ...base, staffCopy: false })).toBe(
      buildSessionReportEmail(t, "en", base),
    );
  });

  /**
   * The banner is the app's `Alert` in its `info` variant, not a treatment of
   * its own: no ground, a full border in the info hue, the label in that hue
   * and every sentence under it in ink. It carried a 3px brand-orange rule down
   * one edge before that, which is a shape the app has nowhere and which read
   * as a warning — so the brand colours are asserted *absent* here, not merely
   * relocated.
   */
  it("takes its prominence from the info border, not from coloured text", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, staffCopy: true });
    // The banner's own cell, from its opening tag to its close, so nothing the
    // shell around it emits can satisfy or break these.
    const start = html.lastIndexOf("<td ", html.indexOf(LABEL));
    const banner = html.slice(start, html.indexOf("</td>", start));

    // The Alert's full 1px border, in the status's own hue: with no ground
    // left, the edge is what brings the eye to the panel.
    expect(banner).toContain(`border:1px solid ${STATUS.info}`);
    expect(banner).not.toContain(`border:1px solid ${DARK_THEME.border}`);
    expect(banner).not.toContain("border-left:");
    // No ground of its own: a status colour is never a wash, so the panel sits
    // on the message panel it is already on.
    expect(banner).not.toContain("background-color:");
    expect(banner).not.toContain("background-image:");
    // No brand colour anywhere in it: the accent moved, it did not move over.
    expect(banner).not.toContain(BRAND.act);
    expect(banner).not.toContain(BRAND.world);
    // The label takes the status colour and every sentence under it stays ink,
    // which is the app's Alert under the label rule: colour on a label, never
    // on something the reader reads through.
    const colors = [
      ...banner.matchAll(/<p style="[^"]*color:(#[0-9a-fA-F]{6})/g),
    ].map((match) => match[1]);
    expect(colors[0]).toBe(STATUS.info);
    for (const color of colors.slice(1)) {
      expect(color).toBe(DARK_THEME.foreground);
    }
  });
});

/**
 * The photos, and the render that decides how they are built: none of them
 * loading.
 *
 * A parent reads this mail with images off — the default in a large share of
 * inboxes — or reads it a month later, after a photo was deleted and its URL
 * started 404ing. Neither is an edge case, so every assertion here is about the
 * mail that arrives with nothing fetched: a well whose height was known before
 * any byte of JPEG, painted, in the right place, whatever shape the picture is.
 *
 * The second thing under test is that the arrangement needs no stylesheet. One
 * photo per row is the layout at every width, so a client that drops the
 * shell's `<style>` block gets the same grid as one that keeps it.
 */
describe("the photos under the report", () => {
  const BUCKET = "https://xyz.supabase.co/storage/v1/object/public/session-images";

  /** The three shapes real photos come in, as the stored dimensions say. */
  const PHOTOS = {
    landscape: { src: `${BUCKET}/a.jpg`, width: 1600, height: 900 },
    portrait: { src: `${BUCKET}/b.jpg`, width: 900, height: 1600 },
    square: { src: `${BUCKET}/c.jpg`, width: 1200, height: 1200 },
  } as const satisfies Record<string, SessionReportPhoto>;

  const HEADING = "Photos from this session";

  function withPhotos(photos: SessionReportPhoto[], staffCopy = false): string {
    return buildSessionReportEmail(t, "en", { ...base, photos, staffCopy });
  }

  /**
   * Every `<img>` in the mail, as its src and the width cap on it. A photo is
   * fluid now — `width="100%"` on the tag, the arithmetic in `max-width` — so
   * the cap is the number this suite has to read, not a pixel width attribute.
   */
  function images(html: string): { src: string; maxWidth: number | null }[] {
    return [...html.matchAll(/<img src="([^"]*)"[^>]*>/g)].map((match) => ({
      src: match[1],
      maxWidth: Number(/max-width:(\d+)px/.exec(match[0])?.[1] ?? Number.NaN),
    })).map((image) => ({
      ...image,
      maxWidth: Number.isFinite(image.maxWidth) ? image.maxWidth : null,
    }));
  }

  /** The photos alone — the shell's brand mark is an image too. */
  function photoImages(html: string) {
    return images(html).filter((image) => image.src.startsWith(BUCKET));
  }

  it("renders every photo, in the order it was given them", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]);

    expect(html).toContain(HEADING);
    expect(photoImages(html).map((image) => image.src)).toEqual([
      PHOTOS.landscape.src,
      PHOTOS.portrait.src,
      PHOTOS.square.src,
    ]);
  });

  /**
   * The mail this template sent before photos existed is still the mail most
   * reports are. No heading, no empty grid, no space held open for something
   * that is not coming — and an absent array and an empty one mean the same.
   */
  it("leaves a photo-less report exactly as it was", () => {
    const none = buildSessionReportEmail(t, "en", base);

    expect(none).not.toContain(HEADING);
    expect(photoImages(none)).toEqual([]);
    expect(withPhotos([])).toBe(none);
  });

  /**
   * The picture takes the column it is given, and stops at the cap its own
   * ratio buys. A 16:9 is capped above any column this mail has, so it fills
   * one at every width; a 9:16 stops at 225px and never becomes a tower.
   */
  it("draws every photo fluid, under a cap derived from its own ratio", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]);

    for (const photo of [PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]) {
      const box = sessionPhotoBox(photo.width, photo.height);
      expect(html).toContain(`<img src="${photo.src}" width="100%"`);
      expect(html).toContain(`width:100%;height:auto;max-width:${box.maxWidth}px`);
      // The wrapping table is capped to the same number and centred, so a
      // photo narrower than the column is not stretched across it.
      expect(html).toContain(`margin:0 auto;width:100%;max-width:${box.maxWidth}px;`);
    }

    const cap = (photo: SessionReportPhoto) =>
      sessionPhotoBox(photo.width, photo.height).maxWidth;
    // 16:9 at a 400px cap is 711px — wider than the mail's own 560px column,
    // which is what "fills the column at any width" means in arithmetic.
    expect(cap(PHOTOS.landscape)).toBe(711);
    expect(cap(PHOTOS.portrait)).toBe(225);
    expect(cap(PHOTOS.square)).toBe(PHOTO_MAX_HEIGHT);
  });

  /**
   * The whole point of storing the dimensions: the well is a real rectangle
   * before a byte of JPEG is fetched, stated as an attribute *and* in the
   * style, so a client honouring either one holds the space.
   *
   * The height is the one the photo has at the phone's content column, because
   * a cell's height is a minimum: on a desktop column a loaded landscape grows
   * past it, and a blocked one leaves a hole shorter than the picture rather
   * than taller.
   */
  it("reserves a well before a byte of JPEG is fetched", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait]);

    for (const photo of [PHOTOS.landscape, PHOTOS.portrait]) {
      const box = sessionPhotoBox(photo.width, photo.height);
      expect(html).toContain(`height="${box.wellHeight}"`);
      expect(html).toContain(`height:${box.wellHeight}px;font-size:0;line-height:0;`);
    }

    // The arithmetic, spelled out: the phone column is 328px, so a 16:9 is
    // 185px tall there and a 9:16 hits the cap exactly.
    expect(sessionPhotoBox(1600, 900).wellHeight).toBe(185);
    expect(sessionPhotoBox(900, 1600).wellHeight).toBe(PHOTO_MAX_HEIGHT);
    expect(sessionPhotoBox(1200, 1200).wellHeight).toBe(PHOTO_PHONE_COLUMN);
  });

  /**
   * The requirement in one assertion: a blocked portrait must not reserve a
   * screen and a half of nothing. Both numbers stay budgeted whatever shape
   * the stored pair is, the degenerate ones included.
   */
  it("budgets a portrait's height instead of letting it fill the column", () => {
    for (const [width, height] of [
      [1600, 900],
      [1200, 1200],
      [900, 1600],
      [4096, 1],
      [1, 4096],
      [4000, 3000],
    ]) {
      const box = sessionPhotoBox(width, height);
      expect(box.wellHeight).toBeLessThanOrEqual(PHOTO_MAX_HEIGHT);
      expect(box.wellHeight).toBeGreaterThan(0);
      expect(box.maxWidth).toBeGreaterThan(0);
      // Never upscaled: a stored width is a ceiling of its own.
      expect(box.maxWidth).toBeLessThanOrEqual(width);
    }
  });

  /** A dimension that cannot make a ratio must not put NaN in an attribute. */
  it("falls back to a square rather than emitting a NaN box", () => {
    for (const [width, height] of [
      [0, 0],
      [-4, 3],
      [Number.NaN, 900],
    ]) {
      expect(sessionPhotoBox(width, height)).toEqual({
        maxWidth: PHOTO_MAX_HEIGHT,
        wellHeight: PHOTO_PHONE_COLUMN,
      });
    }
  });

  /**
   * One per row, at every width — no pairs, no spanning tail, and nothing for a
   * media query to stack. The arrangement is the same table in a client that
   * reads the shell's stylesheet and in one that drops it, which is the
   * property the pairs could not have.
   */
  it("gives every photo a row of its own, with no stylesheet to help", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]);

    expect(html).not.toContain('colspan="2"');
    expect(html).not.toContain('width="50%"');
    expect(html).not.toContain("photo-cell");

    const stripped = html.replace(/<style>[\s\S]*?<\/style>/g, "");
    for (const photo of [PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]) {
      expect(stripped).toContain(photo.src);
    }
    expect(photoImages(stripped)).toEqual(photoImages(html));

    // Rows are separated by padding on the cell rather than by a gutter around
    // the whole table, so every photo but the last carries one gap.
    expect(html).toContain('cellspacing="0" style="margin:0 0 24px;"');
    expect(html.match(/<td align="center" valign="top" style="padding-bottom:8px;">/g)).toHaveLength(2);
    expect(html.match(/<td align="center" valign="top" style="">/g)).toHaveLength(1);
  });

  /**
   * The well is what the reader sees when nothing loads, so it is a real
   * surface: a palette tone declared twice (Gmail's dark theme rewrites a
   * background-color and leaves a gradient alone) inside the app's own border.
   */
  it("paints the reserved box as a toned well, declared twice", () => {
    const html = withPhotos([PHOTOS.landscape]);

    // The inline tone is the card's, because the inline layout is the phone's
    // and there the well sits on the shell's bare ground.
    expect(html).toContain(
      `background-color:${DARK_THEME.card};background-image:linear-gradient(${DARK_THEME.card},${DARK_THEME.card});border:1px solid ${DARK_THEME.border}`,
    );
  });

  /**
   * A well is a tone one step off the ground it sits on, and the shell has two
   * grounds: the bare one on a phone, the card above the breakpoint. So the
   * same cell is card-toned inline and ground-toned inside the shell's own
   * wide-viewport rule, which reaches it through the class this module emits.
   *
   * It is a re-tone rather than a layout the stylesheet holds up: strip the
   * block and a card-toned well on the dark ground is exactly right, because
   * the dark ground is the only one a client that dropped the block will draw.
   */
  it("re-tones the well against the card, through a class the shell names", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait]);

    // Counted by splitting rather than by a built regex: the class name is a
    // constant, not a pattern.
    expect(html.split(`class="${PHOTO_WELL_CLASS}"`).length - 1).toBe(2);
    const query = html.slice(html.indexOf("@media"), html.indexOf("</style>"));
    expect(query).toContain(`.${PHOTO_WELL_CLASS}`);
    expect(query).toContain(`background-color:${DARK_THEME.bg} !important`);
    expect(query).toContain(
      `background-image:linear-gradient(${DARK_THEME.bg},${DARK_THEME.bg}) !important`,
    );
  });

  /**
   * Nothing to read out and nothing to leave behind in a blocked render: the
   * line above the grid is what says what these are.
   */
  it("gives every photo an empty alt", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]);

    const tags = html.match(/<img [^>]*>/g) ?? [];
    expect(tags.length).toBe(photoImages(html).length);
    for (const tag of tags) {
      expect(tag).toContain('alt=""');
    }
  });

  /** The staff copy is the same mail behind a banner, pictures included. */
  it("carries the same photos into the staff copy", () => {
    const family = photoImages(withPhotos([PHOTOS.landscape, PHOTOS.square]));
    const staff = photoImages(withPhotos([PHOTOS.landscape, PHOTOS.square], true));

    expect(staff).toEqual(family);
  });

  /** No `<a>` around a photo: the grid adds no destination the mail did not have. */
  it("adds no link to the mail", () => {
    const html = withPhotos([PHOTOS.landscape, PHOTOS.portrait, PHOTOS.square]);

    expect(html.match(/<a /g)).toHaveLength(1);
  });
});
/**
 * The child's own copy: one sentence addressed to the child instead of to the
 * parent about them, and nothing else different. Both halves are pinned —
 * that the sentence turns, and that the report under it does not — because
 * the second is what makes the first safe to send: a child's copy that drifted
 * in its body would be a fourth mail nobody reviews.
 */
describe("the child's own copy", () => {
  const family = () => buildSessionReportEmail(t, "en", base);
  const child = () => buildSessionReportEmail(t, "en", { ...base, gamerCopy: true });

  it("addresses the framing sentence to the child", () => {
    expect(child()).toContain("report from your ");
    expect(child()).toContain("Hi ");
    expect(family()).not.toContain("report from your ");
  });

  it("leaves everything under the intro byte-for-byte the family's", () => {
    const from = (html: string) => html.slice(html.indexOf("Group"));
    expect(from(child())).toBe(from(family()));
  });

  it("carries no staff banner", () => {
    expect(child()).not.toContain("Gedu and Admin copy");
    expect(child()).not.toContain(`color:${STATUS.info}`);
  });

  it("renders the family mail when the flag is absent or false", () => {
    expect(buildSessionReportEmail(t, "en", { ...base, gamerCopy: false })).toBe(family());
  });
});

describe("sessionReportSubject", () => {
  it("names the product and the session date", () => {
    expect(sessionReportSubject(t, base)).toBe(
      "Session report – Minecraft: Cozy Adventures, Thursday, 20 August 2026",
    );
  });
});
