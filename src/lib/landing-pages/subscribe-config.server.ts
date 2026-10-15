import "server-only";
import type { SupportedLocale } from "@/lib/constants/locales";

/**
 * Where a landing page's email sign-up sends a reader in Brevo: the list they
 * join and the double opt-in template that asks them to confirm. Both are the
 * deployment's, the same for every page, and live in the environment.
 *
 * - `BREVO_SIGNUP_LIST_ID` — the list a confirmed reader joins.
 * - `BREVO_SIGNUP_DOI_TEMPLATE_ID` — the confirmation mail, for every locale
 *   without one of its own.
 * - `BREVO_SIGNUP_DOI_TEMPLATE_ID_<LOCALE>` — optional, the confirmation mail
 *   in one locale (`_FI`, `_SV`, `_FR`; a regional code's hyphen becomes an
 *   underscore). A Brevo template is written in one language, so a locale
 *   with none of its own is sent the default one.
 */

export interface SubscribeConfig {
  listId: number;
  templateId: number;
}

/** The env var naming one locale's own confirmation template. */
export function localeTemplateVar(locale: SupportedLocale): string {
  return `BREVO_SIGNUP_DOI_TEMPLATE_ID_${locale.toUpperCase().replaceAll("-", "_")}`;
}

/** A Brevo id from the environment: a positive whole number, else null. */
function brevoId(name: string): number | null {
  const raw = process.env[name]?.trim() ?? "";
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}

/**
 * The sign-up configuration for a reader in `locale`, or the names of the
 * variables that are unset or not an id. Unset is a refusal, never a silent
 * success: a form that answered "check your inbox" with nowhere to send the
 * address would lose every sign-up without anyone noticing.
 */
export function readSubscribeConfig(
  locale: SupportedLocale,
): { ok: true; config: SubscribeConfig } | { ok: false; missing: string[] } {
  const listId = brevoId("BREVO_SIGNUP_LIST_ID");
  const templateId =
    brevoId(localeTemplateVar(locale)) ?? brevoId("BREVO_SIGNUP_DOI_TEMPLATE_ID");
  if (listId !== null && templateId !== null) {
    return { ok: true, config: { listId, templateId } };
  }
  return {
    ok: false,
    missing: [
      ...(listId === null ? ["BREVO_SIGNUP_LIST_ID"] : []),
      ...(templateId === null ? ["BREVO_SIGNUP_DOI_TEMPLATE_ID"] : []),
    ],
  };
}

/**
 * The Brevo contact attributes a sign-up writes, by what they hold. Each has
 * to exist in the Brevo account (Contacts → Settings → Contact attributes) or
 * Brevo refuses the call; `FIRSTNAME` is one Brevo creates in every account.
 */
export const SIGNUP_ATTRIBUTES = {
  firstName: "FIRSTNAME",
  /** The page's slug in the version the reader was shown: readable, and may change. */
  page: "SIGNUP_PAGE",
  /** The page's id: never changes, so a segment built on it outlives a new slug. */
  pageId: "SIGNUP_PAGE_ID",
  /** The page's locale — the language the reader signed up in. */
  locale: "SIGNUP_LOCALE",
} as const;

/** The UTM attributes, one per field, named as the query parameter in capitals. */
export function utmAttributeName(param: string): string {
  return param.toUpperCase();
}
