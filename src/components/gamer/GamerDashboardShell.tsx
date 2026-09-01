"use client";

import { useGamerEnrollments } from "@/components/family/use-family-enrollments";
import { HelpFeedbackCard } from "@/components/help/help-feedback-card";
import type {
  MyUpcomingSessionRow,
  MyWaitlistRow,
} from "@/services/participations";
import { GamerDashboardPageBody } from "./gamer-dashboard-page-body";

/**
 * The gamer dashboard's **data shell** — the parent shell's counterpart, and
 * deliberately most of the way to empty.
 *
 * Every action the parent's shell wires is one this page does not have. There
 * is nobody to switch into, so the Join is a plain link and no dialog fronts it;
 * leaving a waitlist is a decision with a cost and belongs to the adult who
 * joined it; a child has no billing to fix and no sibling to add. So the whole
 * shell is the roll-up, the greeting's name and the one thing a child *can* do
 * that reaches a backend — writing to us for help.
 *
 * The name arrives as a prop from the server component rather than being read
 * from a session here. That keeps the body presentational (a preview scene
 * passes a fixture name) and keeps the identity resolution on the one side of
 * the boundary that has already verified it.
 */
export function GamerDashboardShell({
  gamerId,
  firstName,
  initialSessionRows,
  initialWaitlistRows,
}: {
  /** The signed-in gamer, whose rows these are and whose cards these become. */
  gamerId: string;
  /** Their first name, for the greeting. */
  firstName: string;
  /*
   * `null` means that prefetch failed — carried rather than flattened to `[]`,
   * so the roll-up hook seeds it stale and the client refetches instead of
   * telling a child they are signed up for nothing for the next minute.
   */
  initialSessionRows: MyUpcomingSessionRow[] | null;
  initialWaitlistRows: MyWaitlistRow[] | null;
}) {
  const enrollments = useGamerEnrollments({
    gamerId,
    initialSessionRows,
    initialWaitlistRows,
  });

  return (
    <GamerDashboardPageBody
      firstName={firstName}
      enrollments={enrollments}
      // The child-facing wording, and the only variant the form has: a reply to
      // a gamer resolves to their linked parent's mailbox, which the copy says.
      helpForm={<HelpFeedbackCard audience="gamer" />}
    />
  );
}
