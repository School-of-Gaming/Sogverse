import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";
import { possibleAgeOnDate } from "@/lib/gamer-age-eligibility";
import { walkPages } from "@/lib/supabase/paging";
import { escapeLikePattern } from "@/lib/utils";
import {
  CAMPAIGN_MINIMUM_COUNT,
  LYNX_CAMPAIGN_PREFIX,
  type PartnerCampaignsQuery,
  type PartnerCampaignsResponse,
} from "./partner.contracts";
import { readInScopeSeats } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  readBirthDates,
  readParentGamerLinks,
} from "./partner-shared-lookups.server";
import { PROGRAMME_AGE_RANGE } from "./partner-shared-values";

/**
 * `/campaigns` — the funnel each Lynx campaign brought in, counted and never
 * listed: accounts created, children added, children of Programme age, and
 * accounts whose family enrolled.
 *
 * The one resource that reaches beyond the Programme: it starts from parent
 * accounts, not seats, so a family that never enrolled is counted too. What
 * keeps that safe is that nothing leaves but counts, each withheld below the
 * minimum, over whole months (D7) — and the response schema refuses a count
 * under the minimum outright, so a mistake here is a 500, never a leak.
 */

// ---------------------------------------------------------------------------
// The range
// ---------------------------------------------------------------------------

/** A UTC calendar month, `YYYY-MM`. */
function utcMonth(date: Date): string {
  return formatInTimeZone(date, "UTC", "yyyy-MM");
}

/** The instant a `YYYY-MM` month begins, in UTC. */
function monthStart(month: string): string {
  return `${month}-01T00:00:00.000Z`;
}

/** The instant the month after a `YYYY-MM` month begins, in UTC. */
function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  // `Date.UTC` takes a 0-based month, so the 1-based number is already the next.
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString();
}

/**
 * The months the answer covers: what the caller asked for, and otherwise the
 * documented defaults — `to` is the current UTC month, and `from` the month
 * `to` names.
 *
 * The query schema refuses a reversed pair it can see, but not one a default
 * completes: `from` alone in a future month would run past the current month
 * and answer a confident, permanently empty funnel. That is refused the same
 * way, as the caller's mistake.
 */
export function resolveCampaignRange(
  query: PartnerCampaignsQuery,
  now: Date,
): { from: string; to: string } {
  const to = query.to ?? utcMonth(now);
  const from = query.from ?? to;
  if (from > to) {
    throw new PartnerQueryError(
      `from: must be on or before to, which defaults to the current month (${to})`,
    );
  }
  return { from, to };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every parent account created in the range through a Lynx campaign, with the
 * campaign exactly as stored.
 *
 * The prefix is matched in the database with `ilike`, escaped so it is a
 * literal prefix whatever it is ever changed to — `_` and `%` are wildcards
 * there. Walked: a campaign's accounts are as many as it brings in.
 */
async function readCampaignAccounts(
  db: PartnerDb,
  range: { from: string; to: string },
): Promise<{ id: string; campaign: string }[]> {
  const rows = await walkPages("partner campaign accounts", (from, to) =>
    db
      .from("profiles")
      .select("id, utm_campaign", { count: "exact" })
      .eq("role", "customer")
      .ilike("utm_campaign", `${escapeLikePattern(LYNX_CAMPAIGN_PREFIX)}%`)
      .gte("created_at", monthStart(range.from))
      .lt("created_at", monthEnd(range.to))
      .order("id")
      .range(from, to),
  );
  return rows.flatMap((row) =>
    row.utm_campaign === null ? [] : [{ id: row.id, campaign: row.utm_campaign }],
  );
}

/** Each account's linked gamers, keyed by account id; an account with none is absent. */
async function readChildren(
  db: PartnerDb,
  accountIds: readonly string[],
): Promise<Map<string, string[]>> {
  const children = new Map<string, string[]>();
  for (const link of await readParentGamerLinks(db, "parent_id", accountIds)) {
    const list = children.get(link.parent_id) ?? [];
    list.push(link.gamer_id);
    children.set(link.parent_id, list);
  }
  return children;
}

// ---------------------------------------------------------------------------
// The funnel
// ---------------------------------------------------------------------------

/** A count as the answer shows it: withheld under the minimum, zero included. */
function shown(count: number): number | null {
  return count < CAMPAIGN_MINIMUM_COUNT ? null : count;
}

/**
 * Could a child born in this stored month be of Programme age on `day`? The
 * birth month allows two adjacent ages, and the child counts when either one is
 * in range — the same generous reading enrolment makes.
 */
function possiblyProgrammeAge(dateOfBirth: string, day: string): boolean {
  const age = possibleAgeOnDate(dateOfBirth, day);
  return age.min <= PROGRAMME_AGE_RANGE.max && age.max >= PROGRAMME_AGE_RANGE.min;
}

/**
 * The campaign funnel over the resolved months, one entry per Lynx campaign that
 * brought at least one parent account in them, ascending by campaign.
 *
 * - `accounts_created`: parent accounts created in the range whose stored
 *   `utm_campaign` is exactly this value. Values differing only in letter case
 *   are separate campaigns.
 * - `children_added`: the distinct gamers linked to those accounts now,
 *   whenever they were linked.
 * - `children_eligible`: those gamers possibly aged 13 to 17 on the request's
 *   UTC day (D11). A gamer whose birth date could not be read — deleted while
 *   the request was reading — is not counted as eligible.
 * - `enrolled`: those accounts where the account itself or a linked gamer holds
 *   a live seat on a Programme product.
 *
 * Every count under `CAMPAIGN_MINIMUM_COUNT` is `null`.
 */
export async function readPartnerCampaigns(
  db: PartnerDb,
  query: PartnerCampaignsQuery,
  now: Date,
): Promise<PartnerCampaignsResponse> {
  const range = resolveCampaignRange(query, now);
  const today = formatInTimeZone(now, "UTC", "yyyy-MM-dd");

  const accounts = await readCampaignAccounts(db, range);
  const accountIds = accounts.map((account) => account.id);
  const children = await readChildren(db, accountIds);
  const childIds = [...new Set([...children.values()].flat())];

  const [births, seats] = await Promise.all([
    readBirthDates(db, childIds),
    readInScopeSeats(db, { participantIds: [...accountIds, ...childIds] }),
  ]);
  const seated = new Set(seats.map((seat) => seat.participant_id));

  const byCampaign = new Map<string, string[]>();
  for (const account of accounts) {
    const list = byCampaign.get(account.campaign) ?? [];
    list.push(account.id);
    byCampaign.set(account.campaign, list);
  }

  const campaigns = [...byCampaign.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((campaign) => {
      const ids = byCampaign.get(campaign) ?? [];
      const childrenOf = (id: string) => children.get(id) ?? [];
      const added = new Set(ids.flatMap(childrenOf));
      const eligible = [...added].filter((id) => {
        const birth = births.get(id);
        return birth !== undefined && possiblyProgrammeAge(birth, today);
      });
      const enrolled = ids.filter(
        (id) => seated.has(id) || childrenOf(id).some((child) => seated.has(child)),
      );
      return {
        utm_campaign: campaign,
        accounts_created: shown(ids.length),
        children_added: shown(added.size),
        children_eligible: shown(eligible.length),
        enrolled: shown(enrolled.length),
      };
    });

  return { range, minimum_count: CAMPAIGN_MINIMUM_COUNT, campaigns };
}
