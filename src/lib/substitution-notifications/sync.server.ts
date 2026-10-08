import "server-only";
import { createHash } from "node:crypto";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import {
  editDiscordMessage,
  isDiscordBotConfigured,
  isPermanentDiscordDmError,
  openDiscordDmChannel,
  sendDiscordChannelMessage,
} from "@/lib/discord-api.server";
import { discordSubLogoUrl } from "@/lib/discord-substitution-message";
import { sendableImageOrigin } from "@/lib/email-templates/render-context";
import {
  isSlackSubstitutionsConfigured,
  postSlackBlocks,
  slackSubstitutionsChannelId,
  updateSlackMessage,
} from "@/lib/slack-api.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildSubstitutionAcceptedDm,
  buildSubstitutionOfferDm,
  loadDiscordSubOfferCopy,
  substitutionDmSession,
  type DiscordSubOfferCopy,
  type SubstitutionDmSession,
} from "./discord-dm-message";
import { buildSubstitutionSlackMessage } from "./slack-message";
import {
  substitutionNotificationSnapshot,
  type SnapshotCandidate,
  type SnapshotDm,
  type SnapshotNotification,
  type SubstitutionNotificationSnapshot,
} from "./snapshot.contracts";
import { deriveNotificationState, type NotificationState } from "./state";

/**
 * **The notification sync**: drains the outbox the database fills whenever a
 * substitution request, an answer to it or its session's cancellation
 * changes, and brings that request's messages up to date — the Discord DMs to
 * the gedus it could go to, the DM to the gedu seated on it, and the Slack
 * message in the staff channel.
 *
 * **The outbox lease is the concurrency.** A claim leases one request to one
 * worker; a change while it syncs bumps the row's seq, so the finish hands the
 * row back due and the drain claims it again. Everything here is idempotent
 * against the stored message records: a DM or a Slack message is posted only
 * where none is recorded, and edited only where its rendering's hash moved.
 *
 * **Announcing happens once, the first time a sync finds the request open.** A
 * request filed already substituted and never open is never announced, so it
 * sends nothing; one cleared back to open is announced then. Once announced,
 * every change updates the messages, whatever state the request is in.
 *
 * Order within one request: the announced row, the DMs, the Slack message
 * last, so the Slack message's tags say who was reached. A DM Discord refuses
 * for good is recorded and never retried; any other DM failure lets the rest
 * of the sync finish and then fails the job, which the outbox retries with
 * backoff. Discord and Slack are each skipped where this environment has no
 * credentials for them.
 *
 * Every read and write is the service role's: the snapshot carries the
 * absence reason, and the message tables have no policy at all.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/** How long one drain keeps claiming, inside a 60-second function. */
const DRAIN_BUDGET_MS = 50_000;

export interface DrainResult {
  /** Requests synced without error. */
  synced: number;
  /** Requests whose sync failed; their outbox rows retry with backoff. */
  failed: number;
  /** Whether the drain stopped on its time budget rather than an empty outbox. */
  outOfTime: boolean;
}

/**
 * Sync every due request, one claim at a time, until the outbox has nothing
 * due or the time budget is spent. `requestIds` narrows it to the requests a
 * button press just changed, so the press redraws its own messages in-process;
 * a request another worker already holds is left to that worker, whose finish
 * sees the change and runs it again.
 *
 * One claim at a time so a drain cut short by its budget never holds a lease
 * it will not use.
 */
export async function drainSubstitutionNotifications({
  requestIds,
  budgetMs = DRAIN_BUDGET_MS,
}: {
  requestIds?: readonly string[];
  budgetMs?: number;
} = {}): Promise<DrainResult> {
  const supabase = createAdminClient();
  const deadline = Date.now() + budgetMs;
  const result: DrainResult = { synced: 0, failed: 0, outOfTime: false };

  while (Date.now() < deadline) {
    const claim = await supabase.rpc("claim_substitution_notification_jobs", {
      p_limit: 1,
      ...(requestIds === undefined ? {} : { p_request_ids: [...requestIds] }),
    });
    if (claim.error) throw claim.error;
    const job = claim.data.at(0);
    if (job === undefined) return result;

    let failure: string | null = null;
    try {
      await syncRequest(job.request_id, supabase);
    } catch (error) {
      failure = describeError(error);
      console.error(`Substitution notification sync failed for ${job.request_id}:`, error);
    }

    const finish = await supabase.rpc("finish_substitution_notification_job", {
      p_request_id: job.request_id,
      p_seq: job.seq,
      ...(failure === null ? {} : { p_error: failure }),
    });
    if (finish.error) throw finish.error;
    if (failure === null) result.synced += 1;
    else result.failed += 1;
  }

  result.outOfTime = true;
  return result;
}

/**
 * Bring one request's messages up to date with the request as it stands now.
 * Throws when anything worth retrying failed; the caller records it on the
 * outbox row.
 */
export async function syncRequest(
  requestId: string,
  supabase: AdminClient = createAdminClient(),
): Promise<void> {
  const read = await supabase.rpc("get_substitution_notification_snapshot", {
    p_request_id: requestId,
  });
  if (read.error) throw read.error;
  // No request: deleted since it was enqueued, and its records went with it.
  if (read.data === null) return;
  const snapshot = substitutionNotificationSnapshot.parse(read.data);
  const state = deriveNotificationState(snapshot);

  let notification = snapshot.notification;
  if (notification === null) {
    // Never announced and not open — filed already substituted, say — is
    // silent: there is nothing anybody has to answer.
    if (state.kind !== "open") return;
    const inserted = await supabase
      .from("substitution_notifications")
      .insert({ request_id: requestId, announced_at: new Date().toISOString() })
      .select()
      .single();
    if (inserted.error) throw inserted.error;
    notification = inserted.data;
  }

  const dms = new Map(snapshot.dms.map((dm) => [dm.gedu_id, dm]));
  let deferred: unknown = null;

  if (isDiscordBotConfigured()) {
    const discord = new DmSync(supabase, snapshot, state, dms);
    deferred = await discord.run();
  }

  if (isSlackSubstitutionsConfigured()) {
    await syncSlack(supabase, snapshot, state, notification, [...dms.values()]);
  }

  if (deferred !== null) throw deferred;
}

// ---------------------------------------------------------------- the DMs

/** The DMs of one request, and the records they are kept against. */
class DmSync {
  private readonly copies = new Map<SupportedLocale, Promise<DiscordSubOfferCopy>>();
  private readonly sessions = new Map<SupportedLocale, SubstitutionDmSession>();
  private readonly logoUrl: string | null;
  private readonly mySogUrl: string | null;
  /** The first failure worth retrying; the rest of the sync still runs. */
  private deferred: unknown = null;

  constructor(
    private readonly supabase: AdminClient,
    private readonly snapshot: SubstitutionNotificationSnapshot,
    private readonly state: NotificationState,
    /** The DM records, kept current as this sync writes them. */
    private readonly dms: Map<string, SnapshotDm>,
  ) {
    // Discord fetches the logo and opens the button's link itself, so both
    // need an origin it can reach — a dev machine's has neither.
    const origin = sendableImageOrigin();
    this.logoUrl = discordSubLogoUrl(origin);
    this.mySogUrl = origin === null ? null : new URL(ROUTES.gedu.dashboard, origin).toString();
  }

  async run(): Promise<unknown> {
    for (const candidate of this.snapshot.candidates) {
      await this.syncOfferDm(candidate);
    }
    await this.syncAcceptedDm();
    return this.deferred;
  }

  private copyFor(candidate: SnapshotCandidate): Promise<DiscordSubOfferCopy> {
    const locale =
      candidate.locale !== null && isSupportedLocale(candidate.locale)
        ? candidate.locale
        : DEFAULT_LOCALE;
    let copy = this.copies.get(locale);
    if (copy === undefined) {
      copy = loadDiscordSubOfferCopy(locale);
      this.copies.set(locale, copy);
    }
    return copy;
  }

  private sessionFor(locale: SupportedLocale): SubstitutionDmSession {
    let session = this.sessions.get(locale);
    if (session === undefined) {
      session = substitutionDmSession(this.snapshot, locale);
      this.sessions.set(locale, session);
    }
    return session;
  }

  /**
   * One gedu's DM: sent when the request is open, they are eligible, reachable
   * and have none yet; redrawn when it exists and its rendering changed.
   */
  private async syncOfferDm(candidate: SnapshotCandidate): Promise<void> {
    const dm = this.dms.get(candidate.gedu_id);
    if (dm?.delivery_error) return;

    const copy = await this.copyFor(candidate);
    const body = buildSubstitutionOfferDm({
      copy,
      logoUrl: this.logoUrl,
      session: this.sessionFor(copy.locale),
      response: candidate.response,
      state: this.state.kind,
    });
    const hash = renderedHash(body);

    if (dm?.message_id && dm.channel_id) {
      if (isUnchanged(dm.rendered_hash, hash)) return;
      const { channel_id: channelId, message_id: messageId } = dm;
      await this.attempt(candidate.gedu_id, async () => {
        await editDiscordMessage(channelId, messageId, body);
        await this.write(candidate.gedu_id, { rendered_hash: hash });
      });
      return;
    }

    const discordUserId = candidate.discord_user_id;
    if (this.state.kind !== "open" || !candidate.eligible || discordUserId === null) return;
    await this.attempt(
      candidate.gedu_id,
      async () => {
        const channelId = await openDiscordDmChannel(discordUserId);
        const messageId = await sendDiscordChannelMessage(channelId, body);
        await this.write(candidate.gedu_id, {
          discord_user_id: discordUserId,
          channel_id: channelId,
          message_id: messageId,
          rendered_hash: hash,
        });
      },
      discordUserId,
    );
  }

  /**
   * The "you've been accepted" DM, at most once per (request, gedu), to the
   * gedu seated on an announced request while the session is still ahead —
   * however they were seated. The claim is taken before the send so two
   * workers can never both send it; a send that fails in a way worth retrying
   * hands the claim back.
   */
  private async syncAcceptedDm(): Promise<void> {
    if (this.state.kind !== "filled") return;
    if (this.snapshot.request.session_date < this.snapshot.product_today) return;
    const geduId = this.state.substitute.id;
    const candidate = this.snapshot.candidates.find((c) => c.gedu_id === geduId);
    const discordUserId = candidate?.discord_user_id ?? null;
    if (candidate === undefined || discordUserId === null) return;
    if (this.dms.get(geduId)?.accepted_dm_claimed_at) return;

    const requestId = this.snapshot.request.id;
    const seeded = await this.supabase
      .from("substitution_notification_dms")
      .upsert(
        { request_id: requestId, gedu_id: geduId, discord_user_id: discordUserId },
        { onConflict: "request_id,gedu_id", ignoreDuplicates: true },
      );
    if (seeded.error) throw seeded.error;

    const claimedAt = new Date().toISOString();
    const claim = await this.supabase
      .from("substitution_notification_dms")
      .update({ accepted_dm_claimed_at: claimedAt })
      .eq("request_id", requestId)
      .eq("gedu_id", geduId)
      .is("accepted_dm_claimed_at", null)
      .select();
    if (claim.error) throw claim.error;
    const claimed = claim.data.at(0);
    if (claimed === undefined) return;
    this.dms.set(geduId, claimed);

    const copy = await this.copyFor(candidate);
    const body = buildSubstitutionAcceptedDm({
      copy,
      logoUrl: this.logoUrl,
      session: this.sessionFor(copy.locale),
      mySogUrl: this.mySogUrl,
    });

    let messageId: string;
    try {
      const channelId = await openDiscordDmChannel(discordUserId);
      messageId = await sendDiscordChannelMessage(channelId, body);
    } catch (error) {
      if (isPermanentDiscordDmError(error)) {
        // The claim stays: it would fail the same way every time.
        await this.write(geduId, { delivery_error: describeError(error) });
        return;
      }
      await this.write(geduId, { accepted_dm_claimed_at: null });
      this.deferred ??= error;
      return;
    }
    // Outside the try: the DM has gone, so a failure to record it must not
    // hand the claim back and send it twice.
    await this.write(geduId, {
      accepted_dm_message_id: messageId,
      accepted_dm_sent_at: new Date().toISOString(),
    });
  }

  /**
   * Run one DM's send or edit. A refusal Discord will repeat forever is
   * recorded on the gedu's row and never retried; anything else is kept to
   * fail the job once the rest of the sync has run.
   */
  private async attempt(
    geduId: string,
    send: () => Promise<void>,
    discordUserId?: string,
  ): Promise<void> {
    try {
      await send();
    } catch (error) {
      if (!isPermanentDiscordDmError(error)) {
        this.deferred ??= error;
        return;
      }
      await this.write(geduId, {
        ...(discordUserId === undefined ? {} : { discord_user_id: discordUserId }),
        delivery_error: describeError(error),
      });
    }
  }

  /** Write the gedu's DM record — created when it has none — and keep the copy current. */
  private async write(
    geduId: string,
    fields: Partial<Omit<SnapshotDm, "request_id" | "gedu_id">>,
  ): Promise<void> {
    const requestId = this.snapshot.request.id;
    const written = await this.supabase
      .from("substitution_notification_dms")
      .upsert({ request_id: requestId, gedu_id: geduId, ...fields }, { onConflict: "request_id,gedu_id" })
      .select()
      .single();
    if (written.error) throw written.error;
    this.dms.set(geduId, written.data);
  }
}

// ---------------------------------------------------------------- Slack

/**
 * The staff channel's message: posted once, its ts stored straight away so no
 * later sync posts a second; edited whenever its rendering changes.
 */
async function syncSlack(
  supabase: AdminClient,
  snapshot: SubstitutionNotificationSnapshot,
  state: NotificationState,
  notification: SnapshotNotification,
  dms: SnapshotDm[],
): Promise<void> {
  const message = buildSubstitutionSlackMessage({ snapshot: { ...snapshot, dms }, state });
  const hash = renderedHash(message);
  const requestId = snapshot.request.id;

  if (notification.slack_message_ts === null || notification.slack_channel_id === null) {
    const channel = slackSubstitutionsChannelId();
    if (channel === null) return;
    const posted = await postSlackBlocks(channel, message);
    const stored = await supabase
      .from("substitution_notifications")
      .update({
        slack_channel_id: posted.channel,
        slack_message_ts: posted.ts,
        slack_rendered_hash: hash,
      })
      .eq("request_id", requestId);
    if (stored.error) throw stored.error;
    return;
  }

  if (isUnchanged(notification.slack_rendered_hash, hash)) return;
  await updateSlackMessage(notification.slack_channel_id, notification.slack_message_ts, message);
  const stored = await supabase
    .from("substitution_notifications")
    .update({ slack_rendered_hash: hash })
    .eq("request_id", requestId);
  if (stored.error) throw stored.error;
}

// ---------------------------------------------------------------- helpers

/** A stable hash of a rendered message, so an unchanged one is never re-sent. */
export function renderedHash(rendered: unknown): string {
  return createHash("sha256").update(JSON.stringify(rendered)).digest("hex");
}

/** Whether a message's rendering is the one last sent — a fingerprint, not a secret. */
function isUnchanged(sent: string | null, current: string): boolean {
  return sent === current;
}

/** An error as one line for the outbox row or a DM record. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code =
      "discordCode" in error && typeof error.discordCode === "number"
        ? ` (${error.discordCode})`
        : "";
    return `${error.name}: ${error.message}${code}`;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
