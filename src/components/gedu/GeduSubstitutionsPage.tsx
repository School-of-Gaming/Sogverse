"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import {
  geduAssignmentKey,
  rollUpGeduSubstitutions,
} from "@/lib/gedu-assignment-rollup";
import { buildGeduUpcomingSessions } from "@/lib/gedu-upcoming-sessions";
import { useNow } from "@/providers";
import {
  geduSeatHrefs,
  geduSubstitutionAttention,
  joinGeduSeatRows,
} from "./gedu-seat-rows";
import {
  useMyAssignedProducts,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import {
  useGeduAssignmentSummaries,
  type GeduAssignmentSummary,
} from "@/services/gedu-sessions";
import {
  useOpenSubstitutionRequests,
  useRequestSessionSubstitution,
  type OpenSubstitutionRequest,
} from "@/services/session-substitution";
import { GeduFileAbsenceEntry } from "./GeduFileAbsenceEntry";
import { GeduSubstitutionPoolSection } from "./GeduSubstitutionPoolSection";
import { GeduSubstitutionsPageBody } from "./gedu-substitutions-page-body";

/**
 * The Substitutions page's data shell: three reads and one write, no layout.
 *
 * The pool is this feature's own read. The other two are the dashboard's, and
 * they are here for the same reason they are there — the seats a gedu holds
 * arrive as assignment rows, and the group name and the outstanding-write-up
 * count that go on each card arrive with the summaries. Joining them is the
 * shared seat-row helper's job, so the two pages cannot disagree about which
 * workspace a substitution opens.
 *
 * All three are server-prefetched by the route, so the ordinary visit paints
 * complete on the first frame with no loading state at all. Each is a small
 * indexed read of a bounded set, so where a prefetch failed the section renders
 * **nothing** while the browser asks again rather than a skeleton that would
 * flash on every ordinary visit.
 */
export function GeduSubstitutionsPage({
  initialRows,
  initialSummaries,
  initialSubstitutionRequests,
  certified,
}: {
  initialRows: MyAssignedProductSessionRow[];
  /**
   * The prefetched summaries, or `null` when that read failed. `null` is not an
   * empty list: it means "ask again from the browser", and the section shows
   * nothing until the answer arrives rather than cards whose group names and
   * badges it does not yet know.
   */
  initialSummaries: GeduAssignmentSummary[] | null;
  /**
   * The pool, prefetched by the route — or `null` when that read failed or was
   * never made (an uncertified gedu asks nothing).
   *
   * `null` is "ask from the browser", not "nothing needs a substitute": telling
   * a gedu the queue is clear on the strength of a failed read is the one
   * answer this section must never give.
   */
  initialSubstitutionRequests: OpenSubstitutionRequest[] | null;
  /**
   * Has an admin certified this gedu? Certification is what gates offering and
   * holding a substitution server-side, so an uncertified account gets no open
   * queue at all rather than an all-clear line about a queue it is not in.
   */
  certified: boolean;
}) {
  const locale = resolveLocale(useLocale());
  const now = useNow();
  const requestSubstitution = useRequestSessionSubstitution();

  const { data: rows } = useMyAssignedProducts({ initialData: initialRows });
  const { data: summaries } = useGeduAssignmentSummaries(
    initialSummaries === null ? undefined : { initialData: initialSummaries },
  );
  const { data: substitutionRequests } = useOpenSubstitutionRequests({
    enabled: certified,
    initialData: initialSubstitutionRequests ?? undefined,
  });

  const substitutions = useMemo(() => {
    if (summaries === undefined) return null;
    const seatRows = joinGeduSeatRows(rows, summaries);
    const { hrefByAssignment, voiceHrefByAssignment } = geduSeatHrefs(rows);
    return rollUpGeduSubstitutions({
      rows: seatRows,
      locale,
      attentionBySubstitution: geduSubstitutionAttention(summaries),
      hrefByAssignment,
      voiceHrefByAssignment,
    });
  }, [rows, summaries, locale]);

  /**
   * The viewer's own upcoming sessions, for the picker.
   *
   * Built from the rows this page already holds, through the app's one schedule
   * expansion — no read of its own, because the client owns the calendar math
   * and the seats are already here. The summaries are folded in where they have
   * landed and defaulted to nothing where they have not: a group name is what a
   * picker row uses to tell two same-named products apart, and a row that named
   * the session and the product but not the group is still a usable row, while
   * a button that appeared a beat after the page did would not be.
   */
  const upcomingSessions = useMemo(
    () =>
      buildGeduUpcomingSessions({
        rows: joinGeduSeatRows(rows, summaries ?? []),
        locale,
        now,
      }),
    [rows, summaries, locale, now],
  );

  const workspaceHrefs = useMemo(
    () => geduSeatHrefs(rows).hrefByAssignment,
    [rows],
  );

  return (
    <GeduSubstitutionsPageBody
      fileAbsence={
        <GeduFileAbsenceEntry
          sessions={upcomingSessions}
          resolveWorkspaceHref={(session) =>
            workspaceHrefs[
              geduAssignmentKey(session.productId, session.groupId)
            ] ?? null
          }
          onFile={async (session, draft) => {
            await requestSubstitution.mutateAsync({
              groupId: session.groupId,
              sessionDate: session.sessionDate,
              reason: draft.reason,
              reasonNote: draft.note,
            });
          }}
        />
      }
      // `null` for the account that may substitute for nothing, and only for
      // that account: an answer that has not arrived is the section's own
      // business, so the heading stands either way.
      pool={
        certified ? (
          <GeduSubstitutionPoolSection requests={substitutionRequests} />
        ) : null
      }
      substitutions={substitutions}
    />
  );
}
