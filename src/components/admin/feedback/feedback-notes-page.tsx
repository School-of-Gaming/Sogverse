"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { FeedbackNotesView } from "./aggregate-feedback";
import { useFeedbackHref } from "./feedback-nav";
import type { FeedbackRange } from "./feedback-range";
import { FeedbackNoteList } from "./feedback-responses";
import { FeedbackShell, SegmentedLinks } from "./feedback-shell";

/**
 * **Every note in the range, newest first** — by default only the ones that
 * came with a low answer, which is where the overview's door opens it.
 */
export function FeedbackNotesPage({
  range,
  view,
  lowAnswerOnly,
}: {
  range: FeedbackRange;
  view: FeedbackNotesView;
  lowAnswerOnly: boolean;
}) {
  const t = useTranslations("admin.feedback.notes");

  return (
    <FeedbackShell
      range={range}
      place={{ view: "notes", lowAnswerOnly }}
      title={t("title")}
      back={{ view: "overview" }}
    >
      <NotesFilter view={view} lowAnswerOnly={lowAnswerOnly} />
      <Card className="overflow-hidden">
        <FeedbackNoteList notes={view.notes} origin={{ kind: "notes", lowAnswerOnly }} markLow={!lowAnswerOnly} />
      </Card>
    </FeedbackShell>
  );
}

/** The two views of the notes, as links so the choice survives a reload and a back. */
function NotesFilter({ view, lowAnswerOnly }: { view: FeedbackNotesView; lowAnswerOnly: boolean }) {
  const t = useTranslations("admin.feedback.notes");
  const href = useFeedbackHref();
  return (
    <SegmentedLinks
      label={t("filterLabel")}
      current={lowAnswerOnly ? "low" : "all"}
      options={[
        {
          key: "low",
          label: t("onlyLow", { count: view.summary.withLowAnswer }),
          href: href({ view: "notes", lowAnswerOnly: true }),
        },
        {
          key: "all",
          label: t("all", { count: view.summary.total }),
          href: href({ view: "notes", lowAnswerOnly: false }),
        },
      ]}
    />
  );
}
