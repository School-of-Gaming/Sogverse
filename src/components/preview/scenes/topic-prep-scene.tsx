/* eslint-disable i18next/no-literal-string -- every literal in this file is preview scaffolding on an admin-only page: the column's own title, the per-topic heading's fallback line, the label-only card's heading, and the note that a topic renders nothing in this form. The guides themselves are the translated part, and they come from <TopicPrepContent> */
import { Card, CardContent } from "@/components/ui/card";
import { TopicPrepContent } from "@/components/topic-prep/TopicPrepContent";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  resolveTopicPrep,
  topicHasPrep,
} from "@/lib/products/topics";
import type { ProductTopic } from "@/types";

/**
 * Every topic's "Before the first session" guide, one after another.
 *
 * The guide's three real homes each show **one** guide, on a product that
 * happens to carry that topic — so reading all seven means opening seven pages,
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
 * The two scenarios are the two forms a guide is filtered into, and they are
 * scenarios rather than an axis because no product is both: `remote` renders
 * every step, `in-person` only the steps that are still the family's to do. A
 * topic that filters down to nothing says so in a muted line instead of
 * vanishing — the three Minecraft topics are deliberately empty in person,
 * because the login there is ours as well as the machine, and a page that
 * simply skipped them would look identical to one where the guides had gone
 * missing.
 *
 * The `remote` column carries one card the topic registry cannot name: the
 * one-step guide every label-only topic gets, which is the shared
 * remote-session step under the generic intro. It is written once and rendered
 * on five topics, so it is read once here rather than five times — and it only
 * exists in this column, which is why `in-person` is unchanged.
 */

/**
 * Any one of the five label-only topics stands in for all of them: their guide
 * is the shared step under the generic intro, with nothing keyed by topic in
 * it, so rendering a second would render the same words again.
 */
const LABEL_ONLY_SAMPLE: ProductTopic = "esports";

export const TOPIC_PREP_SCENARIOS = ["remote", "in-person"] as const;

export type TopicPrepSceneScenario = (typeof TOPIC_PREP_SCENARIOS)[number];

export function isTopicPrepScenario(s: string): s is TopicPrepSceneScenario {
  return (TOPIC_PREP_SCENARIOS as readonly string[]).includes(s);
}

export function TopicPrepScene({
  scenario,
}: {
  scenario: TopicPrepSceneScenario;
}) {
  const isRemote = scenario === "remote";
  const topics = PRODUCT_TOPIC_VALUES.filter(topicHasPrep);
  // Never null on a remote product — every one of them has the shared
  // voice-room step — but asked rather than asserted, and the card below is
  // conditional on the answer like every other card on this page.
  const labelOnlyPlan = resolveTopicPrep(LABEL_ONLY_SAMPLE, true);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            Topic prep guides &mdash;{" "}
            {isRemote ? "remote products" : "in-person products"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRemote
              ? "Every step of every guide, plus the shared voice-room step every remote product ends on."
              : "Only what is still the family's to do: School of Gaming brings the machines with the software already on them, and the Minecraft logins as well."}
          </p>
        </div>

        {topics.map((topic) => {
          // The one resolve per card: the same answer decides whether there is
          // a guide here at all and what the guide is.
          const plan = resolveTopicPrep(topic, isRemote);
          return (
            <Card key={topic}>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <h2 className="text-lg font-semibold">
                  {PRODUCT_TOPICS[topic].label}
                </h2>
                {plan === null ? (
                  <p className="text-sm italic text-muted-foreground">
                    Nothing renders in this form &mdash; every step belongs to a
                    machine or a login School of Gaming supplies.
                  </p>
                ) : (
                  <TopicPrepContent plan={plan} />
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* The five label-only topics render one identical guide, so they get
            one card rather than five. Remote only: in person they have nothing
            to say, which is what they had before the shared step existed. */}
        {isRemote && labelOnlyPlan !== null && (
          <Card>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Any other topic</h2>
              <TopicPrepContent plan={labelOnlyPlan} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
