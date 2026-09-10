/* eslint-disable i18next/no-literal-string -- every literal in this file is preview scaffolding on an admin-only page: the column's own title, the per-topic heading's fallback line, and the note that a topic renders nothing in this form. The guides themselves are the translated part, and they come from <TopicPrepContent> */
import { Card, CardContent } from "@/components/ui/card";
import { TopicPrepContent } from "@/components/topic-prep/TopicPrepContent";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  resolveTopicPrep,
  topicHasPrep,
} from "@/lib/products/topics";

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
 * every step, `in-person` only the account ones. A topic that filters down to
 * nothing says so in a muted line instead of vanishing — Minecraft Education is
 * deliberately empty in person, and a page that simply skipped it would look
 * identical to one where the guide had gone missing.
 */

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
              ? "Every step of every guide: the family is on their own machine, so nothing is filtered away."
              : "Only the account steps: School of Gaming brings the machines with the software already on them."}
          </p>
        </div>

        {topics.map((topic) => (
          <Card key={topic}>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">
                {PRODUCT_TOPICS[topic].label}
              </h2>
              {resolveTopicPrep(topic, isRemote) === null ? (
                <p className="text-sm italic text-muted-foreground">
                  Nothing renders in this form &mdash; every step belongs to a
                  machine School of Gaming supplies.
                </p>
              ) : (
                <TopicPrepContent topic={topic} isRemote={isRemote} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
