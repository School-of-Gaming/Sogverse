import type { AppSupabaseClient } from "@/types";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import type { SandboxDefinition } from "@/lib/calendar-feed/sandbox";
import {
  calendarFeedLookupResponse,
  calendarFeedPreviewResponse,
  calendarFeedSandboxResponse,
  type CalendarFeedLookupResponse,
  type CalendarFeedPreviewResponse,
  type CalendarFeedSandboxResponse,
} from "./calendar-feed.contracts";

const SANDBOX_URL = "/api/admin/calendar-feed/sandbox";

/**
 * The calendar-feed exploration's client side.
 *
 * Both methods go through `fetch` rather than the injected client, for the two
 * different reasons this pattern allows: minting needs a server-side secret
 * (the HMAC key), and the preview is a read of the feed route itself, whose
 * authorization is the token in its own path rather than any session. The
 * injected client is therefore unused, and kept for symmetry with every other
 * service in the tree.
 */
export class CalendarFeedService {
  constructor(private supabase: AppSupabaseClient) {}

  /** Resolve a customer (email or id) and mint their feed token. */
  async lookup(customer: string): Promise<CalendarFeedLookupResponse> {
    const response = await fetch("/api/admin/calendar-feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer }),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Could not look up that customer"),
      );
    }
    return parseJsonResponse(response, calendarFeedLookupResponse);
  }

  /**
   * Everything a feed URL currently carries: its events as data, and the `.ics`
   * document they serialize to.
   *
   * One request, because the route answers with both — polling twice would poll
   * two different computations and let the card's table describe a document
   * other than the one printed under it.
   *
   * The URL is passed in whole rather than assembled here: the card owns the
   * option state and has already built the exact URL an admin is about to hand
   * to a calendar app, and previewing a *different* URL than the one on screen
   * would defeat the point.
   */
  async preview(feedUrl: string): Promise<CalendarFeedPreviewResponse> {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Could not load the feed"),
      );
    }
    return parseJsonResponse(response, calendarFeedPreviewResponse);
  }

  /**
   * The caller's own sandbox family, created from the seeded default if this is
   * their first visit — so the card never has an empty state to render.
   */
  async loadSandbox(): Promise<CalendarFeedSandboxResponse> {
    const response = await fetch(SANDBOX_URL);
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Could not load the sandbox family"),
      );
    }
    return parseJsonResponse(response, calendarFeedSandboxResponse);
  }

  /** Replace the whole document. The editor holds a draft and saves all of it. */
  async saveSandbox(
    definition: SandboxDefinition,
  ): Promise<CalendarFeedSandboxResponse> {
    return this.writeSandbox(
      { method: "PUT", body: { definition } },
      "Could not save the sandbox family",
    );
  }

  /** Restore the seeded family, discarding whatever was stored. */
  async resetSandbox(): Promise<CalendarFeedSandboxResponse> {
    return this.writeSandbox(
      { method: "POST", body: { action: "reset" } },
      "Could not reset the sandbox family",
    );
  }

  private async writeSandbox(
    request: { method: "PUT" | "POST"; body: unknown },
    fallbackMessage: string,
  ): Promise<CalendarFeedSandboxResponse> {
    const response = await fetch(SANDBOX_URL, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, fallbackMessage));
    }
    return parseJsonResponse(response, calendarFeedSandboxResponse);
  }
}
