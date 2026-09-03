import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createCalendarFeedToken } from "@/lib/calendar-feed/token";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  calendarFeedLookupBody,
  calendarFeedLookupResponse,
  type CalendarFeedLookupResponse,
} from "@/services/calendar-feed/calendar-feed.contracts";

/**
 * Mint a calendar-feed URL for one customer, for the admin testing card.
 *
 * Everything here runs on the **admin's own session client** — `profiles` and
 * `participations` both carry an admin-full-access policy, so the database
 * makes the same decision this route's role gate does, and the service-role
 * client has no business in a request that has a caller. (The feed route itself
 * is the opposite case and reaches for it, because there is no caller at all.)
 *
 * It answers with everything the card needs to describe the feed before anybody
 * subscribes to it: whose it is, which seats it covers, and the gamers the
 * per-gamer scope option can narrow to.
 */

/** A user id rather than an email address — the two things an admin may paste. */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  body: calendarFeedLookupBody,
  response: calendarFeedLookupResponse,
  // Admin-only developer tooling, and the only messages it throws are its own
  // curated ones naming which lookup came up empty — which is the whole of what
  // makes the card usable when a paste is wrong.
  discloseErrorMessages:
    "the not-found messages are this route's own copy, and telling an admin which of the two lookups failed is the point of the card",
  async handler({ body, profile, supabase }): Promise<CalendarFeedLookupResponse> {
    const locale = resolveLocale(profile.locale);
    const needle = body.customer;

    // `ilike` rather than `eq` on the email path: addresses are stored as typed
    // and an admin pastes them out of anywhere.
    const lookup = supabase
      .from("profiles")
      .select("id, first_name, last_name, role");
    const { data: customer, error } = await (UUID.test(needle)
      ? lookup.eq("id", needle)
      : lookup.ilike("email", needle)
    )
      .eq("role", "customer")
      .maybeSingle();

    if (error) throw error;
    if (customer === null) {
      throw new ApiError(`No customer found for "${needle}"`, 404);
    }

    const { data: rows, error: rowsError } = await supabase
      .from("participations")
      .select(
        `
          id,
          participant_id,
          product:products!inner(
            product_type,
            product_translations(*)
          ),
          participant:profiles!participations_participant_id_fkey!inner(
            first_name
          )
        `,
      )
      .eq("customer_id", customer.id)
      .eq("status", "active");

    if (rowsError) throw rowsError;

    const participations = rows
      .map((row) => ({
        id: row.id,
        participantFirstName: row.participant.first_name,
        productName:
          resolveTranslation(row.product.product_translations, locale)?.name ??
          "",
        productType: row.product.product_type,
      }))
      .sort(
        (a, b) =>
          a.participantFirstName.localeCompare(b.participantFirstName) ||
          a.productName.localeCompare(b.productName),
      );

    // The seat-holders, each once — a child in two clubs is one option in the
    // scope picker, not two.
    const gamers = new Map<string, string>();
    for (const row of rows) {
      gamers.set(row.participant_id, row.participant.first_name);
    }

    return {
      customerId: customer.id,
      customerName: `${customer.first_name} ${customer.last_name}`.trim(),
      token: await createCalendarFeedToken(customer.id),
      gamers: [...gamers]
        .map(([participantId, firstName]) => ({ participantId, firstName }))
        .sort((a, b) => a.firstName.localeCompare(b.firstName)),
      participations,
    };
  },
});
