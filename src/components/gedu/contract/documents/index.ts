import type {
  GeduContractDocument,
  GeduContractLanguage,
} from "../contract-document";
import { geduContract20262027Fi } from "./gedu-contract-2026-2027.fi";

/**
 * The version of the Gedu contract currently in force — what a gedu accepting
 * today is accepting, and what gets recorded against the acceptance. A new
 * version is a new document file plus a new entry in the registry below; the
 * old one stays, because an acceptance is bound to the text that was on screen
 * when it happened, not to whatever the terms say later.
 */
export const GEDU_CONTRACT_CURRENT_VERSION = "2026-2027";

/**
 * The language the contract is binding in. The Finnish text is the agreement;
 * any other language of the same version is a human translation published for
 * comprehension, and is shown as such rather than replacing this one. That is
 * also why the document renders verbatim in every locale — a locale switch
 * changes the UI around the terms, never the terms.
 */
export const GEDU_CONTRACT_BINDING_LANGUAGE: GeduContractLanguage = "fi";

/** The languages one version of the contract has been transcribed into. */
type GeduContractVersionDocuments = Partial<
  Record<GeduContractLanguage, GeduContractDocument>
>;

/**
 * Every transcribed version of the contract, by version and then language.
 * Both levels are optional in the type, and for the same reason: a version
 * string reaching this module is data (a value read back off an acceptance
 * row), and a version exists in the binding language first with a translation
 * following later or never. Callers handle the miss rather than assume a hit.
 */
const GEDU_CONTRACT_DOCUMENTS: Record<
  string,
  GeduContractVersionDocuments | undefined
> = {
  [GEDU_CONTRACT_CURRENT_VERSION]: {
    fi: geduContract20262027Fi,
  },
};

/**
 * The contract text for one version in one language, or `undefined` when that
 * pair has not been transcribed. Defaults to the binding language, which is the
 * one every version is guaranteed to have.
 */
export function getGeduContractDocument(
  version: string,
  language: GeduContractLanguage = GEDU_CONTRACT_BINDING_LANGUAGE,
): GeduContractDocument | undefined {
  return GEDU_CONTRACT_DOCUMENTS[version]?.[language];
}
