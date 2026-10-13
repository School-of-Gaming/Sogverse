import { wrapInLayout } from "./layout";
import {
  escapeHtml,
  paragraph,
  styledName,
  styledProductName,
  subheading,
} from "./utils";
import { calloutPanel, ctaButton, factList, hairlineRule, sectionLabel } from "./blocks";
import { renderMarkdownForEmail } from "./markdown";
import { sessionPhotoGrid, type SessionReportPhoto } from "./session-photos";
import { MAIL_SPACE } from "./type-scale";
import type { EmailTranslator } from "./translator";

/**
 * A session report, mailed to a family.
 *
 * The report is the mail. A gedu wrote it for this group after this session,
 * and the family has seen nothing like it yet, so everything around it is
 * kept to what the reader needs to place it: one sentence saying whose report
 * it is and which session, a short block of facts (group, date, time), and the
 * way to the product's own page in My SOG, where this report sits with the
 * earlier ones and the upcoming sessions. The report itself is rendered from
 * its markdown by the same rules the app renders it with — same parser, same
 * subset, and no links.
 *
 * **The report is not boxed.** It sits in the card's own body, ruled off from
 * the facts above and the button below, rather than in a box of its own: on a
 * phone the shell hands the content a narrow column already, and a nested card
 * spent 24px a side of it, leaving the gedu's paragraphs too little room to
 * read without wrapping every few words.
 *
 * **A session's photos come under the report, and they are the one thing in
 * any mail this codebase sends that is content rather than decoration.** The
 * grid and every box in it is `session-photos.ts`'s; what matters here is that
 * the mail is written to be worth reading with none of them loaded, which is
 * the render a good share of inboxes give by default and the only render an
 * already-sent mail has once a photo is deleted.
 *
 * **Names and times arrive formatted, in the parent's locale.** The caller
 * knows which locale the parent reads in; this builder only has a translator
 * and a string template. So the product name is the translation for the
 * parent's locale (falling back to the default locale) — the subject names the
 * product the way the parent knows it — and the date and the time range come
 * in as the strings they will be printed as. The time range always names its
 * zone: a mail is rendered without the reader's own zone (that lives in a
 * browser cookie the server never sees), so it is formatted in the product's
 * zone and says so.
 *
 * Sent by `POST /api/gedu/sessions/email-report`, when a gedu presses **Send to
 * parents** on a past session's card: one mail per active participation, plus
 * one copy to the gedu with the admins in CC (that copy is the same template
 * with the group's name in the child's slot, opened by the banner below). The
 * admin testing tool at `/admin/testing` keeps its entry — it is still where
 * the layout and the markdown rendering are iterated, against invented fixture
 * reports.
 *
 * **The staff copy says it is one, at the top, before anything else.** Staff
 * meet their own copy in an inbox that shows them a To and a CC full of
 * colleagues, and the reasonable reading of that — the one that keeps being
 * made — is that a family somewhere received a mail exposing those addresses.
 * Nothing was ever exposed; the confusion is the defect, so the copy answers it
 * in the two sentences that settle it: this is a copy of what went to the
 * families, and each family's mail was its own, addressed to them alone. It is
 * a variant of the one template rather than a template of its own, because
 * everything below the banner is deliberately the same mail the families read.
 *
 * **A child with a mailbox of their own gets a third variant: their copy.**
 * The route sends it beside the parent's, never instead of it, and only when
 * the child's sign-in is their real email — the recipient rule lives with the
 * route, not here. What
 * changes in the mail is the one framing sentence: the parent's copy is
 * written *to the parent about the child* ("here is X's report from Aino's
 * session"), and read by Aino that sentence is about somebody else, so the
 * child's copy greets them and says "your session". The report, the facts, the
 * photos and the closing are the same bytes, and the button goes to the
 * child's own page in My SOG — the caller passes that URL, because a `/parent`
 * link bounces a signed-in child off it. **The child's copy carries no
 * spotlights**, whatever the caller passes: they are what we put in front of
 * the parent, and the child's copy carries the report only. That is the
 * template's decision rather than each caller's, so no surface can render a
 * child's copy that has them.
 *
 * **The family mail and the staff copy end with the enabled spotlights**,
 * newest first — admin-written notes, each a picture, a title and a short
 * markdown body. They come after the closing, because the report and what it
 * asks are the mail and the spotlights are what the platform adds beneath it,
 * and one lead-in over the first says so — without it they read as more of
 * the report. **They are laid out open, not boxed**: the shell is itself a card on a wide
 * viewport and a card in a card is the one arrangement this directory forbids,
 * so each is ruled off by the same hairline that separates the report from its
 * button. The picture is the photo column's (`session-photos.ts`), boxed from
 * the stored dimensions like any photo; the title is the shell's own section
 * heading; the body renders under the `spotlight` use case, which keeps links —
 * an admin is trusted with what they publish to every family, where a gedu's
 * report keeps none. Every value arrives resolved: the version for this
 * reader's locale and the picture's public URL are the caller's to pick.
 */

/**
 * One spotlight, as the mail draws it: the reader's version, already picked,
 * and a picture whose URL the caller composed.
 */
export interface SessionReportSpotlight {
  /** Plain text; escaped here. */
  title: string;
  /** Authored markdown, rendered under the `spotlight` use case. */
  body: string;
  image: {
    /** Absolute, unauthenticated URL — composed by the caller. */
    url: string;
    /** The stored pixel size, which the reserved box is built from. */
    width: number;
    height: number;
  };
}

export interface SessionReportEmailOptions {
  /** The child the report concerns, as the family knows them. */
  gamerName: string;
  /** The gedu who wrote the report. */
  geduName: string;
  /** The product's name in the *parent's* locale, not the product's default. */
  productName: string;
  groupName: string;
  /** Already formatted for the parent's locale and zone, e.g. "Thursday, 20 August 2026". */
  sessionDate: string;
  /** Already formatted, zone named, e.g. "16:30 – 18:00 GMT+3" or "16.30–18.00 UTC+3". */
  sessionTime: string;
  /** The report exactly as stored. */
  reportMarkdown: string;
  /** App-generated link to the product's page in My SOG, where the reports live. */
  productUrl: string;
  /**
   * The session's photos, oldest first — the order every surface shows them in.
   * Absent or empty is the mail this template sent before photos existed, which
   * is what most reports will go on being.
   *
   * **The mail is a snapshot.** These are the photos the session had at the
   * moment it was sent: one added afterwards does not retrigger anything, and
   * one removed afterwards simply stops loading — which costs the reader
   * nothing, because the box it left behind was reserved from the stored
   * dimensions and was never the picture's to hold open.
   */
  photos?: readonly SessionReportPhoto[];
  /**
   * Render the copy that goes to the sender and the admins rather than the mail
   * that goes to a family: the same report, opened by the banner that says so.
   * Absent means the family mail, which is what every send but one is.
   */
  staffCopy?: boolean;
  /**
   * Render the copy that goes to the child themselves — the same mail with its
   * framing sentence addressed to the child rather than to their parent about
   * them. Only ever set for a child whose own real email is the recipient; a
   * family mail and a staff copy leave it unset.
   */
  gamerCopy?: boolean;
  /**
   * Every enabled spotlight, newest first, each in this reader's version.
   * Absent or empty is the mail with nothing beneath the closing. The child's
   * copy draws none whatever is passed — see the module comment.
   */
  spotlights?: readonly SessionReportSpotlight[];
}

export function sessionReportSubject(
  t: EmailTranslator,
  { productName, sessionDate }: Pick<SessionReportEmailOptions, "productName" | "sessionDate">,
): string {
  return t("sessionReport.subject", { productName, sessionDate });
}

export function buildSessionReportEmail(
  t: EmailTranslator,
  locale: string,
  {
    gamerName,
    geduName,
    productName,
    groupName,
    sessionDate,
    sessionTime,
    reportMarkdown,
    productUrl,
    photos = [],
    staffCopy = false,
    gamerCopy = false,
    spotlights = [],
  }: SessionReportEmailOptions,
): string {
  // The banner carries its own leading break, so the family mail's content is
  // byte-for-byte what it was before the variant existed.
  const content = `${staffCopy ? staffCopyBanner(t) : ""}
    ${paragraph(
      t(gamerCopy ? "sessionReport.gamerIntro" : "sessionReport.intro", {
        geduName: styledName(geduName),
        gamerName: styledName(gamerName),
        productName: styledProductName(productName),
      }),
    )}
    ${factList([
      // The shared block escapes nothing, so a value off a row is escaped here
      // — the directory's usual rule. The labels are not: they are translated
      // copy, which is composed HTML by the block's convention and is what
      // every other caller hands it.
      [t("sessionReport.groupLabel"), escapeHtml(groupName)],
      [t("sessionReport.dateLabel"), escapeHtml(sessionDate)],
      [t("sessionReport.timeLabel"), escapeHtml(sessionTime)],
    ])}
    <div style="margin:0 0 ${MAIL_SPACE.block}px;">
      ${renderMarkdownForEmail(reportMarkdown, "feed")}
    </div>
    ${photosSection(t, photos)}
    ${hairlineRule()}
    ${ctaButton({ href: productUrl, label: t("sessionReport.productButton") })}
    ${paragraph(t("sessionReport.closing", { productName: styledProductName(productName) }))}
    ${gamerCopy ? "" : spotlightsSection(spotlights)}
  `;
  return wrapInLayout({ title: t("sessionReport.title"), content, locale, t });
}

/**
 * The staff copy's opening banner: what this mail is, and what the families
 * received instead.
 *
 * **It is the first thing in the card, above the intro**, because the reader
 * has already seen the thing that worries them — a To and a CC full of
 * colleagues — before they have read a word, and an explanation further down is
 * an explanation arriving after the alarm.
 *
 * **It is `calloutPanel`, not markup of its own** — the app's `Alert` in its
 * `info` variant, reaching an inbox: no fill, a full info border, an uppercase
 * label in the info colour and paragraphs in the body's own ink. Everything
 * about how it looks lives in the helper, so the one thing this file decides is
 * which three strings go in it. It was a brand-orange rule down one edge for a
 * while, which is a treatment the app has nowhere and which read as a warning —
 * this is a copy of a report, not an alarm.
 *
 * It opens the mail, so it sits flush at the top of the content rather than
 * taking the furniture step above itself.
 */
function staffCopyBanner(t: EmailTranslator): string {
  return calloutPanel({
    label: t("sessionReport.staffCopyLabel"),
    paragraphs: [t("sessionReport.staffCopyBody"), t("sessionReport.staffCopyPrivacy")],
    opening: true,
  });
}

/**
 * The photos, under a line saying what they are.
 *
 * **They sit below the report and above the rule**, because they are part of
 * what the gedu wrote rather than a postscript to it: the rule under them is
 * the one that already separated the report from what the mail asks next, and
 * the photos belong on the report's side of it. A session with no photos gets
 * nothing at all — no heading, no empty grid, no space held open for something
 * that is not coming.
 *
 * The lead-in is `sectionLabel` rather than a heading: the report above it
 * carries the gedu's own headings, and a second-level heading here would
 * compete with them for the same rank.
 *
 * The lead-in and the grid are one piece of furniture, so the pair states the
 * furniture step above and below itself; the lead-in sits the tight step above
 * the first photo, as a lead-in does above anything it introduces.
 */
function photosSection(
  t: EmailTranslator,
  photos: readonly SessionReportPhoto[],
): string {
  if (photos.length === 0) return "";
  return `<div style="margin:${MAIL_SPACE.furniture}px 0;">
      ${sectionLabel(t("sessionReport.photosHeading"))}
      ${sessionPhotoGrid(photos)}
    </div>`;
}

/**
 * The spotlights, each under a hairline of its own: the first one's rule
 * separates them from the closing above, and every later one's from the
 * spotlight before. No heading names them as a group, because a picture and
 * its title already say what each one is (owner's ruling, 2026-10-13), and a
 * group heading read as the first spotlight's alone. None at all draws
 * nothing.
 */
function spotlightsSection(spotlights: readonly SessionReportSpotlight[]): string {
  return spotlights
    .map((spotlight) => `${hairlineRule()}${spotlightSection(spotlight)}`)
    .join("");
}

/**
 * One spotlight: the picture, the title, the body.
 *
 * Open rather than boxed, because the shell is already the card — see the
 * module comment. The picture is a photo column of one, so it gets the same
 * box arithmetic, painted well, Outlook pixel pair and empty `alt` as a session
 * photo rather than a second image block that could drift from it. The grid
 * states no margin of its own, so the block step under the picture is stated
 * here. The title is a `subheading()`; the body carries no headings of its
 * own to compete with it.
 */
function spotlightSection({
  title,
  body,
  image,
}: SessionReportSpotlight): string {
  return `<div style="margin:0 0 ${MAIL_SPACE.block}px;">
      ${sessionPhotoGrid([{ src: image.url, width: image.width, height: image.height }])}
    </div>
    ${subheading(escapeHtml(title))}
    <div>
      ${renderMarkdownForEmail(body, "spotlight")}
    </div>`;
}
