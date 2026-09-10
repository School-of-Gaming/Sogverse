"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TopicPrepPlan } from "@/lib/products/topics";

// The "Before the first session" guide, rendered from the topic's prep block
// and the `topicPrep` catalog. One component, three surfaces — the confirmation
// page, the parent's enrolment card and the gamer's — because the guide is one
// document and a second arrangement of it would be a second thing to keep
// correct. The mail is the fourth surface and cannot share React, so it shares
// the registry and the catalog instead (`src/lib/email-templates/topic-prep.ts`).
//
// It renders the body and nothing around it: no card, no dialog, no wrapper of
// its own. A card and a dialog title the same guide differently, so the heading
// is a prop rather than an assumption, and the surface owns its own container.
//
// **It takes a resolved plan rather than a topic**, because every surface that
// renders it has already had to ask `resolveTopicPrep` whether there is a guide
// at all — a card around nothing is still a card, and a dialog with nothing in
// it is worse. Resolving again inside would be the same question asked twice
// per render, and the answer is what decides which message keys are even
// legal to read. Whoever holds a plan holds a guide; there is no empty case
// left for this component to have an opinion about.
//
// What the resolver decided, for context: a remote product renders every step,
// plus the shared one about the voice room's mic and camera; an in-person one
// renders only the account steps, because School of Gaming brings the machines.
// See the registry's header note for that split, and for why a label-only
// topic's remote guide is that shared step alone.

export interface TopicPrepContentProps {
  /** What to render — `resolveTopicPrep`'s answer, resolved by the surface. */
  plan: TopicPrepPlan;
  /**
   * Draws the guide's own heading above the intro. A card wants it; a dialog
   * already says the same words in its title and would say them twice.
   */
  showHeading?: boolean;
}

export function TopicPrepContent({
  plan,
  showHeading = false,
}: TopicPrepContentProps) {
  const t = useTranslations("topicPrep");

  // One branch per form, because each reads a different key and only two of
  // the three have a topic to key by — a label-only topic has no
  // `topics.<topic>.intro` to ask for, which is exactly what the plan's
  // discriminant is protecting.
  const intro =
    plan.form === "remoteOnly"
      ? t("remoteOnlyIntro")
      : plan.form === "accountsOnly"
        ? t(`accountsOnlyIntro.${plan.topic}`)
        : t(`topics.${plan.topic}.intro`);

  return (
    <div className="space-y-4">
      {showHeading && (
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("heading")}
        </h2>
      )}

      <p className="text-sm text-muted-foreground">{intro}</p>

      <ol className="list-decimal space-y-4 pl-5 text-sm marker:text-muted-foreground">
        {plan.steps.map((step) => (
          <li key={step.key} className="space-y-2">
            <p className="font-medium">{t(`steps.${step.key}.title`)}</p>

            {/* Rich rather than plain because a few of these bodies carry a
                <b> around the one clause that costs a family the session if
                they skim it — the wrong device, the wrong kind of purchase, a
                password sent to a stranger. Emphasis is spent there and
                nowhere else. */}
            <p className="text-muted-foreground">
              {t.rich(`steps.${step.key}.body`, {
                b: (chunks) => <b className="font-semibold">{chunks}</b>,
              })}
            </p>

            {"url" in step && (
              <a
                href={step.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-act hover:underline"
              >
                {t(`steps.${step.key}.linkLabel`)}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            )}

            {"platformNotes" in step && (
              <div className="space-y-1 text-muted-foreground">
                {step.platformNotes.map((note) => (
                  <p key={note}>
                    <span className="font-medium text-foreground">
                      {t(`platformNotes.${note}.title`)}
                    </span>{" "}
                    {t(`platformNotes.${note}.body`)}
                  </p>
                ))}
              </div>
            )}

            {"checklist" in step && (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground marker:text-muted-foreground">
                {step.checklist.map((item) => (
                  <li key={item}>{t(`checklist.${item}`)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {/* One closing for every topic and both filtered forms. A per-topic one
          would have needed a twin apiece — "everything installed and tested"
          is false of a guide that showed no install step — and there was
          nothing topic-specific left to say once it had to be true of both. */}
      <p className="text-sm text-muted-foreground">{t("closing")}</p>
    </div>
  );
}
