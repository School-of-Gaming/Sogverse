/**
 * The handover's logic, free of the network so the unit test can drive it:
 * which parents carry a School of Gaming consent across, what Klaviyo's own
 * answer about each one decides, and the sequential, retried run that writes
 * it. `run.ts` reads the database and hands this module the Klaviyo client.
 */

import { z } from "zod";

import type { KlaviyoEmailMarketing } from "@/lib/klaviyo";
import { PROFILE_PROPERTIES } from "@/lib/klaviyo-sync/contract";

/** The source Klaviyo records on every consent this script carries across. */
export const HANDOVER_CUSTOM_SOURCE = "Sogverse account (consent given before the Klaviyo sync)";

// ---------------------------------------------------------------- selection

/** One `marketing_consents` row, granted, for `school_of_gaming`, with its parent's profile. */
export const consentRow = z.object({
  customer_id: z.string(),
  updated_at: z.string(),
  profiles: z.object({
    email: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    locale: z.string().nullable(),
  }),
});
export type ConsentRow = z.infer<typeof consentRow>;

/** One granting `marketing_consent_events` row for `school_of_gaming`. */
export const grantEvent = z.object({
  customer_id: z.string(),
  source: z.string(),
  created_at: z.string(),
});
export type GrantEvent = z.infer<typeof grantEvent>;

export const consentRows = z.array(consentRow);
export const grantEvents = z.array(grantEvent);

export interface ConsentedParent {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string | null;
  /** When the current grant was given, ISO 8601 in UTC. */
  consentedAt: string;
  /** The surface the current grant came from; null when no event records it. */
  source: string | null;
}

/**
 * Every parent the rows name, with the time and source of their current grant:
 * the latest granting event — a parent can grant, revoke and grant again, and
 * only the last grant is the one standing — else the row's own `updated_at`,
 * which is when its state last changed.
 */
export function consentedParents(
  rows: readonly ConsentRow[],
  events: readonly GrantEvent[],
): ConsentedParent[] {
  const latest = new Map<string, GrantEvent>();
  for (const event of events) {
    const seen = latest.get(event.customer_id);
    if (seen === undefined || Date.parse(event.created_at) > Date.parse(seen.created_at)) {
      latest.set(event.customer_id, event);
    }
  }
  return rows.map((row) => {
    const grant = latest.get(row.customer_id);
    return {
      id: row.customer_id,
      email: row.profiles.email,
      firstName: row.profiles.first_name,
      lastName: row.profiles.last_name,
      locale: row.profiles.locale,
      consentedAt: new Date(grant?.created_at ?? row.updated_at).toISOString(),
      source: grant?.source ?? null,
    };
  });
}

// ---------------------------------------------------------------- decision

export type Decision =
  | { kind: "subscribe"; profileId: string | null }
  | { kind: "already_subscribed" }
  | { kind: "unsubscribed" };

/**
 * What Klaviyo's answer decides for one parent. Klaviyo's word wins: a profile
 * that unsubscribed or is suppressed — by external id, or the one holding the
 * address — is never subscribed again, since the subscribe call would lift the
 * suppression. Already subscribed needs no write. Otherwise subscribe, updating
 * the profile the sync wrote when there is one, so the address moves with it.
 */
export function decide(
  byExternalId: KlaviyoEmailMarketing | null,
  byEmail: KlaviyoEmailMarketing | null,
): Decision {
  const found = [byExternalId, byEmail].filter((p): p is KlaviyoEmailMarketing => p !== null);
  if (found.some((p) => p.suppressed || p.consent === "UNSUBSCRIBED")) {
    return { kind: "unsubscribed" };
  }
  // The address is what gets subscribed, so its holder's consent is the one that counts.
  const holder = byEmail ?? byExternalId;
  if (holder?.consent === "SUBSCRIBED") return { kind: "already_subscribed" };
  return { kind: "subscribe", profileId: byExternalId?.profileId ?? byEmail?.profileId ?? null };
}

function sameAddress(a: string | null, b: string): boolean {
  return a !== null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ---------------------------------------------------------------- the run

/** The Klaviyo client calls the run makes, injected so a test can stand in for them. */
export interface HandoverDeps {
  findEmailMarketing: (
    by: { externalId: string } | { email: string },
  ) => Promise<KlaviyoEmailMarketing | null>;
  upsertProfile: (profile: {
    id?: string;
    email: string;
    externalId: string;
    firstName: string;
    lastName: string;
    locale?: string;
    properties: Record<string, string | boolean>;
  }) => Promise<unknown>;
  subscribe: (subscription: {
    email: string;
    customSource: string;
    consentedAt: string;
  }) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

export interface HandoverOptions {
  apply: boolean;
  environment: "production" | "staging";
  /** Pause between parents, under Klaviyo's per-endpoint steady rate. */
  pauseMs?: number;
}

export interface HandoverResult {
  /** Subscribed in an apply run; would be subscribed in a dry run. */
  subscribe: number;
  alreadySubscribed: number;
  unsubscribed: number;
  /** Parent profile ids, each with the failing call's label — never an address. */
  errors: { profileId: string; error: string }[];
  /** The parents to subscribe, counted by where their consent was given. */
  bySource: Record<string, number>;
}

const RETRIES = 5;

/** A failure worth waiting out: Klaviyo's rate limit, its own errors, or a timeout. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  return /answered (429|5\d\d)\b/.test(error.message);
}

/** The call, retried with backoff (1 s, 2 s, 4 s, …) while it fails retryably. */
export async function withRetry<T>(
  call: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= RETRIES || !isRetryable(error)) throw error;
      await sleep(1_000 * 2 ** attempt);
    }
  }
}

function label(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Hand every parent's consent over, one parent at a time. A dry run only
 * reads; an apply run upserts the profile then subscribes it. Safe to run
 * again: a parent subscribed by an earlier run reads back as already
 * subscribed and is not written to.
 */
export async function handOver(
  parents: readonly ConsentedParent[],
  deps: HandoverDeps,
  options: HandoverOptions,
): Promise<HandoverResult> {
  const result: HandoverResult = {
    subscribe: 0,
    alreadySubscribed: 0,
    unsubscribed: 0,
    errors: [],
    bySource: {},
  };
  const retried = <T>(call: () => Promise<T>) => withRetry(call, deps.sleep);

  for (const [index, parent] of parents.entries()) {
    if (index > 0) await deps.sleep(options.pauseMs ?? 250);
    try {
      const byExternalId = await retried(() =>
        deps.findEmailMarketing({ externalId: parent.id }),
      );
      const byEmail =
        byExternalId !== null && sameAddress(byExternalId.email, parent.email)
          ? null
          : await retried(() => deps.findEmailMarketing({ email: parent.email }));
      const decision = decide(byExternalId, byEmail);

      if (decision.kind === "unsubscribed") {
        result.unsubscribed += 1;
        continue;
      }
      if (decision.kind === "already_subscribed") {
        result.alreadySubscribed += 1;
        continue;
      }

      if (options.apply) {
        await retried(() =>
          deps.upsertProfile({
            ...(decision.profileId === null ? {} : { id: decision.profileId }),
            email: parent.email,
            externalId: parent.id,
            firstName: parent.firstName,
            lastName: parent.lastName,
            ...(parent.locale === null ? {} : { locale: parent.locale }),
            properties: {
              [PROFILE_PROPERTIES.account]: true,
              [PROFILE_PROPERTIES.environment]: options.environment,
            },
          }),
        );
        await retried(() =>
          deps.subscribe({
            email: parent.email,
            customSource: HANDOVER_CUSTOM_SOURCE,
            consentedAt: parent.consentedAt,
          }),
        );
      }
      result.subscribe += 1;
      const source = parent.source ?? "unrecorded";
      result.bySource[source] = (result.bySource[source] ?? 0) + 1;
    } catch (error) {
      result.errors.push({ profileId: parent.id, error: label(error) });
    }
  }
  return result;
}
