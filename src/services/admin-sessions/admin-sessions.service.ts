import { GeduSessionsService } from "@/services/gedu-sessions/gedu-sessions.service";
import type { AppSupabaseClient } from "@/types";
import {
  adminProductSessions,
  type AdminProductSessions,
} from "./admin-sessions.contracts";

/**
 * The admin product page's session record: one read of its own, and every write
 * delegated to the module that already owns it.
 *
 * **The read is new because the question is new.** A gedu asks about one group
 * — theirs — and gets a workspace. An admin asks about one *product* and gets
 * every group on it, to choose between; answering that by calling the group
 * feed once per group would put the product shell and the venue on the wire
 * once per group as well, and would need a fan-in the page has no reason to
 * own.
 *
 * **The writes are not new, and are deliberately not reimplemented.** Since
 * 00200 the five RPCs behind a session record — the notes writer, the
 * per-mark register, the send's claim, the group notes and the site notes —
 * admit an admin beside the assigned gedu, and the report-email route admits
 * one too. The two session-photo routes are the same shape again: role-gated to
 * gedu **and** admin, with the RPC's assignment guard behind them doing the real
 * authorizing. They are the *same* wire: same functions, same arguments, same
 * refusals. So this class holds a `GeduSessionsService` and hands each call
 * straight to it rather than restating the RPC names, the null-status
 * convention or the error translation a second time. The delegations exist so
 * that the admin surface names one service — the house pattern — while there
 * stays exactly one implementation of each write.
 *
 * What *is* admin-specific lives one level up, in the query hooks: which cache
 * key a successful write invalidates.
 */
export class AdminSessionsService {
  private readonly sessions: GeduSessionsService;

  constructor(private supabase: AppSupabaseClient) {
    this.sessions = new GeduSessionsService(supabase);
  }

  /**
   * Every group on one product, with its standing notes, its register roster
   * and its whole stored history, in a single round trip.
   *
   * A perceptibly heavy call — a term of sessions per group, times every group
   * — which is why the panel built on it renders a structured skeleton the
   * moment it mounts rather than waiting to find out.
   */
  async getProductSessions(productId: string): Promise<AdminProductSessions> {
    const { data, error } = await this.supabase.rpc(
      "get_admin_product_sessions",
      { p_product_id: productId },
    );

    if (error) throw error;
    return adminProductSessions.parse(data);
  }

  /** @see GeduSessionsService.setSessionNotes */
  setSessionNotes(args: {
    groupId: string;
    sessionDate: string;
    report: string;
    geduNote: string;
  }) {
    return this.sessions.setSessionNotes(args);
  }

  /** @see GeduSessionsService.recordAttendance */
  recordAttendance(args: Parameters<GeduSessionsService["recordAttendance"]>[0]) {
    return this.sessions.recordAttendance(args);
  }

  /** @see GeduSessionsService.emailSessionReport */
  emailSessionReport(args: { groupId: string; sessionDate: string }) {
    return this.sessions.emailSessionReport(args);
  }

  /** @see GeduSessionsService.addSessionImage */
  addSessionImage(args: Parameters<GeduSessionsService["addSessionImage"]>[0]) {
    return this.sessions.addSessionImage(args);
  }

  /** @see GeduSessionsService.deleteSessionImage */
  deleteSessionImage(imageId: string) {
    return this.sessions.deleteSessionImage(imageId);
  }

  /** @see GeduSessionsService.setGroupNotes */
  setGroupNotes(args: {
    groupId: string;
    publicNote: string;
    geduNote: string;
  }) {
    return this.sessions.setGroupNotes(args);
  }

  /** @see GeduSessionsService.setSiteNotes */
  setSiteNotes(args: {
    locationId: string;
    publicNote: string;
    geduNote: string;
  }) {
    return this.sessions.setSiteNotes(args);
  }
}
