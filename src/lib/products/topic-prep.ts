import type { DeliveryMode, ProductTopic } from "@/types";
import {
  familyBringsOwnMachine,
  hasVoiceRoom,
} from "@/lib/products/delivery-mode";
import {
  PRODUCT_TOPICS,
  REMOTE_SESSION_STEP,
  topicHasAccountsOnlyIntro,
  topicHasPrep,
  type TopicPrepPlan,
  type TopicPrepStep,
} from "./topics";

/**
 * The whole render decision for one product: which steps apply, which intro
 * they take, and — as `null` — whether anything applies at all.
 *
 * The delivery mode is asked two separate questions, each through its own
 * helper: whether the family sets up a machine of their own
 * (`familyBringsOwnMachine`, which keeps the topic's `ownDevice` steps), and
 * whether the sessions have a voice room (`hasVoiceRoom`, which appends the
 * shared voice-room step).
 *
 * `null` covers both ways a surface ends up with nothing to draw, because a
 * caller cannot usefully tell them apart: the topic has no guide, or every one
 * of its steps belongs to something School of Gaming is supplying — a device,
 * or a login — and there is no voice room to get ready for. The three
 * Minecraft topics in person are the second case, and it is why the answer is
 * a predicate over the *filtered* steps rather than over `prep` alone. A
 * product with a voice room never answers `null`.
 */
export function resolveTopicPrep(
  topic: ProductTopic,
  mode: DeliveryMode,
): TopicPrepPlan | null {
  const roomSteps = hasVoiceRoom(mode) ? [REMOTE_SESSION_STEP] : [];

  // The topic brings nothing that applies here — no guide of its own, or only
  // steps School of Gaming is supplying — so the guide is the voice-room step
  // alone where there is a room, and nothing where there is not.
  const roomOnly: TopicPrepPlan | null =
    roomSteps.length > 0 ? { form: "remoteOnly", steps: roomSteps } : null;

  if (!topicHasPrep(topic)) return roomOnly;

  // Read through the const map rather than the declared shape, so the step
  // keys stay the literals the message catalog is checked against.
  const declared: readonly TopicPrepStep[] = PRODUCT_TOPICS[topic].prep.steps;
  const applicable = familyBringsOwnMachine(mode)
    ? declared
    : declared.filter((step) => step.scope === "always");

  if (applicable.length === 0) return roomOnly;

  // The shared step goes last, after everything the topic itself asked for: it
  // is the one thing to do once the game is installed and signed into.
  const steps = [...applicable, ...roomSteps];

  if (applicable.length === declared.length) {
    return { form: "full", topic, steps };
  }

  // Something was filtered out, so the guide is the accounts-only form — which
  // only a topic declaring the second intro can be in. A topic that filters
  // without declaring one is a registry mistake, and rendering the full intro
  // over a shortened guide is the smaller of the two wrongs available here.
  return topicHasAccountsOnlyIntro(topic)
    ? { form: "accountsOnly", topic, steps }
    : { form: "full", topic, steps };
}
