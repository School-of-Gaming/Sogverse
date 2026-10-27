import "server-only";
import {
  addKlaviyoProfileToList,
  createKlaviyoEvent,
  findKlaviyoProfileIdByExternalId,
  isKlaviyoConfigured,
  requestKlaviyoProfileDeletion,
  subscribeKlaviyoProfile,
  upsertKlaviyoProfile,
} from "@/lib/klaviyo";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCOUNT_REGISTRATION_CUSTOM_SOURCE,
  klaviyoEventFor,
  klaviyoListsFor,
  klaviyoProfileFor,
  subscribesOnSend,
} from "./contract";
import { listIdsFor, marketingConsentListId } from "./lists.server";
import {
  klaviyoEventRow,
  klaviyoParentSnapshotRow,
  type KlaviyoParentSnapshot,
} from "./snapshot.contracts";

/**
 * **The Klaviyo sync**: drains the two outboxes the database fills — parents
 * whose Klaviyo picture changed, and things that happened to them — and brings
 * Klaviyo up to date with each. Profiles first, so an event's profile already
 * carries what the event is about; then events.
 *
 * **The outbox lease is the concurrency.** A claim leases its rows; a parent
 * changed while their profile syncs has their row's seq bumped, so the finish
 * hands it back due and a later claim in the same drain syncs them again.
 * Every Klaviyo call is idempotent — a profile upsert, a list membership, an
 * event Klaviyo keeps once per unique id, a subscription — so a retry repeats
 * harmlessly.
 *
 * **One row's failure is that row's.** It is recorded on the row through the
 * finish, as a label carrying no address or name, and the outbox retries it
 * with backoff; the rest of the batch goes on. Only a failure of the database
 * calls themselves stops the drain.
 *
 * Every read is the service role's: a snapshot carries every gamer's birth
 * year and gender and the parent's phone.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Rows per claim: one snapshot read serves the batch, and a batch is small
 * enough that a drain the platform stops mid-batch strands few leases.
 */
const BATCH_SIZE = 5;

export interface KlaviyoDrainResult {
  /** Profiles created or updated. */
  profilesSynced: number;
  /** Profiles deleted (or found already gone) because their parent is. */
  profilesDeleted: number;
  /** Events sent. */
  eventsSent: number;
  /** Events finished unsent, because their parent is gone. */
  eventsDropped: number;
  /** Rows whose sync failed; they retry with backoff. */
  failed: number;
  /** Whether the environment has no Klaviyo key, so nothing was claimed. */
  notConfigured: boolean;
}

/**
 * **Whether this parent is kept out of Klaviyo.** Nobody is today. A parent it
 * answers yes for has their profile deleted and their events finished unsent,
 * exactly as one who is gone — so an opt-out is a field on the snapshot and one
 * line here.
 */
function isKeptOutOfKlaviyo(snapshot: KlaviyoParentSnapshot): boolean {
  void snapshot;
  return false;
}

/**
 * Sync every due row, profiles then events, until both outboxes are empty.
 * There is no budget of its own: the platform's limit on the function is the
 * only one, and a drain it stops mid-batch loses nothing — its leased rows
 * are taken by a later drain once the lease runs out, and every call repeats
 * harmlessly. With no Klaviyo key nothing is claimed, so every row stays due
 * and goes out once the environment is configured.
 */
export async function drainKlaviyoSync(): Promise<KlaviyoDrainResult> {
  const result: KlaviyoDrainResult = {
    profilesSynced: 0,
    profilesDeleted: 0,
    eventsSent: 0,
    eventsDropped: 0,
    failed: 0,
    notConfigured: false,
  };
  if (!isKlaviyoConfigured()) {
    console.warn("Klaviyo sync: KLAVIYO_PRIVATE_API_KEY is not set; the outboxes wait.");
    result.notConfigured = true;
    return result;
  }

  const supabase = createAdminClient();
  while (await drainProfileBatch(supabase, result));
  while (await drainEventBatch(supabase, result));
  return result;
}

/** Read the snapshots of these parents; a parent with none is gone. */
async function readSnapshots(
  supabase: AdminClient,
  customerIds: string[],
): Promise<Map<string, KlaviyoParentSnapshot | "unreadable">> {
  const read = await supabase.rpc("get_klaviyo_parent_snapshots", {
    p_customer_ids: customerIds,
  });
  if (read.error) throw read.error;
  const snapshots = new Map<string, KlaviyoParentSnapshot | "unreadable">();
  for (const row of read.data) {
    const parsed = klaviyoParentSnapshotRow.safeParse(row);
    snapshots.set(row.customer_id, parsed.success ? parsed.data.snapshot : "unreadable");
  }
  return snapshots;
}

/** One claim of profile jobs, synced and finished. False when nothing was due. */
async function drainProfileBatch(
  supabase: AdminClient,
  result: KlaviyoDrainResult,
): Promise<boolean> {
  const claim = await supabase.rpc("claim_klaviyo_profile_jobs", { p_limit: BATCH_SIZE });
  if (claim.error) throw claim.error;
  if (claim.data.length === 0) return false;

  const snapshots = await readSnapshots(
    supabase,
    claim.data.map((job) => job.customer_id),
  );

  for (const job of claim.data) {
    let failure: string | null = null;
    try {
      const outcome = await syncProfile(job.customer_id, snapshots.get(job.customer_id));
      if (outcome === "deleted") result.profilesDeleted += 1;
      else result.profilesSynced += 1;
    } catch (error) {
      failure = describeError(error);
      result.failed += 1;
      console.error(`Klaviyo profile sync failed for ${job.customer_id}:`, failure);
    }

    const finish = await supabase.rpc("finish_klaviyo_profile_job", {
      p_customer_id: job.customer_id,
      p_seq: job.seq,
      ...(failure === null ? {} : { p_error: failure }),
    });
    if (finish.error) throw finish.error;
    // A true finish means the parent changed mid-sync: the row is due again
    // and a later claim of this drain syncs them afresh.
  }
  return true;
}

/**
 * Bring one parent's Klaviyo profile up to date and add it to its lists, or
 * delete it. Lists are only ever added to: Klaviyo's add is a no-op for a
 * member, so repeating it every sync costs nothing, and a list is history.
 */
async function syncProfile(
  customerId: string,
  snapshot: KlaviyoParentSnapshot | "unreadable" | undefined,
): Promise<"synced" | "deleted"> {
  if (snapshot === "unreadable") throw new Error("The parent's snapshot did not parse");

  const klaviyoId = await findKlaviyoProfileIdByExternalId(customerId);
  if (snapshot === undefined || isKeptOutOfKlaviyo(snapshot)) {
    if (klaviyoId !== null) await requestKlaviyoProfileDeletion(klaviyoId);
    return "deleted";
  }
  // Read before any write, so a list nobody configured fails the row first.
  const listIds = listIdsFor(klaviyoListsFor(snapshot));
  // Updating by Klaviyo's id is what carries a changed address across: an
  // import matched on the address would create a second profile instead.
  const written = await upsertKlaviyoProfile({
    ...(klaviyoId === null ? {} : { id: klaviyoId }),
    ...klaviyoProfileFor(snapshot),
  });
  const profileId = written ?? klaviyoId;
  if (profileId === null) throw new Error("Klaviyo answered the profile import with no id");
  for (const listId of listIds) await addKlaviyoProfileToList(listId, profileId);
  return "synced";
}

/** One claim of event jobs, sent and finished. False when nothing was due. */
async function drainEventBatch(
  supabase: AdminClient,
  result: KlaviyoDrainResult,
): Promise<boolean> {
  const claim = await supabase.rpc("claim_klaviyo_event_jobs", { p_limit: BATCH_SIZE });
  if (claim.error) throw claim.error;
  if (claim.data.length === 0) return false;

  const read = await supabase.rpc("get_klaviyo_events", {
    p_event_ids: claim.data.map((job) => job.event_id),
  });
  if (read.error) throw read.error;
  const events = new Map(read.data.map((row) => [row.event_id, row]));
  const snapshots = await readSnapshots(supabase, [
    ...new Set(read.data.map((row) => row.customer_id)),
  ]);

  for (const job of claim.data) {
    let failure: string | null = null;
    try {
      const event = events.get(job.event_id);
      const snapshot = event === undefined ? undefined : snapshots.get(event.customer_id);
      if (
        event === undefined ||
        snapshot === undefined ||
        (snapshot !== "unreadable" && isKeptOutOfKlaviyo(snapshot))
      ) {
        // The parent is gone (or kept out): nothing to tell, and nobody to tell it to.
        result.eventsDropped += 1;
      } else {
        await sendEvent(event, snapshot);
        result.eventsSent += 1;
      }
    } catch (error) {
      failure = describeError(error);
      result.failed += 1;
      console.error(`Klaviyo event sync failed for ${job.event_id}:`, failure);
    }

    const finish = await supabase.rpc("finish_klaviyo_event_job", {
      p_event_id: job.event_id,
      ...(failure === null ? {} : { p_error: failure }),
    });
    if (finish.error) throw finish.error;
  }
  return true;
}

/**
 * Send one event, and — for an account created with the registration form's
 * box ticked — the one subscription Sogverse ever sends, into the marketing
 * consent list. After the event, so a failed subscription retries both, and
 * the event's unique id keeps Klaviyo from recording it twice.
 */
async function sendEvent(
  row: unknown,
  snapshot: KlaviyoParentSnapshot | "unreadable",
): Promise<void> {
  if (snapshot === "unreadable") throw new Error("The parent's snapshot did not parse");
  const parsed = klaviyoEventRow.safeParse(row);
  if (!parsed.success) throw new Error("The event row did not parse");
  const event = parsed.data;

  // Read before any write, so a list nobody configured fails the row first.
  const subscribeListId = subscribesOnSend(event, snapshot) ? marketingConsentListId() : null;
  const { email, id } = snapshot.profile;
  await createKlaviyoEvent({ email, externalId: id }, klaviyoEventFor(event, snapshot));
  if (subscribeListId !== null) {
    await subscribeKlaviyoProfile({
      email,
      listId: subscribeListId,
      customSource: ACCOUNT_REGISTRATION_CUSTOM_SOURCE,
    });
  }
}

/** An error as one line for the outbox row: labels, never an address or a name. */
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
