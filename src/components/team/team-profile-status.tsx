import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Where a saved profile stands, as one word — the combined state of the
 * checkbox as last saved and, for a Gedu, an admin's approval, so nobody has
 * to work out from two facts whether the public can see it.
 *
 * A Gedu's profile is in one of three:
 *
 * - `private` — not marked ready. Whether an admin has already approved it
 *   changes nothing anyone sees, so it is not a state of its own: the
 *   approval only decides whether ticking ready later needs another look.
 * - `waiting` — marked ready, not approved.
 * - `live` — marked ready and approved: public.
 *
 * An admin's has no approval, so it is `shown` or `hidden`.
 *
 * The editor tells the person themselves; the admin user page and an admin
 * editing someone else's profile tell an admin, in words addressed to them,
 * off the same states.
 */
export type TeamProfileStatus =
  | "private"
  | "waiting"
  | "live"
  | "shown"
  | "hidden";

/** The saved switches a status is read from — a record and the editor's props both fit. */
export type TeamProfileSwitches =
  | { role: "admin"; shown: boolean }
  | { role: "gedu"; ready: boolean; approved: boolean };

export function teamProfileStatus(switches: TeamProfileSwitches): TeamProfileStatus {
  if (switches.role === "admin") return switches.shown ? "shown" : "hidden";
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
