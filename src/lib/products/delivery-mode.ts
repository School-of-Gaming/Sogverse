import type { DeliveryMode } from "@/types";

// How a product is delivered, as the three questions every surface asks of it.
//
// A product is online (a voice room, no site), in person (a site, no voice
// room) or hybrid (gamers at a site and everyone in the voice room, the gedu
// joining from wherever they are). Hybrid is hybrid for everyone on it: every
// reader is shown both the room and the site. Ask the question the surface
// means rather than comparing `delivery_mode` to one value: a test for
// "online" or "in_person" written before hybrid existed answers wrong for it,
// silently.

/** Whether the product's sessions are joined through a voice room. */
export function hasVoiceRoom(mode: DeliveryMode): boolean {
  return mode === "online" || mode === "hybrid";
}

/**
 * Whether gamers come to the product's site: its address is shown and it is
 * found under in-person browsing. True exactly when the product holds a site.
 */
export function gamersAttendSite(mode: DeliveryMode): boolean {
  return mode === "in_person" || mode === "hybrid";
}

/**
 * Whether the gedu teaching the product has to be at its site, which is what
 * makes the gedus' location coverage matter. A hybrid gedu joins through the
 * voice room.
 */
export function geduAttendsSite(mode: DeliveryMode): boolean {
  return mode === "in_person";
}

/**
 * Whether the family sets up a machine of their own for the sessions, which is
 * what the "Before the first session" guide's install-and-test steps are for.
 * At a site School of Gaming brings the machines with everything installed; a
 * hybrid product is prepared for as an online one, since any gamer on it may
 * join from home.
 */
export function familyBringsOwnMachine(mode: DeliveryMode): boolean {
  return mode === "online" || mode === "hybrid";
}
