/**
 * **Topic copy review** — every topic's "About {name}" card and every
 * "Before the first session" guide, in every real locale, at both widths.
 *
 *   node scripts/preview-export/export.mjs --preset topic-copy
 *
 * The surfaces are the admin-only preview scenes rather than real products:
 * they are fixture-driven, carry no family's data, and the product scene takes
 * the topic as a `?topic=` lens, which is the only way to see all twelve About
 * cards without twelve real products existing.
 *
 *   About card          /{locale}/preview/products/consumer-club?topic=…
 *   Guides, remote      /{locale}/preview/topic-prep/remote
 *   Guides, in person   /{locale}/preview/topic-prep/in-person
 *
 * **One group per topic for the About cards, which is one image per topic**,
 * because the reviewer's unit of attention there is a topic. **The guides are
 * one group of their own.** No page a family meets shows a guide in a preview
 * scene any more — they live in the confirmation mail and behind the My SOG
 * enrolment card's dialog — so the topic-prep scene, which lays every guide
 * out in one reading column per form, is where they are photographed: two
 * shots cover all of them.
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
 * stripping loads it with no build step and no dependency (a unit test holds the
 * file to that). Which topics have a card is then the app's answer rather than
 * a list here that goes stale.
 */
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  topicHasInfoCard,
} from "../../../src/lib/products/topics.ts";

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
 * Java"), and a guide's steps are a numbered list, the only kind on the
 * topic-prep scene.
 */
const aboutHeading = (label) => `h2:has-text(${JSON.stringify(label)})`;
const prepList = "ol.list-decimal";

// ---------------------------------------------------------------------------
// The preset
// ---------------------------------------------------------------------------

const aboutGroups = PRODUCT_TOPIC_VALUES.filter(topicHasInfoCard).map(
  (topic) => {
    const label = PRODUCT_TOPICS[topic]?.label ?? topic;
    return {
      label,
      entries: [
        {
          slug: `${topic}--about`,
          label: "About card — product page",
          route: `/preview/products/consumer-club?topic=${topic}`,
          capture: "fullPage",
          waitFor: aboutHeading(label),
        },
      ],
    };
  },
);

const guidesGroup = {
  label: "Before the first session",
  entries: [
    {
      slug: "prep--remote",
      label: "Every guide — remote products",
      route: "/preview/topic-prep/remote",
      capture: "fullPage",
      waitFor: prepList,
    },
    {
      slug: "prep--in-person",
      label: "Every guide — in person, accounts only",
      route: "/preview/topic-prep/in-person",
      capture: "fullPage",
      waitFor: prepList,
    },
  ],
};

const preset = {
  title: "Topic copy review",
  description:
    "Every topic's About card and every \"Before the first session\" guide, in each locale at two widths.",
  groups: [...aboutGroups, guidesGroup],
};

export default preset;
