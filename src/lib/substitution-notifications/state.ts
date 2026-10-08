import type {
  SnapshotPerson,
  SubstitutionNotificationSnapshot,
} from "./snapshot.contracts";

/**
 * **Where a substitution request stands, as its messages tell it** — the one
 * derivation the Slack message and every Discord DM draw their state from, so
 * the channel and the DMs cannot disagree about whether the request is still
 * taking answers.
 *
 * - `open` — taking offers: the buttons are live.
 * - `filled` — somebody is seated, with the admin who approved them.
 * - `withdrawn` — the absent gedu is coming after all.
 * - `cancelled` — the session itself is cancelled.
 * - `past` — still open, but its date has gone by with nobody seated.
 *
 * **The order the checks run in is the answer to two states at once.** A
 * withdrawn request is withdrawn whatever happened to its session; a cancelled
 * session needs nobody, so it outranks the sub seated on it; and a seated
 * request stays filled after its date, because who covered it is the history
 * worth keeping on the message. Only an open request can be passed.
 *
 * Pure: "today" is the product's own date, read with the snapshot.
 */
export type NotificationState =
  | { kind: "open" }
  | { kind: "filled"; substitute: SnapshotPerson; approver: SnapshotPerson }
  | { kind: "withdrawn" }
  | { kind: "cancelled" }
  | { kind: "past" };

export type NotificationStateKind = NotificationState["kind"];

export function deriveNotificationState(
  snapshot: Pick<
    SubstitutionNotificationSnapshot,
    "request" | "is_cancelled" | "product_today"
  >,
): NotificationState {
  const { request } = snapshot;
  if (request.status === "withdrawn") return { kind: "withdrawn" };
  if (snapshot.is_cancelled) return { kind: "cancelled" };
  if (request.status === "substituted") {
    return {
      kind: "filled",
      substitute: request.substitute,
      approver: request.approver,
    };
  }
  // Both dates are product-local `YYYY-MM-DD`, which order as strings.
  if (request.session_date < snapshot.product_today) return { kind: "past" };
  return { kind: "open" };
}
