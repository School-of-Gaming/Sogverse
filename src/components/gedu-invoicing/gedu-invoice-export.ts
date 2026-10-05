import { createTranslator } from "use-intl/core";
import type { SupportedLocale } from "@/lib/constants/locales";
import { loadMessages, type Messages } from "@/i18n/messages";
import {
  fullName,
  type GeduInvoiceLine,
  type GeduInvoiceLineKind,
} from "./build-gedu-invoicing";

/**
 * What the two exports of a gedu's month — the CSV and the PDF work statement —
 * share: the translator they are worded through and the words they read off
 * the view model.
 *
 * **Neither file is an invoice.** Gedus invoice School of Gaming from tools of
 * their own, so the PDF is a statement they attach to that invoice and the CSV
 * is raw rows for their spreadsheet. Neither computes VAT: some gedus are not
 * VAT-registered, and whoever is adds it in their own tool, so every money
 * label says the figures exclude it.
 *
 * Both are worded in the page's own `geduInvoicing` namespace, reusing the
 * page's words for segments, roles and outcomes, so a file and the screen it
 * was downloaded from name things identically.
 */

/** A translator over the page's namespace, built outside React for a route. */
export type GeduInvoicingTranslator = ReturnType<
  typeof createTranslator<Messages, "geduInvoicing">
>;

export async function getGeduInvoicingTranslator(
  locale: SupportedLocale,
): Promise<GeduInvoicingTranslator> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace: "geduInvoicing" });
}

/**
 * A line's status as one word. The page says "Away — Mikael substituted" in
 * one phrase; a file has a column for the other gedu, so the status is the
 * bare word and the name sits beside it.
 */
export const STATUS_LABEL_KEY = {
  paid: "recorded",
  unrecorded: "notRecorded",
  upcoming: "upcoming",
  cancelled: "cancelled",
  absent: "export.statusAway",
} as const satisfies Record<GeduInvoiceLineKind, string>;

/**
 * The other gedu on a line: who this gedu stood in for, or who stood in for
 * them. A line carries at most one of the two — `coveringFor` on a seat held
 * as a sub, `substitute` on an absence.
 */
export function otherGeduName(line: GeduInvoiceLine): string | null {
  const person = line.coveringFor ?? line.substitute;
  return person === null ? null : fullName(person);
}
