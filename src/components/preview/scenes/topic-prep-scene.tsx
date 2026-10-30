/* eslint-disable i18next/no-literal-string -- every literal in this file is preview scaffolding on an admin-only page: the column's own title, the per-topic heading's fallback line and the label-only card's heading. The guides themselves are the translated part, and they come from <TopicPrepContent> */
import { Heading } from "@sog/ui";
import { Card, CardContent } from "@/components/ui/card";
import { TopicPrepContent } from "@/components/topic-prep/TopicPrepContent";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  topicHasPrep,
} from "@/lib/products/topics";
import { resolveTopicPrep } from "@/lib/products/topic-prep";
import type { DeliveryMode, ProductTopic } from "@/types";

/**
 * Every topic's "Before the first session" guide, one after another.
 *
 * The guide's three real homes each show **one** guide, on a product that
 * happens to carry that topic — so reading them all means opening a page per topic,
 * and comparing two of them means remembering the first. This scene is the
 * reading surface the writing needs: the whole set in one column, in the
 * locale of the URL, so the locale switcher in the header *is* the per-locale
 * review pass.
 *
 * It is not a fourth surface for the guide and does not become one — it renders
 * the same `<TopicPrepContent>` the app's surfaces render, in a card, with the
 * topic's own label above it and nothing else added. The card is here because
 * a run of guides with no boundary between them reads as one long guide, which
 * is exactly the comparison this page exists to make possible.
 *
 * The scenarios are the delivery modes, and they are scenarios rather than an
 * axis because no product is two of them: `remote` renders every step,
 * `in-person` only the steps that are still the family's to do, and `hybrid`
 * the two-section guide. The three Minecraft topics show their one note in
 * person, because the login there is ours as well as the machine.
 *
 * The columns with a room carry one card the topic registry cannot name: the
 * guide every label-only topic gets, which has nothing keyed by topic in it. It
 * is rendered on every label-only topic, so it is read once here rather than
 * once per topic.
 */

/**
 * Any one of the label-only topics stands in for all of them: their guide
 * is the shared steps under a generic intro, with nothing keyed by topic in
 * it, so rendering a second would render the same words again.
 */
const LABEL_ONLY_SAMPLE: ProductTopic = "esports";

export const TOPIC_PREP_SCENARIOS = ["remote", "in-person", "hybrid"] as const;

export type TopicPrepSceneScenario = (typeof TOPIC_PREP_SCENARIOS)[number];

const SCENARIO_MODE = {
  remote: "online",
  "in-person": "in_person",
  hybrid: "hybrid",
} as const satisfies Record<TopicPrepSceneScenario, DeliveryMode>;

const SCENARIO_HEADING = {
  remote: "online products",
  "in-person": "in-person products",
  hybrid: "hybrid products",
} as const satisfies Record<TopicPrepSceneScenario, string>;

const SCENARIO_NOTE = {
  remote:
    "Every step of every guide, plus the shared voice-room step every product with a voice room ends on.",
  "in-person":
    "Only what is still the family's to do: School of Gaming brings the machines with the software already on them, and the Minecraft logins as well.",
  hybrid:
    "What applies wherever the child is, ending on joining the room at the venue, then what joining from home adds.",
} as const satisfies Record<TopicPrepSceneScenario, string>;

export function isTopicPrepScenario(s: string): s is TopicPrepSceneScenario {
  return (TOPIC_PREP_SCENARIOS as readonly string[]).includes(s);
}

export function TopicPrepScene({
  scenario,
}: {
  scenario: TopicPrepSceneScenario;
}) {
  const mode = SCENARIO_MODE[scenario];
  const topics = PRODUCT_TOPIC_VALUES.filter(topicHasPrep);
  // Null in person, and never null with a room — every product with a room has
  // the shared voice-room step — so the card below is conditional on the answer
  // like every other card on this page.
  const labelOnlyPlan = resolveTopicPrep(LABEL_ONLY_SAMPLE, mode);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-1">
          <Heading level={1} step="section">
            Topic prep guides &mdash; {SCENARIO_HEADING[scenario]}
          </Heading>
          <p className="text-sm text-muted-foreground">
            {SCENARIO_NOTE[scenario]}
          </p>
        </div>

        {topics.map((topic) => {
          // The one resolve per card: the same answer decides whether there is
          // a guide here at all and what the guide is.
          const plan = resolveTopicPrep(topic, mode);
          if (plan === null) return null;
          return (
            <Card key={topic}>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <Heading level={2} step="card-title">
                  {PRODUCT_TOPICS[topic].label}
                </Heading>
                <TopicPrepContent plan={plan} />
              </CardContent>
            </Card>
          );
        })}

        {/* The label-only topics render one identical guide, so they get
            one card rather than one each. In person they have nothing to
            say. */}
        {labelOnlyPlan !== null && (
          <Card>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <Heading level={2} step="card-title">
                Any other topic
              </Heading>
              <TopicPrepContent plan={labelOnlyPlan} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
