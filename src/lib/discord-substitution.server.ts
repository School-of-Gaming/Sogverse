import "server-only";
import { joinGeduSeatRows } from "@/components/gedu/gedu-seat-rows";
import { SESSION_RECORDING_EPOCH } from "@/lib/constants";
import {
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  alreadyRequestedSessionKeys,
  buildGeduUpcomingSessions,
  type GeduUpcomingSession,
} from "@/lib/gedu-upcoming-sessions";
import { createAdminClient } from "@/lib/supabase/admin";
// The modules by name rather than the package indexes: those re-export
// `"use client"` query hooks, which a server module has no business loading.
import { parseMyAssignedProductRows } from "@/services/assignments/assignments.service";
import { geduAssignmentSummaries } from "@/services/gedu-sessions/gedu-sessions.contracts";
import {
  liveSubstitutionRequests,
  substitutionRequestDocument,
  type SubstitutionRequestDocument,
} from "@/services/session-substitution/session-substitution.contracts";
import type { SubstitutionReason } from "@/types";
import {
  DISCORD_GEDU_NOT_LINKED_SQLSTATE,
  discordLinkedGedu,
} from "./discord-substitution.contracts";

/**
 * The Discord bot's side of "I can't make this session" — the `/sub` command.
 *
 * The bot has no Sogverse session, only the caller's Discord user id, so every
 * call here goes through the service-role client to a function granted to
 * `service_role` alone, which first resolves that id to the gedu account linked
 * to it. Everything past the resolution is the web's own: the seat reads and
 * the filing write are the very bodies the Substitutions page reaches through
 * `auth.uid()` — the gedu's live requests included — and their results parse
 * through the web's own schemas.
 *
 * **An unlinked caller is one refusal, P0031**, raised by every function when
 * the Discord id has no gedu account linked to it. The reads answer it as
 * `null`; the filing throws it, like every other refusal, for the route to tell
 * apart with {@link isDiscordGeduNotLinked}.
 */

/** The gedu a Discord user acts as. */
export interface DiscordGedu {
  profileId: string;
  /**
   * The gedu's chosen app locale, or `null` when they never chose one (or the
   * stored value is not a locale the app offers) — the bot's cue to fall back
   * to the language Discord reports.
   */
  locale: SupportedLocale | null;
}

/** Whether an error is the "no gedu account linked to this Discord user" refusal. */
export function isDiscordGeduNotLinked(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === DISCORD_GEDU_NOT_LINKED_SQLSTATE
  );
}

/**
 * Which gedu this Discord user acts as, or `null` when no gedu account is
 * linked to them. When several are, the most recently linked one.
 */
export async function resolveDiscordGedu(
  discordUserId: string,
): Promise<DiscordGedu | null> {
  const { data, error } = await createAdminClient().rpc(
    "get_gedu_for_discord_user",
    { p_discord_user_id: discordUserId },
  );
  if (error) {
    if (isDiscordGeduNotLinked(error)) return null;
    throw error;
  }
  const gedu = discordLinkedGedu.parse(data);
  return {
    profileId: gedu.profile_id,
    locale: isSupportedLocale(gedu.locale) ? gedu.locale : null,
  };
}

/**
 * The sessions this Discord user's gedu could file an absence for, soonest
 * first — the list the Substitutions page's picker offers, built from the same
 * two seat reads through the same expansion. `null` when no gedu account is
 * linked to them.
 *
 * **A session the gedu has already asked a substitute for is left out.** The
 * web picker shows it disabled with the reason; a Discord dropdown cannot
 * disable an option, and an option that can only be refused is worse than none.
 * Which sessions those are is the gedu's live requests — the third read here,
 * the same one the web makes, and the very condition the write refuses a
 * second filing on. The write's own refusal still stands behind it, for a
 * filing made elsewhere between the list and the press.
 *
 * The locale names the products, so it is the caller's choice: the gedu's own
 * from {@link resolveDiscordGedu}, or Discord's when they have none.
 */
export async function getDiscordGeduUpcomingSessions({
  discordUserId,
  locale,
  now,
}: {
  discordUserId: string;
  locale: SupportedLocale;
  now: Date;
}): Promise<GeduUpcomingSession[] | null> {
  const supabase = createAdminClient();
  const [rows, summaries, liveRequests] = await Promise.all([
    supabase.rpc("get_assigned_products_for_discord_user", {
      p_discord_user_id: discordUserId,
    }),
    supabase.rpc("get_gedu_assignment_summaries_for_discord_user", {
      p_discord_user_id: discordUserId,
      p_epoch_date: SESSION_RECORDING_EPOCH,
    }),
    supabase.rpc("get_live_substitution_requests_for_discord_user", {
      p_discord_user_id: discordUserId,
    }),
  ]);

  for (const { error } of [rows, summaries, liveRequests]) {
    if (error && isDiscordGeduNotLinked(error)) return null;
  }
  if (rows.error) throw rows.error;
  if (summaries.error) throw summaries.error;
  if (liveRequests.error) throw liveRequests.error;

  const alreadyRequested = alreadyRequestedSessionKeys(
    liveSubstitutionRequests.parse(liveRequests.data),
  );
  return buildGeduUpcomingSessions({
    rows: joinGeduSeatRows(
      parseMyAssignedProductRows(rows.data),
      geduAssignmentSummaries.parse(summaries.data),
    ),
    locale,
    now,
  }).filter((session) => !alreadyRequested.has(session.key));
}

/**
 * File "I can't make this session" for this Discord user's gedu, returning the
 * request document as the filer reads it.
 *
 * **Every refusal throws the Supabase error unchanged**, so the web's own
 * mapper (`substitutionRequestFailureKey`) reads it exactly as it reads the
 * page's — plus the not-linked refusal, which {@link isDiscordGeduNotLinked}
 * recognises and the mapper leaves to the generic line.
 *
 * An empty or blank note is not sent at all: the function's parameter carries a
 * SQL default, and an empty string would be stored as one.
 */
export async function fileDiscordSubstitutionRequest({
  discordUserId,
  groupId,
  sessionDate,
  reason,
  reasonNote,
}: {
  discordUserId: string;
  groupId: string;
  /** Product-local `YYYY-MM-DD`, as a {@link GeduUpcomingSession} carries it. */
  sessionDate: string;
  reason: SubstitutionReason;
  reasonNote?: string;
}): Promise<SubstitutionRequestDocument> {
  const note = reasonNote?.trim() ?? "";
  const { data, error } = await createAdminClient().rpc(
    "request_session_substitution_for_discord_user",
    {
      p_discord_user_id: discordUserId,
      p_group_id: groupId,
      p_session_date: sessionDate,
      p_reason: reason,
      ...(note.length > 0 ? { p_reason_note: note } : {}),
    },
  );
  if (error) throw error;
  return substitutionRequestDocument.parse(data);
}
