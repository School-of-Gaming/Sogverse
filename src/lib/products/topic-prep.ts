import type { DeliveryMode, ProductTopic } from "@/types";
import {
  familyBringsOwnMachine,
  gamersAttendSite,
  hasVoiceRoom,
} from "@/lib/products/delivery-mode";
import {
  PRODUCT_TOPICS,
  REMOTE_SESSION_STEP,
  VENUE_VOICE_ROOM_STEP,
  topicHasAccountsOnlyIntro,
  topicHasPrep,
  topicIsSuppliedInPerson,
  type TopicPrepPlan,
  type TopicPrepStep,
} from "./topics";

/**
 * The hybrid guide: everything that applies wherever the child is, then what
 * joining from home adds. It works for every topic, because the two shared
 * steps are there whatever the topic brought — a label-only topic's sections
 * hold them alone, and a topic with no `always` steps opens on the venue step.
 */
function resolveHybridPrep(topic: ProductTopic): TopicPrepPlan {
  // Read through the const map rather than the declared shape, so the step
  // keys stay the literals the message catalog is checked against.
  const declared: readonly TopicPrepStep[] = topicHasPrep(topic)
    ? PRODUCT_TOPICS[topic].prep.steps
    : [];

  return {
    form: "hybrid",
    steps: [
      ...declared.filter((step) => step.scope === "always"),
      VENUE_VOICE_ROOM_STEP,
    ],
    homeSteps: [
      ...declared.filter((step) => step.scope === "ownDevice"),
      REMOTE_SESSION_STEP,
    ],
  };
}

/**
 * The whole render decision for one product: which steps apply, which intro
 * they take, and — as `null` — whether anything applies at all.
 *
 * A product with gamers at a site and a voice room takes the two-section hybrid
 * guide. For any other, the delivery mode is asked two separate questions, each
 * through its own helper: whether the family sets up a machine of their own
 * (`familyBringsOwnMachine`, which keeps the topic's `ownDevice` steps), and
 * whether the sessions have a voice room (`hasVoiceRoom`, which appends the
 * shared voice-room step).
 *
 * Where every declared step filters out and there is no voice room, the topic
 * decides: one declaring `suppliedInPerson` — the three Minecraft topics, whose
 * machine and login are both ours in person — takes the `suppliedNote` form.
 * That is why the answer is a predicate over the *filtered* steps rather than
 * over `prep` alone.
 *
 * `null` is the one way a surface ends up with nothing to draw: no step
 * applies, and nothing declares a note, which is a label-only topic in person.
 * A product with a voice room never answers `null`.
 */
export function resolveTopicPrep(
  topic: ProductTopic,
  mode: DeliveryMode,
): TopicPrepPlan | null {
  if (hasVoiceRoom(mode) && gamersAttendSite(mode)) {
    return resolveHybridPrep(topic);
  }

  const roomSteps = hasVoiceRoom(mode) ? [REMOTE_SESSION_STEP] : [];

  // A topic with no guide of its own: the guide is the voice-room step alone
  // where there is a room, and nothing where there is not.
  if (!topicHasPrep(topic)) {
    return roomSteps.length > 0
      ? { form: "remoteOnly", steps: roomSteps }
      : null;
  }

  // Read through the const map, as the hybrid guide does.
  const declared: readonly TopicPrepStep[] = PRODUCT_TOPICS[topic].prep.steps;
  const applicable = familyBringsOwnMachine(mode)
    ? declared
    : declared.filter((step) => step.scope === "always");

  if (applicable.length === 0) {
    return topicIsSuppliedInPerson(topic) ? { form: "suppliedNote" } : null;
  }

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
