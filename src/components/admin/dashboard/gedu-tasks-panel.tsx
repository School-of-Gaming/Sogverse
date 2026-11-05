"use client";

import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { GeduTask } from "./admin-dashboard-data";
import { GeduTasksList } from "./gedu-tasks-list";

/**
 * The Gedus with something open for an admin — who is not certified yet, and
 * whose team profile is ready to be made public. **Information, not a queue.**
 *
 * Certification sat inside "Needs attention" until it was moved out here, and
 * the move is the whole point of this section rather than a tidying of the one
 * above it. An uncertified Gedu is frequently not something an admin can do
 * anything about: they may not have accepted the contract in force, and once
 * background checks are running they may be waiting on one. Listing them as
 * attention owed tells an admin they are behind on work that is not theirs to
 * do — and an admin who has been told that a few times stops reading the count
 * above, which is the cost that lands on the rows that genuinely do need them.
 * A team profile waiting to be made public is the same kind of fact: nobody is
 * harmed by it sitting a day. It is the one thing here only an admin can move,
 * so its marker is drawn in info, which catches the eye without reading as a
 * problem.
 *
 * **One row per Gedu, carrying whatever is open for them.** An admin reads this
 * section by person, and a person listed once per task reads as two people.
 *
 * **The framing is carried by the placement, and by nothing else.** This card
 * once had a line under its title explaining what certification is; it is gone,
 * because an admin reading a card called "Gedus" sitting *below* the attention
 * panel already knows both what it is and that it is not asking them for
 * anything urgent. A sentence saying so was the design apologising for itself,
 * and a section that has to explain why it is not urgent reads more urgent, not
 * less. If the placement ever stops carrying it, the fix is the placement.
 *
 * **It is permanent** — rendered whether or not anybody is listed, with its own
 * empty state — because a section that appears when there is bad news and
 * vanishes when there is not is a queue wearing a different hat, and because a
 * list that cannot unmount is what lets the receipt for a certification live
 * beside the rows instead of a level above them.
 *
 * **And it does not celebrate.** Emptying it is not an achievement — it is a
 * report that happens to have nothing in it today, and the panel above is where
 * this page keeps its one reward. Two celebrations on one screen would devalue
 * the one that is earned.
 *
 * The count beside the title is muted rather than tinted for the same reason
 * every other choice here is: a warning-coloured badge is the attention panel's
 * vocabulary, and borrowing it would re-import in colour exactly the framing
 * this section exists to drop. It counts Gedus, not tasks, because the rows are
 * Gedus.
 */
export function GeduTasksPanel({
  gedus,
  onCertifyGedu,
}: {
  gedus: readonly GeduTask[];
  /** Certify one Gedu. Resolves once the write landed; rejects if it did not. */
  onCertifyGedu: (geduId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.gedus");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline gap-2">
          <Heading level={2} step="card-title">{t("title")}</Heading>
          {gedus.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {gedus.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <GeduTasksList gedus={gedus} onCertify={onCertifyGedu} />
      </CardContent>
    </Card>
  );
}
