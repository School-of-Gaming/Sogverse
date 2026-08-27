"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UncertifiedGedu } from "./admin-dashboard-data";
import { GeduCertificationQueue } from "./gedu-certification-queue";

/**
 * Who is not certified yet — **information, not a queue.**
 *
 * It sat inside "Needs attention" until it was moved out here, and the move is
 * the whole point of this section rather than a tidying of the one above it. An
 * uncertified gedu is frequently not something an admin can do anything about:
 * they may not have accepted the contract in force, and once background checks
 * are running they may be waiting on one. Listing them as attention owed tells
 * an admin they are behind on work that is not theirs to do — and an admin who
 * has been told that a few times stops reading the count above, which is the
 * cost that lands on the rows that genuinely do need them.
 *
 * So it is framed as standing information: it names what certification unlocks,
 * says plainly that nothing here is owed today, and its heading never asks to be
 * emptied. **It is permanent** — rendered whether or not anybody is listed, with
 * its own empty state — because a section that appears when there is bad news
 * and vanishes when there is not is a queue wearing a different hat, and because
 * a list that cannot unmount is what lets the receipt for a certification live
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
 * this section exists to drop.
 */
export function GeduCertificationPanel({
  gedus,
  onCertifyGedu,
}: {
  gedus: readonly UncertifiedGedu[];
  /** Certify one gedu. Resolves once the write landed; rejects if it did not. */
  onCertifyGedu: (geduId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.certification");

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-baseline gap-2 text-xl">
          {t("title")}
          {gedus.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {gedus.length}
            </span>
          )}
        </CardTitle>
        <CardDescription className="max-w-2xl">
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GeduCertificationQueue gedus={gedus} onCertify={onCertifyGedu} />
      </CardContent>
    </Card>
  );
}
