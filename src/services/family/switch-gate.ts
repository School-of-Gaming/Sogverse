import type { UserRole } from "@/lib/constants";
import type { SessionProvenance } from "@/lib/session-provenance";
import type { FamilyMember } from "./family.contracts";

/**
 * What one switch costs, decided before the click rather than discovered from
 * the route's refusal.
 *
 *  - `none` — one click, nothing to collect. Every switch a parent makes.
 *  - `pin` — a linked parent's PIN. A child whose session was handed to them by
 *    a parent, leaving it for anyone else.
 *  - `password` — the TARGET account's own password. A child who signed in
 *    themselves, leaving for an account that holds a credential.
 *  - `unreachable` — the target holds no password by construction, so an own
 *    session has nothing it could type. Still listed (the family is the family)
 *    and never clickable.
 *  - `unknown` — the answer is not in yet. A gate must wait for it: guessing
 *    `pin` prompts for four digits the route will refuse, and guessing `none`
 *    fires a switch that comes back as a refusal the reader never asked for.
 */
export type SwitchGate =
  | { kind: "none" }
  | { kind: "pin" }
  | { kind: "password" }
  | { kind: "unreachable" }
  | { kind: "unknown" };

/**
 * The one place the switch gate is decided, called by all three surfaces that
 * initiate a switch (the header account menu, the /select-profile tiles, and
 * the confirm-switch dialog).
 *
 * It restates, on the client, the rule the switch route enforces — see
 * `src/services/pin/CLAUDE.md` § "Gate B". The route is the boundary; this is
 * what lets a surface ask for the right credential up front instead of firing a
 * switch in order to be told. Because it is a restatement, it must not drift:
 * the mapping below is the same three-way split the route makes, and a change
 * to one is unfinished until the other matches.
 *
 * `viewerRole` and `provenance` are both allowed to be absent, and absence is
 * not the same as a value. A gamer whose provenance has not landed gets
 * `unknown`; so does a viewer whose own role is still resolving, because
 * "not a gamer" cannot be concluded from "we do not know yet".
 */
export function switchGateFor(
  viewerRole: UserRole | null | undefined,
  provenance: SessionProvenance | null | undefined,
  target: FamilyMember,
): SwitchGate {
  // The viewer's own role decides first: only a gamer ever pays. A parent
  // handing the device to a child is the gesture the switcher exists for, and
  // admins and gedus have no household to switch inside at all.
  if (viewerRole === undefined || viewerRole === null) return { kind: "unknown" };
  if (viewerRole !== "gamer") return { kind: "none" };

  if (provenance === undefined || provenance === null) return { kind: "unknown" };

  // A switched-in child is at home with a parent nearby: the PIN is the
  // accepted friction, and it buys the switch whoever the target is.
  if (provenance === "family") return { kind: "pin" };

  // A self-authenticated child may be on a school computer, so the price is the
  // target's own password. A parent always holds one. A sibling holds one only
  // in the two modes that gave them a sign-in of their own — `parent` mode has
  // no password by construction, and neither does a member row that carries no
  // mode at all (a fixture, a row built before the modes existed), which is
  // read as "no credential" because that withholds a path rather than offering
  // one the account cannot satisfy.
  if (target.role === "gamer" && target.sign_in !== "username" && target.sign_in !== "email") {
    return { kind: "unreachable" };
  }
  return { kind: "password" };
}
