import { wrapInLayout } from "./layout";
import {
  BODY_TEXT_STYLE,
  escapeHtml,
  paragraph,
  pinnedFill,
  styledName,
  styledProductName,
} from "./utils";
import { ctaButton } from "./blocks";
import { renderMarkdownForEmail } from "./markdown";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
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
   * Render the copy that goes to the sender and the admins rather than the mail
   * that goes to a family: the same report, opened by the banner that says so.
   * Absent means the family mail, which is what every send but one is.
   */
  staffCopy?: boolean;
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
    staffCopy = false,
  }: SessionReportEmailOptions,
): string {
  // The banner carries its own leading break, so the family mail's content is
  // byte-for-byte what it was before the variant existed.
  const content = `${staffCopy ? staffCopyBanner(t) : ""}
    ${paragraph(
      t("sessionReport.intro", {
        geduName: styledName(geduName),
        gamerName: styledName(gamerName),
        productName: styledProductName(productName),
      }),
    )}
    ${factTable([
      [t("sessionReport.groupLabel"), groupName],
      [t("sessionReport.dateLabel"), sessionDate],
      [t("sessionReport.timeLabel"), sessionTime],
    ])}
    <div style="margin:0 0 24px;">
      ${renderMarkdownForEmail(reportMarkdown)}
    </div>
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
 * **Prominent within the rules, which means everything but coloured text.** The
 * brand orange is a 3px left rule and nothing else: an email's brand colour is
 * for the header and button fills, and purple-as-body-text is the mistake this
 * directory measured at 2.7:1 and pulled out. What separates the banner from
 * the report below it is therefore the ground colour under it (the shell's
 * background, one step darker than the card, declared twice so Gmail's dark
 * theme leaves it alone), that rule, and an uppercase label line. Both text
 * colours on it — the label's and the body's — are pairs
 * `palette-contrast.test.ts` already pins as legible on the ground.
 *
 * The two paragraphs carry the body's own weight rather than one of them being
 * muted: the privacy sentence is the half that answers the actual worry, and
 * greying it would quiet exactly the line the banner exists to say.
 */
function staffCopyBanner(t: EmailTranslator): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="${pinnedFill(DARK_THEME.bg)}border-left:3px solid ${BRAND.primary};border-radius:${RADIUS.lg};padding:16px;">
          <p style="margin:0 0 8px;color:${DARK_THEME.foreground};font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;">${t("sessionReport.staffCopyLabel")}</p>
          <p style="margin:0 0 8px;${BODY_TEXT_STYLE}">${t("sessionReport.staffCopyBody")}</p>
          <p style="margin:0;${BODY_TEXT_STYLE}">${t("sessionReport.staffCopyPrivacy")}</p>
        </td>
      </tr>
    </table>`;
}

/**
 * Label–value rows, ruled above and between. Labels are small and muted so the
 * values carry the line; the label column is as narrow as its longest label
 * and does not wrap, so the values line up whatever the locale calls "group".
 * The last rule doubles as the line between the facts and the report.
 */
function factTable(rows: [label: string, value: string][]): string {
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
