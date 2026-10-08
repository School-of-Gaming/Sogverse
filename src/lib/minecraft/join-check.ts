import { formatInTimeZone } from "date-fns-tz";
import type { BillingMode, ParticipationStatus, ProductType } from "@/types";

/**
 * The join check's answer, and the one rule that decides it.
 *
 * A Minecraft account may join a School of Gaming server when it is linked to a
 * gamer whose seat on a product passes {@link seatGrantsServerAccess}. Nothing
 * else in the join check decides anything: the loader gathers seats, this
 * module asks the predicate about each one and words the result.
 */

export type JoinCheckReason =
  | "paid_enrollment"
  | "no_linked_account"
  | "no_linked_gamer"
  | "no_paid_enrollment";

export interface JoinCheckEnrollment {
  /** The product's name at the default locale. */
  product: string;
  productType: ProductType;
  billingMode: BillingMode;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, or null for an open-ended club. */
  endDate: string | null;
  qualifies: boolean;
}

export interface JoinCheckGamer {
  firstName: string;
  minecraftUsername: string | null;
  enrollments: JoinCheckEnrollment[];
}

export interface JoinCheckResponse {
  allowed: boolean;
  reason: JoinCheckReason;
  /** One English sentence for a Minecraft server admin; an API body, not UI. */
  message: string;
  gamers: JoinCheckGamer[];
}

/** One seat a linked gamer holds, with what the predicate needs to judge it. */
export interface JoinCheckSeat {
  status: ParticipationStatus;
  billingMode: BillingMode;
  /** `YYYY-MM-DD`, product-local. */
  startDate: string;
  /** `YYYY-MM-DD`, product-local; null for an open-ended club. */
  endDate: string | null;
  /** The product's IANA zone, in which its dates are read. */
  timezone: string;
}

/**
 * Whether this seat lets its gamer's Minecraft account onto the servers at `now`.
 *
 * The whole access rule lives here, so a change to it is a change to this
 * function alone. A seat qualifies when it is active, on a product the family
 * pays for, and today in the product's own zone falls within the product's
 * dates, both ends included; an open-ended club has no last day. One rule for
 * every product type, and deliberately no more than that (the organiser's
 * ruling, October 2026):
 * - before a club, camp or event starts and after it ends, the seat is out;
 * - the hours between sessions are in — the servers keep their own opening
 *   times, and this gate only answers whether the account may play at all;
 * - a cancelled subscription's paid-up remainder, a payment Stripe is still
 *   retrying and a comped trial visit are all in, because each of them leaves
 *   the seat active until Stripe ends the subscription.
 * The loader fetches only `active` seats, so admitting another status means
 * widening its read too.
 */
export function seatGrantsServerAccess(seat: JoinCheckSeat, now: Date): boolean {
  if (seat.status !== "active" || seat.billingMode !== "paid") return false;
  const today = formatInTimeZone(now, seat.timezone, "yyyy-MM-dd");
  if (today < seat.startDate) return false;
  return seat.endDate === null || today <= seat.endDate;
}

/** A linked gamer and their active seats, as the loader gathered them. */
export interface LinkedGamer {
  firstName: string;
  minecraftUsername: string | null;
  seats: (JoinCheckSeat & { product: string; productType: ProductType })[];
}

/** What the loader found for one Minecraft UUID. */
export interface JoinCheckLookup {
  /** Whether any Sogverse account, of any role, has linked the UUID. */
  linked: boolean;
  gamers: LinkedGamer[];
}

function compareEnrollments(a: JoinCheckEnrollment, b: JoinCheckEnrollment) {
  if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
  return a.startDate.localeCompare(b.startDate);
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Judges every seat and words the answer. */
export function buildJoinCheckResponse(
  lookup: JoinCheckLookup,
  now: Date,
): JoinCheckResponse {
  const gamers: JoinCheckGamer[] = lookup.gamers
    .map((gamer) => ({
      firstName: gamer.firstName,
      minecraftUsername: gamer.minecraftUsername,
      enrollments: gamer.seats
        .map((seat) => ({
          product: seat.product,
          productType: seat.productType,
          billingMode: seat.billingMode,
          startDate: seat.startDate,
          endDate: seat.endDate,
          qualifies: seatGrantsServerAccess(seat, now),
        }))
        .sort(compareEnrollments),
    }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  if (!lookup.linked) {
    return {
      allowed: false,
      reason: "no_linked_account",
      message: "Denied: no Sogverse account has linked this Minecraft account.",
      gamers: [],
    };
  }

  if (gamers.length === 0) {
    return {
      allowed: false,
      reason: "no_linked_gamer",
      message:
        "Denied: this Minecraft account is linked only to Sogverse accounts that are not gamers.",
      gamers: [],
    };
  }

  for (const gamer of gamers) {
    const seat = gamer.enrollments.find((enrollment) => enrollment.qualifies);
    if (seat) {
      return {
        allowed: true,
        reason: "paid_enrollment",
        message: `Allowed: ${gamer.firstName} has a paid seat on ${seat.product}.`,
        gamers,
      };
    }
  }

  const names = listNames(gamers.map((gamer) => gamer.firstName));
  return {
    allowed: false,
    reason: "no_paid_enrollment",
    message:
      gamers.length === 1
        ? `Denied: ${names} has no current paid seat.`
        : gamers.length === 2
          ? `Denied: neither ${gamers[0].firstName} nor ${gamers[1].firstName} has a current paid seat.`
          : `Denied: none of ${names} has a current paid seat.`,
    gamers,
  };
}

/**
 * The stored spelling of a Minecraft UUID: dashed 8-4-4-4-12 lowercase hex, as
 * the Mojang lookup writes it. Callers may send it dashed or undashed, in
 * either case; null when the input is not a UUID at all.
 */
export function normalizeMinecraftUuid(raw: string): string | null {
  const hex = raw.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
