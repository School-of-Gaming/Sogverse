/**
 * "This family is ready" — the cookie, and the two ends of its round trip.
 *
 * Isomorphic and React-free on purpose, exactly like the consent cookie's own
 * module: the **server** parses it while rendering a dashboard, so the cards it
 * paints already know which guides have been finished with, and the **browser**
 * writes it when a family answers the dialog. One value, one parser, one
 * spelling of the key — which is what makes the server's HTML and the first
 * client render agree by construction rather than by care.
 *
 * There is no route behind it and no column. A dismissal is a rendering
 * decision about one card, it is worth nothing to anybody but the reader who
 * made it, and a cookie is the one store a server render can read.
 */

/** The cookie that remembers who is ready. Named like `sog_consent`. */
export const TOPIC_PREP_COOKIE_NAME = "sog_prep_ready";

/**
 * Thirteen months, in seconds — the longest a browser will honour (Chrome and
 * Safari both clamp anything past 400 days).
 *
 * Long on purpose: a family that has finished with a guide has finished with it
 * for good, so the only thing an expiry can do is offer it to them again. The
 * window rule below is what actually retires the offer; this is just the
 * ceiling the browser imposes.
 */
export const TOPIC_PREP_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * How large the value is allowed to get, in characters.
 *
 * This cookie rides on **every request to the site**, so it is not a store to
 * let grow: 3 KB is comfortably inside the 4 KB per-cookie limit browsers
 * enforce and still holds ~40 enrolments, which is far more than a family has.
 * Past it the **oldest entries are dropped**, because the newest answer is the
 * one a reader has just given and would notice being ignored — and losing an
 * old one costs a click, which is the cheap half of this feature's two ways to
 * be wrong.
 */
export const TOPIC_PREP_COOKIE_MAX_CHARS = 3072;

/** Entries are separated by this; neither half of a key can contain it. */
const ENTRY_SEPARATOR = ",";

/**
 * The viewer half of the key when nobody is signed in — a preview scene with no
 * fixture user, and nothing else, since every surface drawing an enrolment card
 * is behind a role gate.
 */
const ANONYMOUS_VIEWER = "anonymous";

/**
 * One viewer's answer about one enrolment.
 *
 * **The viewer half is not decoration.** A parent and a child routinely share
 * one computer and one browser profile, so a parent clicking "I'm ready" on the
 * family PC must not take the guide away from the child who has not read it.
 * The enrolment half is per participation rather than per product, because a
 * second child in the same club is a second setup on a second machine.
 *
 * Exported because both ends spell it — the server filtering the cookie down to
 * the reader, and the browser appending to it — and a key spelled twice is a
 * key that can be spelled differently twice.
 */
export function topicPrepReadyKey(
  viewerId: string | null,
  participationId: string,
): string {
  return `${viewerId ?? ANONYMOUS_VIEWER}:${participationId}`;
}

/**
 * The keys a stored value carries, oldest first, with anything unreadable
 * dropped.
 *
 * A cookie is user-supplied text: it can be truncated, hand-edited, left over
 * from an older shape, or simply absent. Every one of those means the same
 * thing to every caller — *this family has not said they are ready* — so none
 * of them is worth telling apart, and all of them land on the answer that
 * offers the guide. Of the two ways to be wrong, offering a guide twice costs a
 * click and swallowing it costs somebody the setup instructions.
 *
 * Tolerates a still-encoded value as well as a decoded one, for the reason the
 * consent parser does: both readers we have decode already, but a `%3A` reaching
 * the split would quietly read as an answer nobody gave.
 */
export function parseTopicPrepReadyCookie(
  raw: string | undefined,
): string[] {
  if (!raw) return [];
  let text = raw;
  if (text.includes("%")) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return [];
    }
  }
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const entry of text.split(ENTRY_SEPARATOR)) {
    const key = entry.trim();
    // Exactly two non-empty halves. A truncated tail — the shape a cookie
    // clipped at a byte limit ends in — fails this and is dropped.
    const separator = key.indexOf(":");
    if (separator <= 0 || separator === key.length - 1) continue;
    if (key.indexOf(":", separator + 1) !== -1) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * The value to store, capped — **oldest entries dropped first**, so the answer
 * the reader just gave always survives.
 */
export function serialiseTopicPrepReady(keys: readonly string[]): string {
  let kept = keys;
  let value = kept.join(ENTRY_SEPARATOR);
  while (value.length > TOPIC_PREP_COOKIE_MAX_CHARS && kept.length > 0) {
    kept = kept.slice(1);
    value = kept.join(ENTRY_SEPARATOR);
  }
  return value;
}

/**
 * The **enrolments this viewer has finished with**, out of a raw cookie value.
 *
 * The viewer half is resolved here rather than carried onward, so what travels
 * to a card is a plain set of participation ids that is already about the
 * person reading the page. A card asking `has(participationId)` cannot then
 * accidentally answer for the other person sharing the browser.
 */
export function topicPrepReadyFor(
  raw: string | undefined,
  viewerId: string | null,
): ReadonlySet<string> {
  const prefix = `${viewerId ?? ANONYMOUS_VIEWER}:`;
  const ready = new Set<string>();
  for (const key of parseTopicPrepReadyCookie(raw)) {
    if (key.startsWith(prefix)) ready.add(key.slice(prefix.length));
  }
  return ready;
}

/**
 * The empty answer, shared.
 *
 * A fixture surface that has dismissed nothing, and a test that is about
 * something else, both want this exact value — and a module-level constant
 * keeps them from each allocating a set per render for a prop nothing mutates.
 */
export const NO_TOPIC_PREP_READY: ReadonlySet<string> = new Set<string>();
