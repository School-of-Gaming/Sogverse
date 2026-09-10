/**
 * **Topic copy review** — every topic's "About {name}" card and its "Before the
 * first session" guide, in every real locale, at both widths.
 *
 *   node scripts/preview-export/export.mjs --preset topic-copy
 *
 * The surfaces are the admin-only preview scenes rather than real products:
 * they are fixture-driven, carry no family's data, and take the topic as a
 * `?topic=` lens, which is the only way to see all twelve topics without twelve
 * real products existing.
 *
 *   About card          /{locale}/preview/products/consumer-club?topic=…
 *   Guide, remote       /{locale}/preview/confirmation/consumer-club?topic=…
 *   Guide, in person    /{locale}/preview/confirmation/camp-open?topic=…
 *
 * **One group per topic, which is one image per topic.** Everything a reviewer
 * needs about Fortnite is in the Fortnite picture — its About views, its remote
 * guide, and its in-person guide where it has one — because the reviewer's unit
 * of attention is a topic, and eight files is a review that posts as a single
 * Slack message. The in-person form was an appendix of its own for a while, and
 * that made a reader hold one topic in their head while scrolling past seven
 * others.
 *
 * **Every entry is a full-page shot, not a crop of the card.** The owner's
 * reason: *"The whole point is that the screenshot is able to take an image of
 * the content in its context as if it was viewed on an actual desktop or mobile
 * device."* So each entry photographs the whole page — header, body, the card in
 * its place, footer — and the card's own locator survives only as the `waitFor`
 * that proves the page finished rendering it.
 *
 * **The registry is imported from TypeScript, not restated here.**
 * `src/lib/products/topics.ts` has only type-level imports, so Node's own type
 * stripping loads it with no build step and no dependency. Which topics have a
 * card, which have a guide, and which of them still render one in person are
 * then the app's answers rather than a list here that goes stale.
 */
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  resolveTopicPrep,
  topicHasInfoCard,
  topicHasPrep,
} from "../../../src/lib/products/topics.ts";

/**
 * Any one of the label-only topics stands in for all of them: their guide is
 * the shared voice-room step under the generic intro, with nothing keyed by
 * topic in it, so a second would print the same words again. It is included at
 * all because that one-step guide is real copy nobody would otherwise see here.
 */
const LABEL_ONLY_SAMPLE = "programming";

const TOPICS = (() => {
  const own = PRODUCT_TOPIC_VALUES.filter(
    (t) => topicHasInfoCard(t) || topicHasPrep(t),
  );
  return own.includes(LABEL_ONLY_SAMPLE) ? own : [...own, LABEL_ONLY_SAMPLE];
})();

// ---------------------------------------------------------------------------
// Waiting for the card the page is being shot for
// ---------------------------------------------------------------------------

/**
 * The shot is the whole page, but the *reason* for the shot is one card on it —
 * so the run waits for that card before shooting, or a slow render would be
 * photographed as a page that simply does not have the thing under review.
 *
 * **Neither handle needed a test id added to the app**, because both survive
 * translation: the About card's heading interpolates the topic's brand label,
 * which the app never translates ("About Minecraft Java", "Tietoa Minecraft
 * Java"), and the guide is the only numbered list on the confirmation page
 * ("what happens next" beside it is a bulleted `ul`).
 */
const aboutHeading = (label) => `h2:has-text(${JSON.stringify(label)})`;
const prepList = "ol.list-decimal";

// ---------------------------------------------------------------------------
// The preset
// ---------------------------------------------------------------------------

const groups = TOPICS.map((topic) => {
  const label = PRODUCT_TOPICS[topic]?.label ?? topic;
  const entries = [];

  if (topicHasInfoCard(topic)) {
    entries.push({
      slug: `${topic}--about`,
      label: "About card — product page",
      route: `/preview/products/consumer-club?topic=${topic}`,
      capture: "fullPage",
      waitFor: aboutHeading(label),
    });
  }

  entries.push({
    slug: `${topic}--prep`,
    label: "Before the first session — remote club",
    route: `/preview/confirmation/consumer-club?topic=${topic}`,
    capture: "fullPage",
    waitFor: prepList,
  });

  // Only where the topic still has something for the family to do in person.
  // Asked of the resolver rather than listed, because the answer moves when a
  // step's scope changes.
  if (resolveTopicPrep(topic, false) !== null) {
    entries.push({
      slug: `${topic}--prep-in-person`,
      label: "Before the first session — in person, accounts only",
      route: `/preview/confirmation/camp-open?topic=${topic}`,
      capture: "fullPage",
      waitFor: prepList,
    });
  }

  return { label, entries };
});

export default {
  title: "Topic copy review",
  description:
    "Every topic's About card and \"Before the first session\" guide, in each locale at two widths.",
  groups,
};
