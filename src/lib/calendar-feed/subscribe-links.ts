/**
 * The links that hand a feed URL to a calendar app.
 *
 * Subscribing to an ICS feed is not one gesture: each vendor invented its own,
 * and none of them takes a plain `https://` address. Pure string builders, kept
 * free of anything admin-specific, because a parent-facing "add to your
 * calendar" row would want exactly these three.
 *
 * Three facts decide every line below:
 *
 * 1. **`webcal://` is what makes a client subscribe rather than download.** It
 *    is not a transport — the client fetches the same `https://` address behind
 *    it — it is the scheme that tells the operating system "this is a
 *    subscription", so a desktop client offers to follow it instead of saving
 *    one static file that never updates again.
 * 2. **Google rejects an `https://` value in `cid` and accepts the `webcal://`
 *    one.** So the URL that goes inside Google's parameter is the webcal form,
 *    not the address the feed is really served from.
 * 3. **The feed carries its own query string**, so a URL nested inside another
 *    URL's parameter has to be percent-encoded or the first `&` of ours is read
 *    as the *host's* next parameter and everything after it is lost.
 *
 * The feed must be reachable over HTTPS for any of the three to work: the
 * vendors' servers fetch it from the public internet, so a localhost address
 * produces a link that opens and then fails on their side.
 */

/** Every address the subscribe row offers, built from one feed URL. */
export interface CalendarSubscribeLinks {
  /** The feed itself under the subscription scheme — what Apple Calendar takes. */
  webcal: string;
  /** Google Calendar's add-by-URL screen, pre-filled. */
  google: string;
  /** Outlook.com's add-from-web screen, pre-filled with a name. */
  outlook: string;
}

/**
 * The same address under the `webcal:` scheme.
 *
 * A string swap of the leading scheme rather than a `URL` mutation: `webcal` is
 * not a scheme the URL parser treats as special, so assigning it to `protocol`
 * is silently ignored on the parsed object. The rest of the address — host,
 * path, query — is untouched, which is the whole point.
 */
export function toWebcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:/i, "webcal:");
}

/**
 * Build the three subscribe addresses for one feed URL.
 *
 * `calendarName` is what Outlook labels the subscription in the sidebar; Apple
 * and Google read the name out of the document itself, so only Outlook needs it
 * handed over.
 */
export function buildSubscribeLinks(
  feedUrl: string,
  calendarName: string,
): CalendarSubscribeLinks {
  const webcal = toWebcalUrl(feedUrl);
  const encoded = encodeURIComponent(webcal);
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encoded}`,
    // A Microsoft 365 / work account uses this same path on
    // `outlook.office.com` instead. Deliberately not a fourth button: a reader
    // who has to choose between two Outlooks is being asked a question they
    // should not have to answer, and the personal host is the one a family has.
    outlook:
      `https://outlook.live.com/calendar/0/addfromweb?url=${encoded}` +
      `&name=${encodeURIComponent(calendarName)}`,
  };
}
