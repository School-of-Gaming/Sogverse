import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { GeduTeamProfileApproval } from "@/services/team-profiles/team-profiles.types";

/**
 * Where a saved profile stands, as one word — the combined state of the
 * person's own checkbox as last saved and, for a Gedu, an admin's approval, so
 * nobody has to work out from two facts which of four things is true.
 *
 * The editor tells the person themselves; the admin user page and the admin's
 * edit of a Gedu tell an admin, in words addressed to them, off the same
 * states.
 */
export type TeamProfileStatus =
  | "private"
  | "waiting"
  | "live"
  | "takenOff"
  | "shown"
  | "hidden";

/** The saved switches a status is read from — a record and the editor's props both fit. */
export type TeamProfileSwitches =
  | { role: "admin"; shown: boolean }
  | { role: "gedu"; ready: boolean; approval: GeduTeamProfileApproval };

export function teamProfileStatus(switches: TeamProfileSwitches): TeamProfileStatus {
  if (switches.role === "admin") return switches.shown ? "shown" : "hidden";
  if (!switches.ready) return "private";
  switch (switches.approval) {
    case "pending":
      return "waiting";
    case "approved":
      return "live";
    case "withdrawn":
      return "takenOff";
  }
}

const STATUS_VARIANT: Record<
  TeamProfileStatus,
  "default" | "info" | "success" | "warning"
> = {
  private: "default",
  waiting: "info",
  live: "success",
  takenOff: "warning",
  shown: "success",
  hidden: "default",
};

/**
 * The status as a status panel. It is a state message, so it is the panel even
 * inside a card. Every word is the caller's, because who is being told decides
 * the wording.
 */
export function TeamProfileStatusPanel({
  status,
  title,
  body,
}: {
  status: TeamProfileStatus;
  title: string;
  body: string;
}) {
  return (
    <Alert variant={STATUS_VARIANT[status]}>
      <div className="min-w-0 space-y-1.5">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{body}</AlertDescription>
      </div>
    </Alert>
  );
}
