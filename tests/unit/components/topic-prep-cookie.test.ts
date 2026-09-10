import { describe, expect, it } from "vitest";
import {
  TOPIC_PREP_COOKIE_MAX_CHARS,
  parseTopicPrepReadyCookie,
  serialiseTopicPrepReady,
  topicPrepReadyFor,
  topicPrepReadyKey,
} from "@/components/topic-prep/topic-prep-cookie";

/**
 * The cookie that remembers which prep guides a family has finished with.
 *
 * It is the one piece of this feature that crosses the wire, and both ends read
 * it: a server render parses it to decide what each card's footer says, and the
 * browser appends to it when somebody answers the dialog. What is pinned here
 * is the round trip and the two ways it is allowed to be wrong.
 *
 * **Every failure means "not ready".** A cookie is user-supplied text — it can
 * be truncated, hand-edited or left over from an older shape — and of the two
 * ways to misread one, offering a guide twice costs a click and swallowing it
 * costs somebody the setup instructions. So anything unreadable is dropped and
 * the family is offered the guide.
 */

const VIEWER = "9c1f0f2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const OTHER_VIEWER = "1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6";
const CLUB = "e0b5b0c3-7c8f-4b3e-9a11-5f2c6d7e8a90";
const CAMP = "2f3a4b5c-6d7e-4f80-9112-334455667788";

describe("the stored value", () => {
  it("round-trips the keys it was given, in order", () => {
    const keys = [
      topicPrepReadyKey(VIEWER, CLUB),
      topicPrepReadyKey(VIEWER, CAMP),
    ];

    expect(parseTopicPrepReadyCookie(serialiseTopicPrepReady(keys))).toEqual(
      keys,
    );
  });

  it("survives being URL-encoded on the way out and back", () => {
    const keys = [topicPrepReadyKey(VIEWER, CLUB)];
    const encoded = encodeURIComponent(serialiseTopicPrepReady(keys));

    expect(parseTopicPrepReadyCookie(encoded)).toEqual(keys);
  });

  it("reads nothing out of an absent or empty cookie", () => {
    expect(parseTopicPrepReadyCookie(undefined)).toEqual([]);
    expect(parseTopicPrepReadyCookie("")).toEqual([]);
  });

  /**
   * The shape a value clipped at a byte limit ends in, plus the shapes a
   * hand-edit produces. Each entry is judged on its own, so one bad one does
   * not throw away the answers around it.
   */
  it("drops the entries it cannot read and keeps the ones it can", () => {
    const good = topicPrepReadyKey(VIEWER, CLUB);

    expect(
      parseTopicPrepReadyCookie(
        `${good},,no-separator,:missing-viewer,missing-participation:,a:b:c`,
      ),
    ).toEqual([good]);
  });

  it("ignores a repeat of a key it has already read", () => {
    const key = topicPrepReadyKey(VIEWER, CLUB);

    expect(parseTopicPrepReadyCookie(`${key},${key}`)).toEqual([key]);
  });
});

describe("the cap", () => {
  /**
   * This cookie rides on every request to the site, so it is not a store to let
   * grow. Past the cap the **oldest** answers go: the newest is the one the
   * reader has just given and would notice being ignored, and losing an old one
   * costs a click.
   */
  it("drops the oldest entries and keeps the newest", () => {
    const keys = Array.from({ length: 200 }, (_, index) =>
      topicPrepReadyKey(VIEWER, `${index}`.padStart(36, "0")),
    );

    const value = serialiseTopicPrepReady(keys);
    const kept = parseTopicPrepReadyCookie(value);

    expect(value.length).toBeLessThanOrEqual(TOPIC_PREP_COOKIE_MAX_CHARS);
    expect(kept.length).toBeLessThan(keys.length);
    expect(kept[kept.length - 1]).toBe(keys[keys.length - 1]);
    expect(kept[0]).not.toBe(keys[0]);
  });
});

describe("reading it for one viewer", () => {
  /**
   * A parent and a child share one computer and one browser profile far more
   * often than they share a dashboard, so a parent finishing with a guide must
   * not take it away from the child who has not read it.
   */
  it("answers only for the viewer asked about", () => {
    const value = serialiseTopicPrepReady([
      topicPrepReadyKey(VIEWER, CLUB),
      topicPrepReadyKey(OTHER_VIEWER, CAMP),
    ]);

    expect([...topicPrepReadyFor(value, VIEWER)]).toEqual([CLUB]);
    expect([...topicPrepReadyFor(value, OTHER_VIEWER)]).toEqual([CAMP]);
  });

  it("answers with nothing for a viewer who has stored nothing", () => {
    const value = serialiseTopicPrepReady([topicPrepReadyKey(VIEWER, CLUB)]);

    expect(topicPrepReadyFor(value, OTHER_VIEWER).size).toBe(0);
    expect(topicPrepReadyFor(undefined, VIEWER).size).toBe(0);
  });
});
