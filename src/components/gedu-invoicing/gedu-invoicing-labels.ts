import type { GeduAssignmentRole } from "@/lib/session-staffing";
import type { GeduInvoiceSegment } from "./build-gedu-invoicing";

/**
 * The words a gedu's month is read in, as `geduInvoicing` message keys — one
 * home for the page and for the files exported from it, so a download names a
 * segment or a role exactly as the screen it came from.
 */

/** The order a gedu's invoice itemises its two sums in. */
export const SEGMENT_ORDER: readonly GeduInvoiceSegment[] = [
  "municipality",
  "consumer",
];

export const SEGMENT_LABEL_KEY = {
  municipality: "segmentMunicipality",
  consumer: "segmentConsumer",
} as const satisfies Record<GeduInvoiceSegment, string>;

/**
 * A gedu's unset fee, and the figures it multiplies into. Punctuation rather
 * than copy — a dash says "no figure" in every locale — so it is written here
 * and not in five message files.
 */
export const NO_FIGURE = "—";

export const ROLE_LABEL_KEY = {
  primary: "rolePrimary",
  assistant: "roleAssistant",
} as const satisfies Record<GeduAssignmentRole, string>;
