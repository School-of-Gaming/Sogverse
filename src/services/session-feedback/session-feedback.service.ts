import type { SessionFeedbackResult } from "@/components/voice/feedback/session-feedback-items";
import type { SessionFeedbackInitialState } from "@/components/voice/feedback/SessionFeedbackScreen";
import type { AppSupabaseClient, SessionFeedbackRowInsert } from "@/types";
import {
  answersForStorage,
  noteForStorage,
  storedSessionFeedback,
} from "./session-feedback.contracts";

/**
 * What one child answered on the way out of one online session, over the
 * injected Supabase client.
 *
 * **Both calls are direct, RLS-scoped statements — there is no function and no
 * route**, because the boundary is already written as policies: a row may only
 * carry the caller's own id, and only for a group they hold an active seat in.
 * A guarded RPC would be a second spelling of that, and it would have to
 * re-derive the session window from the schedule to say anything the policies
 * do not already say.
 *
 * The window instant is supplied by the caller, from the voice token response
 * the room already holds. It is client-asserted by design: the column bounds
 * nothing, so a forged value can only mis-key the forger's own row.
 */
export interface SessionFeedbackKey {
  /** A `product_groups.id` — the group the session belongs to. */
  groupId: string;
  /** The instant the session window opened, as the token response gave it. */
  sessionOpensAt: string;
}

export interface SaveSessionFeedbackInput extends SessionFeedbackKey {
  /** What the screen collected, skips and all. */
  result: SessionFeedbackResult;
}

export class SessionFeedbackService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The caller's own row for one group and window, or `null` when they have not
   * answered in it yet.
   *
   * `.maybeSingle()` because no row is the ordinary first-time answer rather
   * than a failure, and the three columns filtered on are the table's whole
   * primary key, so at most one row can match. The participant is named
   * explicitly even though the SELECT policy confines the read to the caller
   * anyway — the query then addresses the key it was designed around rather
   * than leaning on a policy to finish the predicate.
   */
  async getOwn(key: SessionFeedbackKey): Promise<SessionFeedbackInitialState | null> {
    const participantId = await this.currentParticipantId();

    const { data, error } = await this.supabase
      .from("session_feedback")
      .select("answers, note")
      .eq("group_id", key.groupId)
      .eq("participant_id", participantId)
      .eq("session_opens_at", key.sessionOpensAt)
      .maybeSingle();

    if (error) throw error;
    if (data === null) return null;
    return storedSessionFeedback.parse(data);
  }

  /**
   * Write what the child pressed Done on, replacing whatever they had answered
   * in this window before.
   *
   * **The last Done wins**, which is why this is an upsert on the natural key
   * rather than an insert: a child who drops out, rejoins and leaves again is
   * answering the same question a second time, and the record is whatever they
   * last pressed Done on — including an emptied form, which is an update with
   * an empty object and an empty note and never a delete.
   */
  async save(input: SaveSessionFeedbackInput): Promise<void> {
    const participantId = await this.currentParticipantId();

    const row: SessionFeedbackRowInsert = {
      group_id: input.groupId,
      participant_id: participantId,
      session_opens_at: input.sessionOpensAt,
      answers: answersForStorage(input.result.answers),
      note: noteForStorage(input.result.note),
    };

    const { error } = await this.supabase
      .from("session_feedback")
      .upsert(row, { onConflict: "group_id,participant_id,session_opens_at" });

    if (error) throw error;
  }

  /**
   * Who the caller is, from the locally-verified access token.
   *
   * `getClaims()` reads the identity the row is keyed by — and is the same `sub`
   * the policies compare against — without a GoTrue round trip. A session that
   * cannot answer is a failure here rather than a row keyed to nobody.
   */
  private async currentParticipantId(): Promise<string> {
    const { data, error } = await this.supabase.auth.getClaims();
    if (error) throw error;

    const participantId = data?.claims.sub;
    if (!participantId) throw new Error("No signed-in participant");
    return participantId;
  }
}
