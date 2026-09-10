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
 * The in-person form is the accounts-only one — the steps still the family's to
 * do once School of Gaming has brought the machines and the logins — and only
 * some topics render it at all, so it is an appendix group rather than a third
 * entry under every topic.
 *
 * **The registry is imported from TypeScript, not restated here.**
 * `src/lib/products/topics.ts` has only type-level imports, so Node's own type
 * stripping loads it with no build step and no dependency. Which topics have a
 * card, which have a guide, and which steps survive the in-person filter are
 * then the app's answers rather than a list here that goes stale.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  resolveTopicPrep,
  topicHasInfoCard,
  topicHasPrep,
} from "../../../src/lib/products/topics.ts";

const MESSAGES_DIR = path.join(import.meta.dirname, "..", "..", "..", "messages");

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
// Locating the two cards
// ---------------------------------------------------------------------------

/**
 * The nearest enclosing card. `Card` renders a plain div carrying the app's
 * card classes, so the class pair is the handle, and `[1]` on the ancestor axis
 * takes the innermost one.
 *
 * **No test ids were added to the app for this**, because both cards already
 * have an anchor inside them that survives translation:
 *
 * - the About card's heading interpolates the topic's brand label, which the
 *   app never translates ("About Minecraft Java", "Tietoa Minecraft Java"), and
 *   it is the only `h2` on the product page carrying it — the product's own
 *   name is an `h1`;
 * - the guide is the only numbered list on the confirmation page ("what happens
 *   next" beside it is a bulleted `ul`), so no text has to be matched at all.
 */
const NEAREST_CARD =
  'xpath=ancestor::div[contains(@class,"rounded-lg") and contains(@class,"border")][1]';

const aboutCard = (label) =>
  `h2:has-text(${JSON.stringify(label)}) >> ${NEAREST_CARD}`;
const prepCard = `ol.list-decimal >> ${NEAREST_CARD}`;

// ---------------------------------------------------------------------------
// The words, read from the same catalog the cards render from
// ---------------------------------------------------------------------------

const catalogs = new Map();

function catalog(locale) {
  if (!catalogs.has(locale)) {
    const p = path.join(MESSAGES_DIR, `${locale}.json`);
    catalogs.set(locale, existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
  }
  return catalogs.get(locale);
}

/**
 * One message, as plain text.
 *
 * A few prep bodies carry `<b>` around the clause that costs a family the
 * session if they skim it. The tags are markup for `t.rich`, not words, so they
 * come off — the reviewer is reading the sentence, and a stray `<b>` in a
 * pasted correction is a second thing to explain.
 *
 * A key the catalog has nothing under yields `null` rather than throwing: a
 * translation in progress is a normal state of this repo, and a half-filled
 * locale should still print the lines it has.
 */
function message(locale, dottedKey) {
  let node = catalog(locale);
  for (const part of dottedKey.split(".")) {
    if (node === null || typeof node !== "object") return null;
    node = node[part];
  }
  return typeof node === "string" ? node.replace(/<\/?b>/g, "") : null;
}

/** Collect keys in render order, skipping the ones the catalog has nothing for. */
function lines(locale, keys) {
  const out = [];
  for (const key of keys) {
    const text = message(locale, key);
    if (text) out.push({ label: key.split(".").pop(), text });
  }
  return out;
}

const aboutText = (topic) => (locale) =>
  lines(locale, [
    `productDetail.topicInfo.topics.${topic}.description`,
    `productDetail.topicInfo.topics.${topic}.note`,
    `productDetail.topicInfo.topics.${topic}.linkLabel`,
  ]);

/** Exactly what `TopicPrepContent` renders for this plan, in its order. */
const prepText = (topic, isRemote) => (locale) => {
  const plan = resolveTopicPrep(topic, isRemote);
  if (plan === null) return [];
  const keys = [
    plan.form === "remoteOnly"
      ? "topicPrep.remoteOnlyIntro"
      : plan.form === "accountsOnly"
        ? `topicPrep.accountsOnlyIntro.${plan.topic}`
        : `topicPrep.topics.${plan.topic}.intro`,
  ];
  for (const step of plan.steps) {
    keys.push(`topicPrep.steps.${step.key}.title`);
    keys.push(`topicPrep.steps.${step.key}.body`);
    if (step.url !== undefined) keys.push(`topicPrep.steps.${step.key}.linkLabel`);
    for (const note of step.platformNotes ?? []) {
      keys.push(`topicPrep.platformNotes.${note}.title`);
      keys.push(`topicPrep.platformNotes.${note}.body`);
    }
    for (const item of step.checklist ?? []) keys.push(`topicPrep.checklist.${item}`);
  }
  keys.push("topicPrep.closing");
  return lines(locale, keys);
};

// ---------------------------------------------------------------------------
// The preset
// ---------------------------------------------------------------------------

const groups = [];

for (const topic of TOPICS) {
  const label = PRODUCT_TOPICS[topic]?.label ?? topic;
  const entries = [];

  if (topicHasInfoCard(topic)) {
    entries.push({
      slug: `${topic}--about`,
      label: "About card",
      notes: "Product detail page, remote club fixture.",
      route: `/preview/products/consumer-club?topic=${topic}`,
      capture: { selector: aboutCard(label) },
      text: aboutText(topic),
    });
  }

  entries.push({
    slug: `${topic}--prep`,
    label: "Before the first session",
    notes: "Purchase confirmation, remote club — every step applies.",
    route: `/preview/confirmation/consumer-club?topic=${topic}`,
    capture: { selector: prepCard },
    text: prepText(topic, true),
  });

  groups.push({ label, entries });
}

// The appendix: the topics that still render a guide on an in-person product.
// Derived rather than listed, because which ones they are is the resolver's
// answer and moves when a step's scope changes.
const inPerson = TOPICS.filter((topic) => resolveTopicPrep(topic, false) !== null);
if (inPerson.length > 0) {
  groups.push({
    label: "Appendix — in-person products (accounts only)",
    entries: inPerson.map((topic) => ({
      slug: `${topic}--prep-in-person`,
      label: PRODUCT_TOPICS[topic]?.label ?? topic,
      notes:
        "Purchase confirmation, camp fixture — only what is still the family's to do.",
      route: `/preview/confirmation/camp-open?topic=${topic}`,
      capture: { selector: prepCard },
      text: prepText(topic, false),
    })),
  });
}

export default {
  title: "Topic copy review",
  description:
    "Every topic's About card and \"Before the first session\" guide, in each locale at two widths.",
  groups,
};
