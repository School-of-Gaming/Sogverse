import type { QueryData } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/types";
import { walkPages } from "@/lib/supabase/paging";

// certifier joins through the certified_by FK (disambiguated from user_id, which
// is the other FK to profiles). Nullable — an un-certified gedu, or a backfilled
// one, has no certifier.
//
// The criminal record check's flag and moment ride the list read; the admin who
// recorded it does not, because no list surface names them — the users list and
// the assignment picker only ask *whether* the check stands. That name is read
// by the detail select below.
const GEDU_PROFILE_COLUMNS =
  "user_id, certified, certified_at, certified_by, criminal_record_check_passed, criminal_record_check_at, certifier:profiles!gedu_profiles_certified_by_fkey(first_name, last_name)";

/**
 * The list columns plus the two audit names the user-detail card prints: the
 * admin who certified this educator, and the admin who recorded their criminal
 * record extract.
 *
 * **This is the admin-facing read and only the admin-facing read.** The recorder
 * embed reaches into another admin's `profiles` row, which admin RLS permits and
 * a gedu's own session does not — so the gedu-facing standing reads below select
 * the flag and the moment from their own row and nothing else. Splitting the two
 * selects is what keeps that true by construction: there is no column list an
 * educator could be handed that names the admin who looked at their document.
 */
const GEDU_PROFILE_DETAIL_COLUMNS = `${GEDU_PROFILE_COLUMNS}, criminal_record_check_by, recorder:profiles!gedu_profiles_criminal_record_check_by_fkey(first_name, last_name)` as const;

/**
 * Shared builder so the embedded-certifier row type is inferred, not
 * hand-written. It asks for the exact count because its one caller walks pages
 * and needs to know when to stop.
 */
function geduProfilesQuery(supabase: AppSupabaseClient) {
  return supabase
    .from("gedu_profiles")
    .select(GEDU_PROFILE_COLUMNS, { count: "exact" });
}

/** The same, for the one read that also names the two acting admins. */
function geduProfileDetailQuery(supabase: AppSupabaseClient) {
  return supabase.from("gedu_profiles").select(GEDU_PROFILE_DETAIL_COLUMNS);
}

export type GeduCertification = QueryData<ReturnType<typeof geduProfilesQuery>>[number];

/**
 * One gedu's row as the admin user-detail card reads it — the list shape plus
 * the certifying and recording admins' names. A superset of `GeduCertification`,
 * so anything taking the narrower shape takes this too.
 */
export type GeduCertificationDetail = QueryData<
  ReturnType<typeof geduProfileDetailQuery>
>[number];

/**
 * Whether a gedu's account has been admin-certified.
 *
 * This is the **server-side** mod boundary for gedu-initiated actions on
 * instant voice rooms — creating a room, ending one, and being granted owner
 * (`is_owner`) power when joining one. Unlike the group-assignment gate (UI-only
 * by design, because only trusted admins assign), these are initiated by the
 * gedu themselves, so a UI gate is not enough and the check must live on the
 * server (see ./CLAUDE.md).
 *
 * Reads the gedu's own row via `.single()` — RLS lets a gedu read its own
 * `gedu_profiles` row, and every gedu has exactly one (written at registration),
 * so an absent row is a real error, not "uncertified". Callers decide how to
 * treat a thrown error: fail-closed to guest (the public token route) or surface
 * a 500 (the authenticated create/end routes).
 */
export async function isGeduCertified(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("gedu_profiles")
    .select("certified")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.certified;
}

/**
 * What the platform is allowed to know about one educator's criminal record
 * extract, and the whole of it: whether an acceptable one has been presented,
 * and when.
 *
 * There is no document, no reference number and no issue date here because
 * there are none anywhere — Finnish law 504/2002 has the educator obtain the
 * extract themselves and permits recording only the fact and the moment (see
 * ./CLAUDE.md). `recordedAt` is non-null exactly when `passed` is true.
 */
export interface GeduCriminalRecordCheck {
  passed: boolean;
  recordedAt: string | null;
}

/**
 * One gedu's criminal record check standing, read from their own row.
 *
 * Server-side, for the gedu surfaces that have to decide before first paint
 * whether to say anything about it — RLS lets a gedu read their own
 * `gedu_profiles` row, and every gedu has exactly one, so an absent row is a
 * real error rather than "no check". Callers decide what a thrown error means:
 * the contract page treats it as *unknown* and simply makes no claim, while the
 * dashboard's next-step band fails toward showing the band, because the two
 * ways of being wrong are not symmetrical there.
 */
export async function getGeduCriminalRecordCheck(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<GeduCriminalRecordCheck> {
  const { data, error } = await supabase
    .from("gedu_profiles")
    .select("criminal_record_check_passed, criminal_record_check_at")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return {
    passed: data.criminal_record_check_passed,
    recordedAt: data.criminal_record_check_at,
  };
}

export class GeduProfilesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Certification state for every gedu (admin-readable).
   *
   * Walked rather than selected: the admin users list marks a gedu as certified
   * from the presence of a certified row here, so a read truncated at
   * PostgREST's `max_rows` silently *drops* the mark from every certified gedu
   * that fell off the end — they render identically to an educator nobody has
   * approved, with nothing on screen to say the answer was cut short. Ordered by
   * the table's primary key, which is the total order the walk needs.
   */
  async getAll(): Promise<GeduCertification[]> {
    return walkPages("getAllGeduProfiles", (from, to) =>
      geduProfilesQuery(this.supabase).order("user_id").range(from, to),
    );
  }

  /**
   * Certification state for a single gedu, or null if none exists — read
   * through the detail select, so the card can name both acting admins.
   */
  async getOne(geduId: string): Promise<GeduCertificationDetail | null> {
    const { data, error } = await geduProfileDetailQuery(this.supabase)
      .eq("user_id", geduId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Certify or de-certify a gedu. The RPC stamps certified_at / certified_by. */
  async setCertified(geduId: string, certified: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("set_gedu_certified", {
      p_gedu_id: geduId,
      p_certified: certified,
    });
    if (error) throw error;
  }

  /**
   * Record — or withdraw — that an admin has seen an acceptable criminal record
   * extract (*rikostaustaote*) for this educator.
   *
   * The same shape as `setCertified` one column over, and for the same reason:
   * the flag, the moment and the acting admin are all stamped inside the RPC,
   * and `gedu_profiles` carries no write grant, so this is the only door in.
   * **Nothing out of the extract is passed, because there is nowhere to put
   * it** — Finnish law 504/2002 lets us record only that an acceptable document
   * was presented and when (see ./CLAUDE.md).
   */
  async setCriminalRecordCheck(geduId: string, passed: boolean): Promise<void> {
    const { error } = await this.supabase.rpc(
      "set_gedu_criminal_record_check",
      { p_gedu_id: geduId, p_passed: passed },
    );
    if (error) throw error;
  }
}
