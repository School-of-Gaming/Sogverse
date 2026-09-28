import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Where a saved profile stands, as one word — the combined state of the
 * checkbox as last saved and whether an admin has made it public, so nobody
 * has to work out from two facts whether the public can see it.
 *
 * Whoever edits a profile controls readiness and an admin visibility, and
 * visibility is gated behind readiness, so every profile, an admin's or a
 * Gedu's, is in one of three:
 *
 * - `private` — not marked ready. Unticking ready also hides it.
 * - `waiting` — marked ready, not yet made public by an admin.
 * - `live` — made public by an admin, which it can be only while ready.
 *
 * The editor tells the person themselves; the admin user page and an admin
 * editing someone else's profile tell an admin, in words addressed to them,
 * off the same states.
 */
export type TeamProfileStatus = "private" | "waiting" | "live";

/** The saved switches a status is read from — a record and the editor's props both fit. */
export interface TeamProfileSwitches {
  ready: boolean;
  approved: boolean;
}

export function teamProfileStatus(switches: TeamProfileSwitches): TeamProfileStatus {
  if (!switches.ready) return "private";
  return switches.approved ? "live" : "waiting";
}

const STATUS_VARIANT: Record<
  TeamProfileStatus,
  "default" | "info" | "success"
> = {
  private: "default",
  waiting: "info",
  live: "success",
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
