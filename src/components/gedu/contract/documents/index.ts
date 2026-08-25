import type {
  GeduContractDocument,
  GeduContractLanguage,
} from "../contract-document";
import { geduContract20262027En } from "./gedu-contract-2026-2027.en";
import { geduContract20262027Fi } from "./gedu-contract-2026-2027.fi";

/**
 * The version of the Gedu contract currently in force — what a gedu accepting
 * today is accepting. A new version is a new document file per language plus a
 * new entry in the registry below; the old one stays, because an acceptance is
 * bound to the text that was on screen when it happened, not to whatever the
 * terms say later.
 *
 * This is the **base** version: the label the document itself carries, with no
 * language on it. What an acceptance records is the encoded string a language
 * makes of it (see {@link geduContractStoredVersion}), so anything asking
 * whether a gedu is current compares this against
 * {@link geduContractBaseVersion} of what they signed.
 */
export const GEDU_CONTRACT_CURRENT_VERSION = "2026-2027";

/**
 * The language every version of the contract is guaranteed to exist in, and so
 * the one a lookup falls back to when the language asked for has not been
 * transcribed.
 *
 * It is a fallback and nothing more. The languages of one version are equally
 * binding — the Finnish text is not the agreement with the English one
 * explaining it — and this constant names Finnish only because that is the text
 * a version is drafted in first, which makes it the one that is always there to
 * fall back to.
 */
export const GEDU_CONTRACT_FALLBACK_LANGUAGE: GeduContractLanguage = "fi";

/** The languages one version of the contract has been transcribed into. */
type GeduContractVersionDocuments = Partial<
  Record<GeduContractLanguage, GeduContractDocument>
>;

/**
 * Every transcribed version of the contract, by base version and then language.
 * Both levels are optional in the type, and for the same reason: a version
 * string reaching this module is data (a value read back off an acceptance
 * row), and a version exists in the fallback language first with its sibling
 * following later or never. Callers handle the miss rather than assume a hit.
 */
const GEDU_CONTRACT_DOCUMENTS: Record<
  string,
  GeduContractVersionDocuments | undefined
> = {
  [GEDU_CONTRACT_CURRENT_VERSION]: {
    fi: geduContract20262027Fi,
    en: geduContract20262027En,
  },
};

/**
 * The contract text for one base version in one language, or `undefined` when
 * that pair has not been transcribed. Defaults to the fallback language, which
 * is the one every version is guaranteed to have.
 */
export function getGeduContractDocument(
  version: string,
  language: GeduContractLanguage = GEDU_CONTRACT_FALLBACK_LANGUAGE,
): GeduContractDocument | undefined {
  return GEDU_CONTRACT_DOCUMENTS[version]?.[language];
}

/**
 * The version string the platform records when this document is accepted:
 * `<base>/<language>`, e.g. `2026-2027/fi`.
 *
 * Which of the equally binding texts was read is half of what was signed, so the
 * record carries it in the one value it already had — the database whitelists
 * exactly these encoded strings, and a surface displaying what somebody signed
 * shows the whole of it verbatim.
 *
 * It is derived from the document rather than assembled at a call site on
 * purpose: what is being signed is the text on screen, so the string that names
 * it comes from that text and cannot drift from it.
 */
export function geduContractStoredVersion(
  document: GeduContractDocument,
): string {
  return `${document.version}/${document.language}`;
}

/**
 * The base version inside a stored version string — everything before the first
 * `/`, and the whole string when there is none.
 *
 * This is what every "is this gedu standing under the terms in force" check
 * compares, on both sides: the languages of one version *are* that version, so a
 * gedu who signed the Finnish text must not be re-prompted the moment they
 * switch the app to English. The no-slash case is a version label from before
 * languages were encoded, which is its own base.
 */
export function geduContractBaseVersion(storedVersion: string): string {
  const slash = storedVersion.indexOf("/");
  return slash === -1 ? storedVersion : storedVersion.slice(0, slash);
}

/**
 * The acceptance that answers for one base version, out of a gedu's rows.
 *
 * The *earliest* matching signature, deliberately. A gedu can hold both
 * languages' rows of one version — two signatures on one agreement — and the
 * first is when they agreed; a later countersignature of the other text does
 * not move that. The admin dashboard RPC reports the same row (its standing
 * read takes the minimum accepted-at over the base match), and this helper is
 * what keeps every card in the app naming the same date the queue does.
 *
 * Deliberately not `.find()` over the service's newest-first ordering: this
 * picks by the timestamps themselves, so it cannot silently change meaning if
 * a caller hands it rows sorted some other way.
 */
export function findGeduContractAcceptance<
  T extends { contract_version: string; accepted_at: string },
>(acceptances: T[], baseVersion: string): T | null {
  let earliest: T | null = null;
  for (const row of acceptances) {
    if (geduContractBaseVersion(row.contract_version) !== baseVersion) continue;
    if (
      earliest === null ||
      new Date(row.accepted_at).getTime() <
        new Date(earliest.accepted_at).getTime()
    ) {
      earliest = row;
    }
  }
  return earliest;
}

/**
 * Which of the contract's languages a reader in this locale is shown.
 *
 * Finnish for a Finnish app, English for every other locale — there is no
 * toggle, because the question "which text am I signing" is answered by the
 * language the reader is already reading the product in, and a picker would
 * invite somebody to sign a text they cannot read. A locale with no contract
 * text of its own (`sv`, `fr`, `tlh`) gets the English one rather than a machine
 * translation of anything.
 */
export function geduContractLanguageForLocale(
  locale: string,
): GeduContractLanguage {
  return locale === "fi" ? "fi" : "en";
}
