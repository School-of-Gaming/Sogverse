import type { AppSupabaseClient } from "@/types";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  calendarFeedLookupResponse,
  calendarFeedPreviewResponse,
  type CalendarFeedLookupResponse,
  type CalendarFeedPreviewResponse,
} from "./calendar-feed.contracts";

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
}
