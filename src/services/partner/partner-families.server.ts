import "server-only";

import { z } from "zod";

import { keysetInMemory, readPartnerPage } from "@/lib/api/partner-cursor.server";
import { chunkKeys, walkPages } from "@/lib/supabase/paging";
import type { GamerPhotoConsentType, MarketingConsentType, Profile } from "@/types";
import type {
  PartnerConsentState,
  PartnerFamiliesQuery,
  PartnerFamily,
  PartnerGamer,
  PartnerParent,
} from "./partner.contracts";
import { readInScopeSeats, type InScopeSeat } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  readBirthDates,
  readParentGamerLinks,
  readPlaces,
  readRobloxAccounts,
  type ParentGamerLink,
} from "./partner-shared-lookups.server";
import { toUtcIso } from "./partner-shared-values";

/**
 * `/families` — a parent and the children of theirs who are in scope.
 *
 * **There is no family row, so a family is computed.** Its members are the
 * people holding an in-scope seat: a gamer on their own seat, or a parent on a
 * seat they hold themselves. A family is the connected component those members
 * form through `parent_gamer`: every parent linked to an in-scope gamer joins
 * it, and a parent on their own seat is a family of their own unless a link to
 * an in-scope gamer joins them to one. `gamers` lists only the in-scope gamers;
 * a parent's other children never appear, and never connect two families.
 *
 * **Its key is its smallest parent id**, which is also the page order. A
 * component only exists once the whole set is resolved, so every page resolves
 * the whole in-scope set as ids — the seats, then their gamers' links — and
 * pages over it in memory. Only the page's own families are read in full.
 */

/** The consent type both of Lynx's consents are stored under. */
const LYNX_MARKETING: MarketingConsentType = "lynx_educate";
const LYNX_PHOTO: GamerPhotoConsentType = "lynx_educate";

// ---------------------------------------------------------------------------
// Assembling families from ids
// ---------------------------------------------------------------------------

/** A family before its people are read: who is in it, each list ascending by id. */
export interface FamilyMembers {
  parentIds: string[];
  gamerIds: string[];
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Group in-scope seats into families, ascending by each family's smallest
 * parent id. Pure: `links` are the `parent_gamer` rows of the seats' gamers.
 *
 * - A seat whose participant is its customer is a parent's own seat, and puts
 *   that parent in scope.
 * - Any other seat is a gamer's, and puts the gamer in scope together with
 *   every parent linked to them. A link to a gamer who is not in scope
 *   connects nothing.
 * - A gamer with no link at all is in no family. Deleting a gamer's last link
 *   deletes the gamer, so this is a gamer erased while the request was
 *   reading — and a family cannot be reported without a parent.
 */
export function assembleFamilies(
  seats: readonly Pick<InScopeSeat, "participant_id" | "customer_id">[],
  links: readonly ParentGamerLink[],
): FamilyMembers[] {
  const parents = new Set<string>();
  const seatedGamers = new Set<string>();
  for (const seat of seats) {
    if (seat.participant_id === seat.customer_id) parents.add(seat.participant_id);
    else seatedGamers.add(seat.participant_id);
  }

  const gamers = new Set<string>();
  const neighbours = new Map<string, string[]>();
  const connect = (from: string, to: string) => {
    const list = neighbours.get(from) ?? [];
    list.push(to);
    neighbours.set(from, list);
  };
  for (const link of links) {
    if (!seatedGamers.has(link.gamer_id)) continue;
    parents.add(link.parent_id);
    gamers.add(link.gamer_id);
    connect(link.parent_id, link.gamer_id);
    connect(link.gamer_id, link.parent_id);
  }

  // A gamer enters the graph only through a link, so every component holds a
  // parent, and a walk from each parent not yet reached finds each family once.
  const reached = new Set<string>();
  const families: FamilyMembers[] = [];
  for (const start of parents) {
    if (reached.has(start)) continue;
    reached.add(start);
    const family: FamilyMembers = { parentIds: [], gamerIds: [] };
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      (gamers.has(id) ? family.gamerIds : family.parentIds).push(id);
      for (const next of neighbours.get(id) ?? []) {
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    family.parentIds.sort(byId);
    family.gamerIds.sort(byId);
    families.push(family);
  }

  return families.sort((a, b) => byId(familyKey(a), familyKey(b)));
}

/**
 * A family's key and page position: its smallest parent id. Stable only while
 * each child has one parent, which is the app's rule today: a second parent
 * linked or unlinked mid-pull joins or splits a family, can move its smallest
 * parent id across the cursor, and so skips or repeats that family.
 */
function familyKey(family: FamilyMembers): string {
  return family.parentIds[0];
}

// ---------------------------------------------------------------------------
// The scope and the filters, as ids
// ---------------------------------------------------------------------------

/** Every parent whose Lynx marketing consent is granted right now. */
async function readGrantedParents(db: PartnerDb): Promise<Set<string>> {
  const rows = await walkPages("partner families granted marketing", (from, to) =>
    db
      .from("marketing_consents")
      .select("customer_id", { count: "exact" })
      .eq("consent_type", LYNX_MARKETING)
      .eq("granted", true)
      .order("customer_id")
      .range(from, to),
  );
  return new Set(rows.map((row) => row.customer_id));
}

/** Every account created through exactly this campaign — `eq` on text is case-sensitive. */
async function readCampaignParents(
  db: PartnerDb,
  campaign: string,
): Promise<Set<string>> {
  const rows = await walkPages("partner families campaign", (from, to) =>
    db
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("utm_campaign", campaign)
      .order("id")
      .range(from, to),
  );
  return new Set(rows.map((row) => row.id));
}

// ---------------------------------------------------------------------------
// The page's people
// ---------------------------------------------------------------------------
//
// Each read is one row per id — the primary key, or the primary key with the
// consent type fixed — so the chunk bounds the response and none of them walks.

/** The profile columns a family record reports, for parents and gamers alike. */
type FamilyProfile = Pick<
  Profile,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "created_at"
  | "home_location_id"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
>;

async function readProfiles(
  db: PartnerDb,
  ids: readonly string[],
): Promise<Map<string, FamilyProfile>> {
  const profiles = new Map<string, FamilyProfile>();
  for (const chunk of chunkKeys(ids)) {
    const { data, error } = await db
      .from("profiles")
      .select(
        "id, first_name, last_name, email, created_at, home_location_id, utm_source, utm_medium, utm_campaign",
      )
      .in("id", chunk);
    if (error) throw error;
    for (const row of data) profiles.set(row.id, row);
  }
  return profiles;
}

function consentState(row: { granted: boolean; updated_at: string }): PartnerConsentState {
  return { granted: row.granted, updated_at: toUtcIso(row.updated_at) };
}

/** Each parent's Lynx marketing consent as it stands; absent where never asked. */
async function readMarketingConsents(
  db: PartnerDb,
  parentIds: readonly string[],
): Promise<Map<string, PartnerConsentState>> {
  const consents = new Map<string, PartnerConsentState>();
  for (const chunk of chunkKeys(parentIds)) {
    const { data, error } = await db
      .from("marketing_consents")
      .select("customer_id, granted, updated_at")
      .eq("consent_type", LYNX_MARKETING)
      .in("customer_id", chunk);
    if (error) throw error;
    for (const row of data) consents.set(row.customer_id, consentState(row));
  }
  return consents;
}

/** Each gamer's Lynx media permission as it stands; absent where never asked. */
async function readPhotoConsents(
  db: PartnerDb,
  gamerIds: readonly string[],
): Promise<Map<string, PartnerConsentState>> {
  const consents = new Map<string, PartnerConsentState>();
  for (const chunk of chunkKeys(gamerIds)) {
    const { data, error } = await db
      .from("gamer_photo_consents")
      .select("gamer_id, granted, updated_at")
      .eq("consent_type", LYNX_PHOTO)
      .in("gamer_id", chunk);
    if (error) throw error;
    for (const row of data) consents.set(row.gamer_id, consentState(row));
  }
  return consents;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * One page of families, ascending by each family's smallest parent id.
 *
 * **The filters admit a whole family, and apply before paging.**
 * `marketing_consent=granted` admits a family in which any parent's Lynx
 * marketing consent is granted; `utm_campaign` one in which any parent's stored
 * campaign is exactly the value. Each is read once, as the set of parents it
 * admits, so a narrow filter costs one read however few families it keeps.
 *
 * **The cursor is a parent id, not an offset**, so a family that changes between
 * two pages — a seat added or cancelled, a consent withdrawn — appears or
 * disappears at its own position, and the families around it keep theirs. That
 * position holds only while each child has one parent, which is the app's rule
 * today: a second parent linked or unlinked mid-pull merges or splits a family,
 * can move its smallest parent id across the cursor, and may skip or repeat
 * that family on that pull; the next full pull reads it whole.
 *
 * **What a record reports is read for the page alone:** a parent's email only
 * while their own Lynx marketing consent is granted, a gamer's birth month from
 * the stored date of birth, and each consent as it stands now, `null` where the
 * person was never asked.
 *
 * A person deleted between the scope read and the page read is left out, and a
 * family left with no parent with them: the account is gone, which is what the
 * next pull reports. A home location that does not exist throws — the foreign
 * key nulls the column when a location is deleted, so it is a broken invariant.
 */
export async function readPartnerFamilies(
  db: PartnerDb,
  query: PartnerFamiliesQuery,
): Promise<{ data: PartnerFamily[]; next_cursor: string | null }> {
  const { marketing_consent, utm_campaign } = query;
  const [seats, granted, campaign] = await Promise.all([
    readInScopeSeats(db),
    marketing_consent === undefined ? null : readGrantedParents(db),
    utm_campaign === undefined ? null : readCampaignParents(db, utm_campaign),
  ]);

  const seatedGamerIds = [
    ...new Set(
      seats
        .filter((seat) => seat.participant_id !== seat.customer_id)
        .map((seat) => seat.participant_id),
    ),
  ];
  const families = assembleFamilies(
    seats,
    await readParentGamerLinks(db, "gamer_id", seatedGamerIds),
  ).filter(
    (family) =>
      (granted === null || family.parentIds.some((id) => granted.has(id))) &&
      (campaign === null || family.parentIds.some((id) => campaign.has(id))),
  );

  return readPartnerPage({
    resource: "families",
    query,
    key: z.string().uuid(),
    fetch: keysetInMemory(families, familyKey),
    keyOf: familyKey,
    build: async (rows) => {
      const parentIds = rows.flatMap((family) => family.parentIds);
      const gamerIds = rows.flatMap((family) => family.gamerIds);
      const [profiles, marketing, births, photo, roblox] = await Promise.all([
        readProfiles(db, [...parentIds, ...gamerIds]),
        readMarketingConsents(db, parentIds),
        readBirthDates(db, gamerIds),
        readPhotoConsents(db, gamerIds),
        readRobloxAccounts(db, gamerIds),
      ]);
      const places = await readPlaces(
        db,
        parentIds.flatMap((id) => profiles.get(id)?.home_location_id ?? []),
      );

      const parentOf = (id: string): PartnerParent[] => {
        const profile = profiles.get(id);
        if (profile === undefined) return [];
        let location: PartnerParent["location"] = null;
        if (profile.home_location_id !== null) {
          const place = places.get(profile.home_location_id);
          if (place === undefined) {
            throw new Error(
              `partner families: location ${profile.home_location_id} does not exist`,
            );
          }
          location = place.place;
        }
        const consent = marketing.get(id) ?? null;
        return [
          {
            id,
            first_name: profile.first_name,
            last_name: profile.last_name,
            email: consent?.granted === true ? profile.email : null,
            created_at: toUtcIso(profile.created_at),
            location,
            utm: {
              source: profile.utm_source,
              medium: profile.utm_medium,
              campaign: profile.utm_campaign,
            },
            marketing_consent: consent,
          },
        ];
      };

      const gamerOf = (id: string): PartnerGamer[] => {
        const profile = profiles.get(id);
        const birth = births.get(id);
        if (profile === undefined || birth === undefined) return [];
        return [
          {
            id,
            first_name: profile.first_name,
            created_at: toUtcIso(profile.created_at),
            birth_month: birth.slice(0, 7),
            roblox: roblox.get(id) ?? null,
            photo_consent: photo.get(id) ?? null,
          },
        ];
      };

      return rows.map((family): PartnerFamily | null => {
        const parents = family.parentIds.flatMap(parentOf);
        if (parents.length === 0) return null;
        return { parents, gamers: family.gamerIds.flatMap(gamerOf) };
      });
    },
  });
}
