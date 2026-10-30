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
import type { TopicPrepPlan, TopicPrepStep } from "@/lib/products/topics";
import type { TopicPrepTranslator } from "./translator";

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
 * in this mail and on their My SOG enrolment card reads one guide twice rather
 * than two guides. Which steps apply is
 * `resolveTopicPrep`'s answer and not this file's — an in-person product
 * renders only the account steps, because School of Gaming brings the machines,
 * a remote one gains the shared step about the voice room's mic and camera, a
 * hybrid one takes two lists, the second under a heading for joining from home,
 * and a topic whose in-person machine and login are both ours takes one note
 * under the heading, with no list and no closing (see the registry's header
 * note).
 *
 * **Both halves take the plan rather than resolving one.** Which steps apply is
 * `resolveTopicPrep`'s answer, made **once** at the call site and handed to
 * both — the HTML body and its plain-text twin state the same document, and two
 * resolves are two chances for them to state different ones. It is also where
 * the empty answer is handled: a `null` plan is a label-only topic on an
 * in-person product, and the caller composes no section at all rather than a
 * section label over a closing line. A remote product always has something,
 * because the room always does.
 *
 * The translator is scoped to `topicPrep` rather than to `email` — see
 * `translator.ts` for why the mail takes a second translator instead of a
 * second copy of the prose.
 */

/**
 * The intro this form takes: the topic's own, the accounts-only twin, or one of
 * the two generic lines — the hybrid guide's, or the one for a guide that is
 * the shared voice-room step alone. Only two of the forms carry a topic the
 * catalog has an intro for.
 */
function introOf(
  t: TopicPrepTranslator,
  plan: Exclude<TopicPrepPlan, { form: "suppliedNote" }>,
): string {
  if (plan.form === "hybrid") return t("hybridIntro");
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
function stepItem(t: TopicPrepTranslator, step: TopicPrepStep): string {
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
 * The guide as HTML blocks, from a plan the caller has already resolved.
 *
 * The caller splices the result straight into its own content. A product with
 * nothing to say has no plan to hand over, so "nothing applies" is answered
 * before this function rather than inside it.
 */
export function buildTopicPrepSection(
  t: TopicPrepTranslator,
  plan: TopicPrepPlan,
): string {
  if (plan.form === "suppliedNote") {
    return [
      sectionLabel(t("heading")),
      paragraph(t("suppliedInPersonNote")),
    ].join("");
  }

  const list = (steps: readonly TopicPrepStep[]) =>
    numberedList(steps.map((step) => stepItem(t, step)));

  return [
    sectionLabel(t("heading")),
    paragraph(introOf(t, plan)),
    list(plan.steps),
    ...(plan.form === "hybrid"
      ? [sectionLabel(t("homeHeading")), list(plan.homeSteps)]
      : []),
    paragraph(t("closing")),
  ].join("");
}

/** One list of steps as text lines, numbered from one, each step ending blank. */
function stepLines(
  t: TopicPrepTranslator,
  steps: readonly TopicPrepStep[],
): string[] {
  const lines: string[] = [];

  steps.forEach((step, index) => {
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

  return lines;
}

/**
 * The same guide as plain-text lines, in the same order — the twin a mail
 * carrying a calendar part needs, because Exchange fills the entry's notes from
 * the body and would otherwise flatten the markup into them.
 *
 * Lines rather than one string, so the caller splices them into its own text
 * body at the position the HTML section sits at, with the blank lines around it
 * decided there. It takes the same plan its HTML twin was handed, which is what
 * stops the two from stating different documents.
 */
export function topicPrepText(
  t: TopicPrepTranslator,
  plan: TopicPrepPlan,
): string[] {
  if (plan.form === "suppliedNote") {
    return [t("heading"), "", t("suppliedInPersonNote")];
  }

  return [
    t("heading"),
    "",
    introOf(t, plan),
    "",
    ...stepLines(t, plan.steps),
    ...(plan.form === "hybrid"
      ? [t("homeHeading"), "", ...stepLines(t, plan.homeSteps)]
      : []),
    t("closing"),
  ];
}
