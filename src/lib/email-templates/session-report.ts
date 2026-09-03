import { wrapInLayout } from "./layout";
import { escapeHtml, paragraph, styledName, styledProductName } from "./utils";
import { calloutPanel, ctaButton, sectionLabel } from "./blocks";
import { renderMarkdownForEmail } from "./markdown";
import { sessionPhotoGrid, type SessionReportPhoto } from "./session-photos";
import { DARK_THEME } from "@/lib/constants/colors";
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
 * the facts above and the button below, rather than in a second card inside
 * the first: on a phone the shell's card already spends 32px a side, and a
 * nested card spent another 24px, leaving the gedu's paragraphs a column too
 * narrow to read without wrapping every few words.
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
 * **A child with a verified mailbox of their own gets a third variant: their
 * copy.** The route sends it beside the parent's, never instead of it, and
 * only when the child's sign-in is their real email *and* that address has
 * been verified — the recipient rule lives with the route, not here. What
 * changes in the mail is the one framing sentence: the parent's copy is
 * written *to the parent about the child* ("here is X's report from Aino's
 * session"), and read by Aino that sentence is about somebody else, so the
 * child's copy greets them and says "your session". The report, the facts, the
 * photos and the closing are the same bytes, and the button goes to the
 * child's own page in My SOG — the caller passes that URL, because a `/parent`
 * link bounces a signed-in child off it.
 */

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
   * them. Only ever set for a child whose verified real email is the
   * recipient; a family mail and a staff copy leave it unset.
   */
  gamerCopy?: boolean;
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
    ${ruledFacts([
      [t("sessionReport.groupLabel"), groupName],
      [t("sessionReport.dateLabel"), sessionDate],
      [t("sessionReport.timeLabel"), sessionTime],
    ])}
    <div style="margin:0 0 24px;">
      ${renderMarkdownForEmail(reportMarkdown)}
    </div>
    ${photosSection(t, photos)}
    ${rule()}
    ${ctaButton({ href: productUrl, label: t("sessionReport.productButton") })}
    ${paragraph(t("sessionReport.closing", { productName: styledProductName(productName) }))}
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
 * `info` variant, reaching an inbox: a washed info surface inside a full info
 * border, with an uppercase label and the body's own text colour. Everything
 * about how it looks lives in the helper, so the one thing this file decides is
 * which three strings go in it. It was a brand-orange rule down one edge for a
 * while, which is a treatment the app has nowhere and which read as a warning —
 * this is a copy of a report, not an alarm.
 */
function staffCopyBanner(t: EmailTranslator): string {
  return calloutPanel({
    label: t("sessionReport.staffCopyLabel"),
    paragraphs: [t("sessionReport.staffCopyBody"), t("sessionReport.staffCopyPrivacy")],
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
 */
function photosSection(
  t: EmailTranslator,
  photos: readonly SessionReportPhoto[],
): string {
  if (photos.length === 0) return "";
  return `${sectionLabel(t("sessionReport.photosHeading"))}
    ${sessionPhotoGrid(photos)}`;
}

/**
 * Label–value rows, ruled above and between. Labels are small and muted so the
 * values carry the line; the label column is as narrow as its longest label
 * and does not wrap, so the values line up whatever the locale calls "group".
 * The last rule doubles as the line between the facts and the report.
 *
 * **Deliberately not `factTable` from `blocks.ts`, and not a variant of it.**
 * The shared one is the box every mail we send to *ourselves* states its facts
 * in — a full border, a radius, and no rule under the last row, because the
 * box's own edge already closes the list. This is the opposite arrangement on
 * every one of those points: open rules rather than a box, uppercase labels
 * sized to their own content, and a final rule that is load-bearing because it
 * is what separates the facts from the report below them. Absorbing it would
 * mean a helper with a knob for each of those, which is a style engine rather
 * than a block — and the two would still never be corrected together, since a
 * change to one of them is precisely a change the other must not take.
 */
function ruledFacts(rows: [label: string, value: string][]): string {
  const rendered = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 16px 8px 0;border-bottom:1px solid ${DARK_THEME.border};color:${DARK_THEME.mutedFg};font-size:12px;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;width:1%;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${DARK_THEME.border};color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid ${DARK_THEME.border};">
      ${rendered}
    </table>`;
}

/** A hairline between the report and what the mail asks afterwards. */
function rule(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="border-top:1px solid ${DARK_THEME.border};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>`;
}
