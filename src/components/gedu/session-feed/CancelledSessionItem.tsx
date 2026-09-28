"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  SessionCancelledLine,
  type SessionLabels,
} from "@/components/session-feed";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { CancelledSessionFeedEntry } from "./types";

/**
 * A cancelled session on the staff feed: the shared cancelled line, plus — for
 * an admin — why and by whom.
 *
 * **The detail is gated by the data, not by this component.** The feed document
 * fills the reason and the stamp for an admin caller and nulls them for a gedu,
 * so a gedu's copy of this row is exactly the family's line and nothing here
 * decides who is looking.
 *
 * No editor, no register, no staffing: a cancelled date takes no write, and a
 * substitution request filed before the cancellation is hidden rather than
 * shown on a session that is not going to run.
 */
export function CancelledSessionItem({
  entry,
  labels,
  sessionMenu = null,
}: {
  entry: CancelledSessionFeedEntry;
  labels: SessionLabels;
  /** The admin's `⋯` for this session, or `null` on a gedu's feed. */
  sessionMenu?: ReactNode;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const locale = useLocale();
  const timeZone = useTimezone();

  // The viewer's zone, as every clock face on this feed is: the cancellation
  // happened at an instant, and the admin reading it may be anywhere.
  const when =
    entry.cancelledAt === null
      ? null
      : formatDate(entry.cancelledAt, locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone,
        });

  const stamp =
    entry.cancelledBy !== null && when !== null
      ? t("cancelledByOn", { name: entry.cancelledBy.firstName, when })
      : null;

  return (
    <SessionCancelledLine
      labels={labels}
      upcoming={entry.upcoming}
      trailing={sessionMenu}
    >
      {(entry.reason !== null || stamp !== null) && (
        <div className="mt-1.5 space-y-0.5">
          {entry.reason !== null && (
            <p className="whitespace-pre-line text-sm text-foreground">
              {entry.reason}
            </p>
          )}
          {stamp !== null && (
            // Stated rather than inherited: the upcoming panel's body is
            // full-size ink, and the stamp is a footnote to the reason in both.
            <p className="text-xs text-muted-foreground">{stamp}</p>
          )}
        </div>
      )}
    </SessionCancelledLine>
  );
}
