import { z } from "zod";
import { Constants } from "@/types";

/**
 * Wire shapes for the calendar-feed exploration — both ends of both calls.
 *
 * The admin mint route parses its body with `calendarFeedLookupBody` and the
 * service parses its answer with `calendarFeedLookupResponse`; the feed route's
 * `?format=json` rendering is `calendarFeedPreviewResponse`, which the admin
 * card's preview table reads. That last one is a contract even though only one
 * client exists, because it is the *same computation* the `.ics` is built from:
 * a table that could drift from the document it claims to preview would be
 * worse than no table.
 */

const productType = z.enum(Constants.public.Enums.product_type);

/**
 * Who to mint a feed for — an email address or a user id, whichever the admin
 * has to hand. Resolved server-side; the route decides which of the two it is
 * rather than making the caller declare it, because an admin pasting a value
 * out of another surface should not have to classify it first.
 */
export const calendarFeedLookupBody = z.object({
  customer: z.string().trim().min(1),
});

export type CalendarFeedLookupBody = z.infer<typeof calendarFeedLookupBody>;

/** One seat-holder the feed covers — what the per-gamer scope option offers. */
export const calendarFeedGamer = z.object({
  participantId: z.string(),
  firstName: z.string(),
});

/** One seat, named the way the card lists it. */
export const calendarFeedParticipation = z.object({
  id: z.string(),
  participantFirstName: z.string(),
  productName: z.string(),
  productType,
});

export type CalendarFeedGamer = z.infer<typeof calendarFeedGamer>;
export type CalendarFeedParticipation = z.infer<
  typeof calendarFeedParticipation
>;

export const calendarFeedLookupResponse = z.object({
  customerId: z.string(),
  customerName: z.string(),
  /** The signed token that goes in the feed URL's path. */
  token: z.string(),
  gamers: z.array(calendarFeedGamer),
  participations: z.array(calendarFeedParticipation),
});

export type CalendarFeedLookupResponse = z.infer<
  typeof calendarFeedLookupResponse
>;

/**
 * One computed occurrence as the preview table shows it. Instants travel as ISO
 * strings and are rendered in the **viewer's** zone by the card — the document
 * states them in UTC or in the product's zone, which is a different question
 * from what an admin's screen should say.
 */
export const calendarFeedPreviewEvent = z.object({
  uid: z.string(),
  start: z.string(),
  end: z.string(),
  summary: z.string(),
  gamerName: z.string(),
  productName: z.string(),
  productType,
  location: z.string().nullable(),
  /** True when this row stands for a whole `RRULE` series rather than one date. */
  recurring: z.boolean(),
});

export type CalendarFeedPreviewEvent = z.infer<typeof calendarFeedPreviewEvent>;

export const calendarFeedPreviewResponse = z.object({
  events: z.array(calendarFeedPreviewEvent),
});

export type CalendarFeedPreviewResponse = z.infer<
  typeof calendarFeedPreviewResponse
>;
