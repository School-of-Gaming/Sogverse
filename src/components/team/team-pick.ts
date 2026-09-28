import { PICKS, type PickId } from "@sog/ui";

/**
 * A team card's personal colour: one of SOG-UI's sixteen picks, chosen by the
 * person, or derived from their id while they have not chosen.
 *
 * **Spent only as an edge or a rule, never as a fill with text on it.** No pick
 * has a measured ink yet, so nothing is ever written on one: the pick frames the
 * photo and draws the rule under the headline, and the headline's nickname stays
 * act. The page therefore speaks act plus the person's own pick, which takes the
 * place the brand's world rule held on the hero it is modelled on.
 *
 * Literal class strings rather than `border-pick-${id}`, so Tailwind's source
 * scanner sees every utility.
 */
export interface TeamPickClasses {
  /** The photo frame's edge. */
  frame: string;
  /** The rule under the headline, and the fun fact's side rule. */
  rule: string;
  /** The side rule's edge, for a rule drawn as a border. */
  sideRule: string;
}

export const TEAM_PICK_CLASSES: Record<PickId, TeamPickClasses> = {
  1: { frame: "border-pick-1", rule: "bg-pick-1", sideRule: "border-l-pick-1" },
  2: { frame: "border-pick-2", rule: "bg-pick-2", sideRule: "border-l-pick-2" },
  3: { frame: "border-pick-3", rule: "bg-pick-3", sideRule: "border-l-pick-3" },
  4: { frame: "border-pick-4", rule: "bg-pick-4", sideRule: "border-l-pick-4" },
  5: { frame: "border-pick-5", rule: "bg-pick-5", sideRule: "border-l-pick-5" },
  6: { frame: "border-pick-6", rule: "bg-pick-6", sideRule: "border-l-pick-6" },
  7: { frame: "border-pick-7", rule: "bg-pick-7", sideRule: "border-l-pick-7" },
  8: { frame: "border-pick-8", rule: "bg-pick-8", sideRule: "border-l-pick-8" },
  9: { frame: "border-pick-9", rule: "bg-pick-9", sideRule: "border-l-pick-9" },
  10: { frame: "border-pick-10", rule: "bg-pick-10", sideRule: "border-l-pick-10" },
  11: { frame: "border-pick-11", rule: "bg-pick-11", sideRule: "border-l-pick-11" },
  12: { frame: "border-pick-12", rule: "bg-pick-12", sideRule: "border-l-pick-12" },
  13: { frame: "border-pick-13", rule: "bg-pick-13", sideRule: "border-l-pick-13" },
  14: { frame: "border-pick-14", rule: "bg-pick-14", sideRule: "border-l-pick-14" },
  15: { frame: "border-pick-15", rule: "bg-pick-15", sideRule: "border-l-pick-15" },
  16: { frame: "border-pick-16", rule: "bg-pick-16", sideRule: "border-l-pick-16" },
};

/**
 * The pick a person's identity derives while they have not chosen one: a stable
 * hash of their id over the picks in picker order, so the same person always
 * gets the same colour and two people usually get two different ones.
 *
 * It says nothing about the person, which is what makes it a legitimate way for
 * a pick to reach the screen: the product is not assigning a colour by meaning,
 * only standing in for a choice that has not been made yet.
 */
export function derivedTeamPick(personId: string): PickId {
  // FNV-1a over the id's characters: cheap, stable across runtimes, and spread
  // well enough over sixteen buckets for ids that are UUIDs.
  let hash = 0x811c9dc5;
  for (let i = 0; i < personId.length; i += 1) {
    hash ^= personId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return PICKS[hash % PICKS.length].id;
}

/** The pick a card is drawn in: the chosen one, else the derived default. */
export function teamPick(card: { id: string; pick: PickId | null }): PickId {
  return card.pick ?? derivedTeamPick(card.id);
}
