import { wrapInLayout } from "./layout";
import { escapeHtml, paragraph, styledName, styledProductName } from "./utils";
import { ctaButton } from "./blocks";
import { renderMarkdownForEmail } from "./markdown";
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
 * with the group's name in the child's slot). The admin testing tool at
 * `/admin/testing` keeps its entry — it is still where the layout and the
 * markdown rendering are iterated, against invented fixture reports.
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
  }: SessionReportEmailOptions,
): string {
  const content = `
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
