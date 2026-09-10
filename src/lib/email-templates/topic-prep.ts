import {
  bulletList,
  inlineBold,
  inlineLink,
  numberedList,
  sectionLabel,
  MARKUP_TAGS,
  PLAIN_MARKUP_TAGS,
} from "./blocks";
import { paragraph } from "./utils";
import { resolveTopicPrep, type TopicPrepPlan } from "@/lib/products/topics";
import type { TopicPrepTranslator } from "./translator";
import type { ProductTopic } from "@/types";

/**
 * The "Before the first session" guide, as a mail section.
 *
 * **It is not a mail.** It is a run of blocks a mail drops in, so it composes
 * no shell, no heading and no button — the mail around it owns those, and this
 * is why the file exports no `build*Email` and is not in the template registry.
 *
 * **It is the same document the app renders**, from the same registry and the
 * same message catalog: the steps come from the topic's `prep` block and the
 * prose from the top-level `topicPrep` namespace, so a family reading the guide
 * on the confirmation page, in this mail and on their My SOG enrolment card
 * reads one guide three times rather than three guides. Which steps apply is
 * `resolveTopicPrep`'s answer and not this file's — an in-person product
 * renders only the account steps, because School of Gaming brings the machines,
 * and a remote one gains the shared step about the voice room's mic and camera
 * (see the registry's header note).
 *
 * **Both halves return empty rather than something short.** They do it for one
 * remaining reason: an in-person product with nothing left after the filter —
 * whether the topic never had steps of its own, or every one of them belongs to
 * a machine we are supplying. There is nothing to tell that family to do, and a
 * section label over a closing line would be a paragraph of furniture saying
 * so. A remote product always has something, because the room always does.
 *
 * The translator is scoped to `topicPrep` rather than to `email` — see
 * `translator.ts` for why the mail takes a second translator instead of a
 * second copy of the prose.
 */

/**
 * The intro this form takes: the topic's own, the accounts-only twin, or — for
 * a label-only topic whose remote guide is the shared step alone — the one
 * generic line. Three branches rather than two because only two of the forms
 * carry a topic the catalog has an intro for.
 */
function introOf(t: TopicPrepTranslator, plan: TopicPrepPlan): string {
  if (plan.form === "remoteOnly") return t("remoteOnlyIntro");
  return plan.form === "accountsOnly"
    ? t(`accountsOnlyIntro.${plan.topic}`)
    : t(`topics.${plan.topic}.intro`);
}

/**
 * One step as a list item: its title, its body, and whatever the registry
 * declared under it.
 *
 * The title is bold rather than a heading, because it lives inside an `<li>` —
 * a heading there would restart the mail's own type scale in the middle of a
 * list. Everything else follows the block it belongs to: a link is the
 * directory's inline one, the per-platform notes are a bold lead-in and a
 * sentence, and a checklist is the ordinary bulleted list nested inside the
 * numbered one.
 */
function stepItem(
  t: TopicPrepTranslator,
  step: TopicPrepPlan["steps"][number],
): string {
  const parts = [
    inlineBold(t(`steps.${step.key}.title`)),
    "<br />",
    t.markup(`steps.${step.key}.body`, MARKUP_TAGS),
  ];

  if ("url" in step) {
    parts.push("<br />", inlineLink(step.url, t(`steps.${step.key}.linkLabel`)));
  }

  if ("platformNotes" in step) {
    for (const note of step.platformNotes) {
      parts.push(
        "<br /><br />",
        inlineBold(t(`platformNotes.${note}.title`)),
        "<br />",
        t(`platformNotes.${note}.body`),
      );
    }
  }

  if ("checklist" in step) {
    parts.push(
      bulletList(step.checklist.map((item) => t(`checklist.${item}`))),
    );
  }

  return parts.join("");
}

/**
 * The guide as HTML blocks, or an empty string where nothing applies.
 *
 * The caller splices the result straight into its own content, so an empty
 * return costs the mail nothing — no wrapper to leave behind, no gap to close.
 */
export function buildTopicPrepSection(
  t: TopicPrepTranslator,
  topic: ProductTopic,
  isRemote: boolean,
): string {
  const plan = resolveTopicPrep(topic, isRemote);
  if (plan === null) return "";

  return [
    sectionLabel(t("heading")),
    paragraph(introOf(t, plan)),
    numberedList(plan.steps.map((step) => stepItem(t, step))),
    paragraph(t("closing")),
  ].join("");
}

/**
 * The same guide as plain-text lines, in the same order — the twin a mail
 * carrying a calendar part needs, because Exchange fills the entry's notes from
 * the body and would otherwise flatten the markup into them.
 *
 * Lines rather than one string, so the caller splices them into its own text
 * body at the position the HTML section sits at, with the blank lines around it
 * decided there. Empty where nothing applies, exactly as the HTML half is.
 */
export function topicPrepText(
  t: TopicPrepTranslator,
  topic: ProductTopic,
  isRemote: boolean,
): string[] {
  const plan = resolveTopicPrep(topic, isRemote);
  if (plan === null) return [];

  const lines: string[] = [t("heading"), "", introOf(t, plan), ""];

  plan.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${t(`steps.${step.key}.title`)}`);
    lines.push(t.markup(`steps.${step.key}.body`, PLAIN_MARKUP_TAGS));

    if ("url" in step) {
      lines.push(`${t(`steps.${step.key}.linkLabel`)}: ${step.url}`);
    }
    if ("platformNotes" in step) {
      for (const note of step.platformNotes) {
        lines.push(
          `${t(`platformNotes.${note}.title`)}: ${t(`platformNotes.${note}.body`)}`,
        );
      }
    }
    if ("checklist" in step) {
      for (const item of step.checklist) {
        lines.push(`- ${t(`checklist.${item}`)}`);
      }
    }
    lines.push("");
  });

  lines.push(t("closing"));
  return lines;
}
