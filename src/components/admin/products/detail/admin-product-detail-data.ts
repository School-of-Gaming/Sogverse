import type {
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed";
import type { ProductSite } from "@/components/gedu/session-details/GeduProductPageBody";
import type { ProductAdminDetailRow } from "@/services/products";
import type { EffectiveProductStatus } from "@/lib/products/effective-status";
import type { ProductGroupsSnapshot } from "@/types";

/**
 * Everything the **admin product page** shows about one product.
 *
 * The organising idea of the redesign is short: *every stored fact about a
 * product is readable here, plus everything a gedu sees, plus the facts derived
 * from them — and Edit is only for changing.* The live page shows perhaps half
 * of that, which is why admins have been making themselves second gedu accounts
 * to read a group's session reports.
 *
 * So this shape has three parts, and the split is worth reading:
 *
 * - `product` is the **real admin row**, unmodified. It is what lets the page
 *   render the shop's own overview card and the authored long description
 *   exactly as a family meets them, rather than a second rendering of the same
 *   columns that can disagree with the first.
 * - The derived block is everything an admin would otherwise have to work out —
 *   the public URL, what the next session is, how much of the term has run, how
 *   full it is, and *why* the status says what it says. None of these are
 *   columns; all of them are questions asked on this page every day.
 * - The gedu-side block is what the admin could not see at all: standing notes,
 *   the roster's contacts, and one session feed per group.
 *
 * **It is a view-model, and promotion is where it becomes a query.** Nothing in
 * the aggregate half exists in a table today; writing the shape down first is
 * what lets the page be judged before anybody decides how to compute it.
 */
export interface AdminProductDetail {
  /** The product row itself, exactly as the admin query returns it. */
  product: ProductAdminDetailRow;

  // ── Derived ──────────────────────────────────────────────────────────────
  /** Resolved lifecycle, already computed against the page's clock. */
  status: EffectiveProductStatus;
  /**
   * Why the status is what it is, as a ready-to-read line, or `null` when the
   * status speaks for itself.
   *
   * A status chip on its own has been the single most-asked-about thing on this
   * page: "Awaiting start" says nothing about *what* it is waiting for, and the
   * answer (a start date, a registration window, a signup threshold, or two of
   * them at once) is sitting in columns the admin then has to go and read.
   */
  statusReason: string | null;
  /**
   * The product's public URL, absolute — `/shop/{id}`, or the school path for a
   * municipality club. Absolute because the reason it is here is to be pasted
   * into a mail or a chat, and a relative path pasted anywhere is broken.
   */
  publicUrl: string;
  /** The next occurrence, or `null` when the run is over. */
  nextSession: { startsAt: Date; endsAt: Date; isLive: boolean } | null;
  /** Occurrences that have finished, and those still to come this term. */
  sessionsRun: number;
  /** `null` on an open-ended product, where "remaining" has no answer. */
  sessionsRemaining: number | null;
  /** Finished sessions carrying a write-up, and those whose write-up was mailed. */
  sessionsWrittenUp: number;
  sessionsEmailed: number;
  seats: {
    filled: number;
    /** `null` when the product is uncapped. */
    free: number | null;
    waitlisted: number;
    unplaced: number;
  };
  /** Who made it and who last touched it — name plus an ISO instant. */
  createdBy: { name: string; at: string };
  updatedBy: { name: string; at: string };
  /** Every contact address on the product, de-duplicated and ordered. */
  allContactEmails: string[];

  // ── The gedu's side of the product ───────────────────────────────────────
  /**
   * The venue and its two standing notes, or `null` for a remote product.
   *
   * **The question is `is_remote`, never "does it have a location".** A remote
   * municipality club carries a `location_id` by CHECK — the town it is run for
   * — so a caller testing for a location would put a door code on a club that
   * meets in a voice room.
   */
  site: ProductSite | null;
  /** The kunta a municipality club belongs to; `null` on every other type. */
  municipalityName: string | null;
  /** The seating panel's own document, rendered by the shared panel view. */
  groups: ProductGroupsSnapshot;
  /** Per group: its two standing notes, its contacts, and its session feed. */
  groupDetails: readonly AdminProductGroupDetail[];
  /**
   * The address to answer on for one seat, keyed by **participation** id.
   *
   * Keyed by participation rather than by participant because that is the id a
   * chip carries, and it saves the popover a second lookup. It is a separate map
   * rather than a field on the participation because the groups snapshot does
   * not carry a parent's address at all — only their name — so this is the one
   * fact on the page a promotion will have to widen an RPC for.
   */
  contactByParticipation: Readonly<Record<string, string | null>>;
}

/** One group, with everything about it an admin could previously not see. */
export interface AdminProductGroupDetail {
  groupId: string;
  name: string;
  /** The group's standing note families read. */
  publicNote: string | null;
  /** The group's standing note only gedus and admins read. */
  staffNote: string | null;
  /** Contacts for this group's roster, de-duplicated. */
  contactEmails: string[];
  /** Newest first — the same feed the group's gedu reads. */
  entries: readonly SessionFeedEntry[];
  /** Who the register is taken over. */
  roster: readonly SessionFeedGamer[];
}

/**
 * The page's sections, in order, and their anchor ids.
 *
 * A list rather than seven scattered literals because the sticky section pill
 * enumerates exactly this and the sections scroll to exactly these ids — two
 * places that must never disagree, and one of them is a nav bar that fails
 * silently when it does.
 */
export const ADMIN_PRODUCT_SECTIONS = [
  "at-a-glance",
  "as-sold",
  "how-it-runs",
  "money",
  "people",
  "sessions",
] as const;

export type AdminProductSection = (typeof ADMIN_PRODUCT_SECTIONS)[number];

/**
 * Tally one group's finished sessions: how many ran, how many carry a write-up,
 * how many of those were mailed.
 *
 * It walks the same entries the feed renders, so the ledger strip above a feed
 * and the cards inside it can never disagree about what is outstanding. Pure, so
 * the page can total it across groups without a second pass over the data.
 */
export function tallySessions(entries: readonly SessionFeedEntry[]): {
  run: number;
  writtenUp: number;
  emailed: number;
  upcoming: number;
} {
  let run = 0;
  let writtenUp = 0;
  let emailed = 0;
  let upcoming = 0;

  for (const entry of entries) {
    if (entry.kind === "future") {
      upcoming += 1;
      continue;
    }
    run += 1;
    if (entry.kind === "no_record") continue;
    // The same trimmed test the feed, the dashboard badge and the SQL twin use:
    // a report of one newline is no report.
    if ((entry.report ?? "").trim() !== "") writtenUp += 1;
    if (entry.reportEmailedAt !== null) emailed += 1;
  }

  return { run, writtenUp, emailed, upcoming };
}

/**
 * Per-person attendance across a group's finished sessions.
 *
 * Three counts rather than two, because "unmarked" is a real third state and
 * folding it into absent would report a gedu's unfinished paperwork as children
 * who did not turn up — which is the number a municipality is invoiced on.
 */
export interface AttendanceLedgerRow {
  gamerId: string;
  firstName: string;
  present: number;
  absent: number;
  unmarked: number;
}

export function attendanceLedger(
  entries: readonly SessionFeedEntry[],
  roster: readonly SessionFeedGamer[],
): AttendanceLedgerRow[] {
  return roster.map((gamer) => {
    let present = 0;
    let absent = 0;
    let unmarked = 0;
    for (const entry of entries) {
      // Only what has finished counts: a session still ahead has nothing to say
      // about anybody, and a pre-epoch gap was never asked for.
      if (entry.kind !== "past") continue;
      const mark = entry.attendance[gamer.id];
      if (mark === "present") present += 1;
      else if (mark === "absent") absent += 1;
      else unmarked += 1;
    }
    return { gamerId: gamer.id, firstName: gamer.firstName, present, absent, unmarked };
  });
}
