import type { UserRole } from "@/lib/constants";
import type { SessionProvenance } from "@/lib/session-provenance";

/**
 * What one switch costs, decided before the click rather than discovered from
 * the route's refusal.
 *
 *  - `none` — one click, nothing to collect. Every switch a parent makes.
 *  - `pin` — a linked parent's PIN. A child whose session was handed to them by
 *    a parent, leaving it for anyone else.
 *  - `signOut` — no credential buys this one. A child who signed in with their
 *    own username or email holds a session that belongs to them alone, so the
 *    way to anyone else's account is to sign out and sign in as that person.
 *  - `unknown` — the answer is not in yet. A gate must wait for it: guessing
 *    `pin` prompts for four digits the route will refuse, and guessing `none`
 *    fires a switch that comes back as a refusal the reader never asked for.
 */
export type SwitchGate =
  | { kind: "none" }
  | { kind: "pin" }
  | { kind: "signOut" }
  | { kind: "unknown" };

/**
 * The one place the switch gate is decided, called by all three surfaces that
 * initiate a switch (the header account menu, the /select-profile tiles, and
 * the confirm-switch dialog).
 *
 * It restates, on the client, the rule the switch route enforces — see
 * `src/services/pin/CLAUDE.md` § "Gate B". The route is the boundary; this is
 * what lets a surface ask for the right thing up front — or say plainly that no
 * credential buys this switch — instead of firing one in order to be told.
 * Because it is a restatement, it must not drift: the mapping below is the same
 * split the route makes, and a change to one is unfinished until the other
 * matches.
 *
 * **The target is not an argument, because it is not part of the answer.** What
 * a switch costs is a fact about the *caller's* session and nothing else: an own
 * session is refused whoever it reaches for, and a family session pays the same
 * PIN whoever it reaches for. A signature that took the target would invite a
 * surface to believe some targets are cheaper than others, which is exactly the
 * shape the previous design had and the route no longer enforces.
 *
 * `viewerRole` and `provenance` are both allowed to be absent, and absence is
 * not the same as a value. A gamer whose provenance has not landed gets
 * `unknown`; so does a viewer whose own role is still resolving, because
 * "not a gamer" cannot be concluded from "we do not know yet".
 */
export function switchGateFor(
  viewerRole: UserRole | null | undefined,
  provenance: SessionProvenance | null | undefined,
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

  // A self-authenticated child may be on a school computer. Nothing is
  // collected here at all — this platform does not answer "is this the right
  // password for that family member?", and the login page is the one built to.
  return { kind: "signOut" };
}
