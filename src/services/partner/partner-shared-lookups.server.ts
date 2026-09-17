import "server-only";

import { z } from "zod";

import { chunkKeys, walkPages } from "@/lib/supabase/paging";
import { LocationsService } from "@/services/locations/locations.service";
import {
  ATTENDANCE_MARK,
  isoDate,
  type PartnerAcceptedDocument,
  type PartnerAttendanceMark,
} from "./partner.contracts";
import type { InScopeSeat } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  PROGRAMME_PRIVACY_SLUG,
  PROGRAMME_TERMS_SLUG,
  isRecordedSession,
  isRobloxUrl,
  resolvePlace,
  toUtcIso,
  type ResolvedPlace,
} from "./partner-shared-values";

/**
 * Batched lookups more than one partner resource needs, each keyed by ids the
 * caller already holds: a page of seats, a family's people, a set of groups.
 * Every one takes the client first and returns a map, so a record builder
 * resolves a row with a `get` and never issues a read per row.
 *
 * Key lists are de-duplicated and chunked; a lookup that can return several
 * rows per key walks each chunk as well (`src/lib/supabase/CLAUDE.md`). An id
 * with nothing on file is simply absent from the returned map.
 */

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/**
 * Each location id's place as the API names it — see `resolvePlace`.
 * Through the locations service's keyed chain read, so the ancestor walk is the
 * same one every other surface uses; a retired location still resolves.
 */
export async function readPlaces(
  db: PartnerDb,
  locationIds: readonly string[],
): Promise<Map<string, ResolvedPlace>> {
  const locations = await new LocationsService(db).getLocationsByIds(
    unique(locationIds),
  );
  return new Map(locations.map((location) => [location.id, resolvePlace(location)]));
}

// ---------------------------------------------------------------------------
// Product names
// ---------------------------------------------------------------------------

/**
 * Each product's names, locale → name, exactly as `product_translations` holds
 * them. Every product has at least one (a database guarantee), so a product id
 * absent from the map is not a product.
 */
export async function readProductNames(
  db: PartnerDb,
  productIds: readonly string[],
): Promise<Map<string, Record<string, string>>> {
  const names = new Map<string, Record<string, string>>();
  for (const chunk of chunkKeys(unique(productIds))) {
    // One row per locale per product: walked, the chunk bounds only the URL.
    const rows = await walkPages("partner product names", (from, to) =>
      db
        .from("product_translations")
        .select("product_id, locale, name", { count: "exact" })
        .in("product_id", chunk)
        .order("product_id")
        .order("locale")
        .range(from, to),
    );
    for (const row of rows) {
      const entry = names.get(row.product_id) ?? {};
      entry[row.locale] = row.name;
      names.set(row.product_id, entry);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Programme consents on a seat
// ---------------------------------------------------------------------------

/** The two Programme documents an enrolment reports as accepted. */
export interface SeatConsents {
  terms: PartnerAcceptedDocument;
  privacy_policy: PartnerAcceptedDocument;
}

export type ConsentSeat = Pick<
  InScopeSeat,
  "id" | "customer_id" | "participant_id" | "product_id" | "signed_up_at"
>;

/**
 * A document version is free text in the database and a date on the wire.
 * A version that is not a real calendar date throws: admins publish versions,
 * admins are trusted, and a loud 500 is the accepted handling of the one state
 * the admin UI should never have produced.
 */
function versionDate(slug: string, version: string): string {
  const parsed = isoDate.safeParse(version);
  if (!parsed.success) {
    throw new Error(
      `partner consents: ${slug} version ${JSON.stringify(version)} is not a YYYY-MM-DD date`,
    );
  }
  return parsed.data;
}

/**
 * The Programme's terms and privacy policy as each seat accepted them, keyed by
 * seat id. Every seat passed in gets an entry.
 *
 * - **An acceptance on file** (for this seat's customer, participant and
 *   product) reports the latest one accepted at or before `now`: its version and
 *   when it was accepted.
 * - **None on file** is still consented (an owner decision): an admin moved the
 *   seat, the requirement arrived after it, or it predates acceptance tracking,
 *   and in each an admin acted for the parent. It reports the latest version
 *   published on or before the seat's sign-up day (UTC), else the earliest
 *   version there is, accepted at the seat's `signed_up_at`.
 *
 * A document with no published version at all throws — there is no version to
 * report and no honest way to invent one.
 */
export async function readSeatConsents(
  db: PartnerDb,
  seats: readonly ConsentSeat[],
  now: Date,
): Promise<Map<string, SeatConsents>> {
  const result = new Map<string, SeatConsents>();
  if (seats.length === 0) return result;

  const slugs = [PROGRAMME_TERMS_SLUG, PROGRAMME_PRIVACY_SLUG];

  const versionRows = await walkPages("partner consent versions", (from, to) =>
    db
      .from("consent_document_versions")
      .select("document_slug, version", { count: "exact" })
      .in("document_slug", slugs)
      .order("document_slug")
      .order("version")
      .range(from, to),
  );
  const versions = new Map<string, string[]>(slugs.map((slug) => [slug, []]));
  for (const row of versionRows) {
    versions.get(row.document_slug)?.push(versionDate(row.document_slug, row.version));
  }
  for (const [slug, dates] of versions) {
    if (dates.length === 0) {
      throw new Error(`partner consents: ${slug} has no published version`);
    }
    dates.sort();
  }

  const latest = new Map<string, { version: string; accepted_at: string }>();
  const seatKey = (customer: string, participant: string, product: string, slug: string) =>
    `${customer}|${participant}|${product}|${slug}`;
  const wantedProducts = new Set(seats.map((seat) => seat.product_id));

  for (const chunk of chunkKeys(unique(seats.map((seat) => seat.participant_id)))) {
    // An acceptance is a history row with no uniqueness, so several per key:
    // walked. Ordered by accepted time, then id, so the last one kept per key
    // is the latest and a tie resolves the same way on every read.
    const rows = await walkPages("partner consent acceptances", (from, to) =>
      db
        .from("consent_acceptances")
        .select(
          "id, customer_id, participant_id, product_id, document_slug, document_version, accepted_at",
          { count: "exact" },
        )
        .in("participant_id", chunk)
        .in("document_slug", slugs)
        .lte("accepted_at", now.toISOString())
        .order("accepted_at")
        .order("id")
        .range(from, to),
    );
    for (const row of rows) {
      if (!wantedProducts.has(row.product_id)) continue;
      latest.set(
        seatKey(row.customer_id, row.participant_id, row.product_id, row.document_slug),
        {
          version: versionDate(row.document_slug, row.document_version),
          accepted_at: toUtcIso(row.accepted_at),
        },
      );
    }
  }

  const fallback = (slug: string, seat: ConsentSeat): PartnerAcceptedDocument => {
    const dates = versions.get(slug) ?? [];
    const signedUpDay = toUtcIso(seat.signed_up_at).slice(0, 10);
    const onOrBefore = dates.filter((date) => date <= signedUpDay);
    return {
      version: onOrBefore.length > 0 ? onOrBefore[onOrBefore.length - 1] : dates[0],
      accepted_at: toUtcIso(seat.signed_up_at),
    };
  };

  for (const seat of seats) {
    const document = (slug: string) =>
      latest.get(seatKey(seat.customer_id, seat.participant_id, seat.product_id, slug)) ??
      fallback(slug, seat);
    result.set(seat.id, {
      terms: document(PROGRAMME_TERMS_SLUG),
      privacy_policy: document(PROGRAMME_PRIVACY_SLUG),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Creations
// ---------------------------------------------------------------------------

/** One published creation, as the enrolment reports it. */
export interface Creation {
  title: string;
  url: string;
  is_roblox_url: boolean;
}

/** The map key for a (group, participant) pair. */
export function creationKey(groupId: string, participantId: string): string {
  return `${groupId}|${participantId}`;
}

/** The stored list's shape; the table's CHECK already guarantees it. */
const storedCreations = z.array(z.object({ title: z.string(), url: z.string() }));

/**
 * The creations a participant published in a group, keyed by `creationKey`, in
 * the order the Game Educator listed them. A pair with no list is absent from
 * the map — report it as `[]`.
 */
export async function readCreations(
  db: PartnerDb,
  pairs: readonly { group_id: string; participant_id: string }[],
): Promise<Map<string, Creation[]>> {
  const creations = new Map<string, Creation[]>();
  const wanted = new Set(pairs.map((pair) => creationKey(pair.group_id, pair.participant_id)));

  for (const chunk of chunkKeys(unique(pairs.map((pair) => pair.participant_id)))) {
    const chunkSet = new Set(chunk);
    const groups = unique(
      pairs.filter((pair) => chunkSet.has(pair.participant_id)).map((pair) => pair.group_id),
    );
    // A participant's lists across groups, per group chunk: the pair is the
    // key, but a participant and a group list cross into more rows than either.
    for (const groupChunk of chunkKeys(groups)) {
      const rows = await walkPages("partner creations", (from, to) =>
        db
          .from("gamer_group_creations")
          .select("group_id, participant_id, creations", { count: "exact" })
          .in("participant_id", chunk)
          .in("group_id", groupChunk)
          .order("group_id")
          .order("participant_id")
          .range(from, to),
      );
      for (const row of rows) {
        const key = creationKey(row.group_id, row.participant_id);
        if (!wanted.has(key)) continue;
        creations.set(
          key,
          storedCreations.parse(row.creations).map((creation) => ({
            title: creation.title,
            url: creation.url,
            is_roblox_url: isRobloxUrl(creation.url),
          })),
        );
      }
    }
  }
  return creations;
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

/** One `parent_gamer` row: a parent and one of their gamers. */
export interface ParentGamerLink {
  parent_id: string;
  gamer_id: string;
}

/**
 * The `parent_gamer` links of these people, read from either end: by
 * `gamer_id` for a set of gamers' parents, by `parent_id` for a set of parents'
 * gamers. Ascending by link id within each chunk of ids.
 *
 * Unique per pair, not per person — a gamer may have a second parent, a parent
 * several gamers — so the chunk bounds only the URL and each chunk is walked.
 */
export async function readParentGamerLinks(
  db: PartnerDb,
  by: "parent_id" | "gamer_id",
  ids: readonly string[],
): Promise<ParentGamerLink[]> {
  const links: ParentGamerLink[] = [];
  for (const chunk of chunkKeys(unique(ids))) {
    links.push(
      ...(await walkPages("partner parent-gamer links", (from, to) =>
        db
          .from("parent_gamer")
          .select("parent_id, gamer_id", { count: "exact" })
          .in(by, chunk)
          .order("id")
          .range(from, to),
      )),
    );
  }
  return links;
}

/**
 * Each gamer's stored date of birth, `YYYY-MM-DD` and always the 1st, keyed by
 * gamer id. One row per id — the primary key — so bounded by the chunk. A
 * gamer with no profile row is absent from the map.
 */
export async function readBirthDates(
  db: PartnerDb,
  gamerIds: readonly string[],
): Promise<Map<string, string>> {
  const births = new Map<string, string>();
  for (const chunk of chunkKeys(unique(gamerIds))) {
    const { data, error } = await db
      .from("gamer_profiles")
      .select("user_id, date_of_birth")
      .in("user_id", chunk);
    if (error) throw error;
    for (const row of data) births.set(row.user_id, row.date_of_birth);
  }
  return births;
}

// ---------------------------------------------------------------------------
// Roblox accounts
// ---------------------------------------------------------------------------

/** A Roblox account as the API reports it. */
export interface RobloxAccount {
  username: string;
  user_id: number | null;
  verified: boolean;
}

/**
 * Each profile's Roblox account, keyed by profile id. Only a profile with a
 * username on file has an entry: a row whose username was cleared (unlinking
 * clears rather than deletes) is no account, reported as `roblox: null`.
 * `verified` means Roblox confirmed the handle, which is exactly when its
 * numeric id is on file.
 */
export async function readRobloxAccounts(
  db: PartnerDb,
  profileIds: readonly string[],
): Promise<Map<string, RobloxAccount>> {
  const accounts = new Map<string, RobloxAccount>();
  for (const chunk of chunkKeys(unique(profileIds))) {
    // Keyed on the primary key: one row per id, bounded by the chunk.
    const { data, error } = await db
      .from("roblox_accounts")
      .select("user_id, roblox_username, roblox_user_id")
      .in("user_id", chunk);
    if (error) throw error;
    for (const row of data) {
      if (row.roblox_username === null || row.roblox_username.trim() === "") continue;
      accounts.set(row.user_id, {
        username: row.roblox_username,
        user_id: row.roblox_user_id,
        verified: row.roblox_user_id !== null,
      });
    }
  }
  return accounts;
}

// ---------------------------------------------------------------------------
// Recorded sessions
// ---------------------------------------------------------------------------

/** One attendance mark on a session. */
export interface AttendanceMark {
  participant_id: string;
  status: PartnerAttendanceMark;
}

/** A session that exists for the API, with its attendance marks. */
export interface RecordedSession {
  id: string;
  group_id: string;
  session_date: string;
  starts_at: string;
  ends_at: string;
  attendance: AttendanceMark[];
}

function isAttendanceMark(status: string): status is PartnerAttendanceMark {
  return (ATTENDANCE_MARK as readonly string[]).includes(status);
}

/**
 * Each session's attendance marks, keyed by session id, ascending by
 * participant. Chunked for the URL and walked for the rows: a session carries a
 * mark per child on the roster, so a chunk of sessions is not a bound on what
 * comes back. A session with no marks is absent from the map.
 */
export async function readAttendance(
  db: PartnerDb,
  sessionIds: readonly string[],
): Promise<Map<string, AttendanceMark[]>> {
  const marks = new Map<string, AttendanceMark[]>();
  for (const chunk of chunkKeys(unique(sessionIds))) {
    const rows = await walkPages("partner session attendance", (from, to) =>
      db
        .from("session_attendance")
        .select("session_id, participant_id, status", { count: "exact" })
        .in("session_id", chunk)
        .order("session_id")
        .order("participant_id")
        .range(from, to),
    );
    for (const row of rows) {
      // The table's CHECK admits exactly these two; narrowed, not filtered.
      if (!isAttendanceMark(row.status)) {
        throw new Error(
          `partner session attendance: session ${row.session_id} carries status ${row.status}`,
        );
      }
      const list = marks.get(row.session_id) ?? [];
      list.push({ participant_id: row.participant_id, status: row.status });
      marks.set(row.session_id, list);
    }
  }
  return marks;
}

/**
 * Each group's recorded sessions — a written report or at least one attendance
 * mark (`isRecordedSession`) — keyed by group id, ascending by session id, with
 * the marks attached. A group with none is absent from the map.
 *
 * Timestamps are as stored; normalise with `toUtcIso` when emitting them.
 */
export async function readRecordedSessionsByGroup(
  db: PartnerDb,
  groupIds: readonly string[],
): Promise<Map<string, RecordedSession[]>> {
  const sessions: {
    id: string;
    group_id: string;
    session_date: string;
    starts_at: string;
    ends_at: string;
    report: string | null;
  }[] = [];
  for (const chunk of chunkKeys(unique(groupIds))) {
    sessions.push(
      ...(await walkPages("partner group sessions", (from, to) =>
        db
          .from("group_sessions")
          .select("id, group_id, session_date, starts_at, ends_at, report", {
            count: "exact",
          })
          .in("group_id", chunk)
          .order("id")
          .range(from, to),
      )),
    );
  }

  const marks = await readAttendance(
    db,
    sessions.map((session) => session.id),
  );

  const byGroup = new Map<string, RecordedSession[]>();
  for (const session of [...sessions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const attendance = marks.get(session.id) ?? [];
    if (!isRecordedSession(session.report, attendance.length)) continue;
    const list = byGroup.get(session.group_id) ?? [];
    list.push({
      id: session.id,
      group_id: session.group_id,
      session_date: session.session_date,
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      attendance,
    });
    byGroup.set(session.group_id, list);
  }
  return byGroup;
}
