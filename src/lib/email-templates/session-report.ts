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
 * it is and which session, a short block of facts (group, date, time), and a
 * way back into My SOG where the rest of the feed lives. The report itself sits
 * in a recessed card, rendered from its markdown by the same rules the app
 * renders it with — same parser, same subset, and no links.
 *
 * **Names and times arrive formatted.** The caller knows which zone the parent
 * reads in and which locale they read in; this builder only has a translator
 * and a string template, so the date and the time range come in as the strings
 * they will be printed as.
 *
 * Spike status: this template exists so the layout and the markdown rendering
 * can be iterated from the admin testing tool against real reports. No route
 * sends it yet.
 */

export interface SessionReportEmailOptions {
  /** The child the report concerns, as the family knows them. */
  gamerName: string;
  /** The gedu who wrote the report. */
  geduName: string;
  productName: string;
  groupName: string;
  /** Already formatted for the reader's locale, e.g. "Thursday, 20 August 2026". */
  sessionDate: string;
  /** Already formatted in the reader's zone, e.g. "16:30–18:00 EEST". */
  sessionTime: string;
  /** The report exactly as stored. */
  reportMarkdown: string;
  /** App-generated My SOG link. */
  dashboardUrl: string;
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
    dashboardUrl,
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
    ${reportCard(renderMarkdownForEmail(reportMarkdown))}
    ${ctaButton({ href: dashboardUrl, label: t("sessionReport.dashboardButton") })}
    ${paragraph(t("sessionReport.closing"))}
  `;
  return wrapInLayout({ title: t("sessionReport.title"), content, locale, t });
}

/**
 * Label–value rows, ruled between. Labels are small and muted so the values
 * carry the line; the label column is as narrow as its longest label and does
 * not wrap, so the values line up whatever the locale calls "group".
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

/**
 * The report, recessed: the page background inside the card, with the card's
 * own border, so the gedu's words read as a document the mail is carrying
 * rather than as more of the mail.
 */
function reportCard(body: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:${DARK_THEME.bg};border:1px solid ${DARK_THEME.border};border-radius:8px;padding:20px 24px;">
          ${body}
        </td>
      </tr>
    </table>`;
}
