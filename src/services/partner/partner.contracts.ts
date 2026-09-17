import { z } from "zod";
import { Constants } from "@/types";
import type { ParticipationStatus } from "@/types";

/**
 * The wire contracts of the Lynx Educate partner API — one query schema and one
 * response schema per documented resource.
 *
 * The published documentation page at `/docs/lynx-api` is the contract; this
 * file is that contract written down where a machine can hold us to it. The
 * routes under `src/app/api/partner/v1/` parse their query strings with the
 * query schemas and validate what they return against the response schemas, so
 * no answer leaves in a shape the page does not describe — an empty page and a
 * full one are held to the same contract.
 *
 * The partner is an outside caller with its own client, so the feature has no
 * service class and no query hooks: the reads behind the routes are server-only
 * modules beside this file, and nothing here is imported by the app's UI.
 *
 * Enum values come from the generated `Constants` wherever the vocabulary is
 * the database's. Where it is the API's own — an invented word the database
 * does not hold — the tuple is written out and says so.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * API-only vocabulary: how a product is delivered. The database holds this as a
 * property of the product's location and topic rather than as an enum of its
 * own, and the documentation page names these two words, so they are the API's.
 */
export const DELIVERY = ["online", "in_person"] as const;

/**
 * API-only vocabulary: the kinds of page `/traffic` counts. These are pages of
 * this app, not rows of any table.
 */
const TRAFFIC_PAGE = ["landing", "shop", "product"] as const;

/**
 * API-only rule: a campaign is Lynx's when its `utm_campaign` starts with this,
 * in any letter case. The prefix is the partner convention written down where
 * UTM attribution is captured, and `/campaigns` is what makes it binding: a
 * campaign without it is never counted, and a stored campaign cannot change.
 */
export const LYNX_CAMPAIGN_PREFIX = "lynx-";

/**
 * The smallest count `/campaigns` shows. Below it a count is withheld as null;
 * the response schema refuses a smaller number outright, which is what keeps
 * an implementation from showing one by accident. It bounds each count on its
 * own and nothing more: two counts, or two answers, can still differ by one.
 */
export const CAMPAIGN_MINIMUM_COUNT = 5;

/**
 * API-only vocabulary: how a child left a feedback prompt, and how a Game
 * Educator marked them. Both are stored as booleans/derived state rather than
 * as enums, and the documentation page names the words.
 */
export const EXIT_REASON = ["left", "ended"] as const;
export const ATTENDANCE_MARK = ["present", "absent"] as const;

/**
 * The enrolment states the API reports — the participation states minus
 * `reserving`, which is the half-second between starting a checkout and paying
 * for it and is never a seat anyone holds. The `satisfies` is what keeps the
 * narrowing honest: a rename in the generated enum fails to compile here rather
 * than silently leaving the API describing a state that no longer exists.
 */
export const ENROLMENT_STATUS = [
  "active",
  "waitlisted",
  "completed",
] as const satisfies readonly ParticipationStatus[];

/** The four derived product states, generated: `effective_product_status`. */
const PRODUCT_STATUS = Constants.public.Enums.effective_product_status;

/** The product kinds, generated: `product_type`. */
const PRODUCT_TYPE = Constants.public.Enums.product_type;

// ---------------------------------------------------------------------------
// Shared scalars
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();

/**
 * Is this a day that exists? The shape check is not enough on its own:
 * `2026-02-31` has the shape and is not a day, and a route doing date
 * arithmetic on it would answer 500 to what is plainly a bad request.
 *
 * The round trip is the check because the parse does not refuse a day out of
 * range — it rolls it over, and `2026-02-31` comes back as 3 March. A month out
 * of range is refused, and gives an unparseable value instead.
 */
function isCalendarDay(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString().startsWith(value);
}

/** A calendar day, `YYYY-MM-DD`, as every date the documentation page names. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date")
  .refine(isCalendarDay, "must be a real calendar date");

/**
 * An instant we emit: ISO 8601 in UTC, so the `Z` is required. The
 * documentation page promises every timestamp in UTC, and a promise nothing
 * checks is one a later implementation breaks by handing out whatever the
 * database column happened to serialize to.
 */
const isoTimestampUtc = z
  .string()
  .datetime({ message: "must be an ISO 8601 timestamp in UTC" });

/** A month, `YYYY-MM` — the whole of what is held about a child's birthday. */
const isoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "must be a YYYY-MM month");

/**
 * A month a caller sends us, `YYYY-MM`. Stricter than the emitted shape above:
 * `2026-13` has the shape and is not a month, and refusing it is cheaper than
 * a route doing month arithmetic on it and answering 500.
 */
const isoMonthIn = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be a real YYYY-MM month");

/** A municipality and its two-letter country code. */
const place = z.object({
  city: z.string(),
  country_code: z.string().length(2),
});

/** A consent as it stands right now, with no history. */
const consentState = z.object({
  granted: z.boolean(),
  updated_at: isoTimestampUtc,
});

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

/**
 * Cursor paging, on every resource that returns records. `limit` defaults to
 * 100 and is capped at 500. `cursor` is opaque to the caller; to us it is the
 * last key of the previous page, bound to the resource and to the filters it was
 * issued under, so the schema only asks for a non-empty string and the route
 * decodes the rest (`src/lib/api/partner-cursor.server.ts`). A cursor that does
 * not decode — malformed, another resource's, or issued under other filters — is
 * a 400 `invalid_query` like any other bad parameter.
 */
const pagingQuery = {
  limit: z.coerce
    .number()
    .int("limit must be a whole number")
    .min(1, "limit must be at least 1")
    .max(500, "limit must be at most 500")
    .default(100),
  cursor: z.string().min(1).optional(),
};

export const partnerProductsQuery = z.object({
  status: z.enum(PRODUCT_STATUS).optional(),
  ...pagingQuery,
});

export const partnerFamiliesQuery = z.object({
  // The one documented value: this filter is the mailing list, so it asks for
  // the granted families rather than taking a boolean.
  marketing_consent: z.literal("granted").optional(),
  utm_campaign: z.string().min(1).optional(),
  ...pagingQuery,
});

export const partnerEnrolmentsQuery = z.object({
  product_id: uuid.optional(),
  participant_id: uuid.optional(),
  parent_id: uuid.optional(),
  status: z.enum(ENROLMENT_STATUS).optional(),
  ...pagingQuery,
});

/**
 * The date range every windowed resource takes, inclusive at both ends.
 *
 * The order is checked rather than tolerated: a reversed range is empty, so
 * accepting it would answer a caller's typo with a confident, permanently
 * empty pull — the one failure a partner syncing on a schedule would not
 * notice. Days sort as strings because they are zero-padded.
 */
const dateRangeQuery = {
  from: isoDate.optional(),
  to: isoDate.optional(),
};

function withOrderedRange<S extends z.ZodTypeAny>(schema: S) {
  return schema.refine(
    (value: { from?: string; to?: string }) =>
      value.from === undefined ||
      value.to === undefined ||
      value.from <= value.to,
    { message: "must be on or before to", path: ["from"] },
  );
}

export const partnerSessionsQuery = withOrderedRange(
  z.object({
    product_id: uuid.optional(),
    group_id: uuid.optional(),
    ...dateRangeQuery,
    ...pagingQuery,
  }),
);

export const partnerFeedbackQuery = withOrderedRange(
  z.object({
    product_id: uuid.optional(),
    group_id: uuid.optional(),
    participant_id: uuid.optional(),
    ...dateRangeQuery,
    ...pagingQuery,
  }),
);

export const partnerRobloxResearchQuery = withOrderedRange(
  z.object({
    product_id: uuid.optional(),
    ...dateRangeQuery,
    ...pagingQuery,
  }),
);

/**
 * `/traffic` is the one resource that returns an aggregate rather than records,
 * so it takes no paging.
 *
 * Its two filters are not independent: a product's page is a `product` page, so
 * asking for one product's views under `page=landing` describes nothing that
 * exists. The documentation page says `product_id` implies `page=product`, and
 * a contradiction is refused rather than silently resolved in one of the two
 * directions the caller might not have meant.
 */
/**
 * `/campaigns` takes its range in whole UTC months, never days — the shape of
 * the question, a funnel per campaign month, and not a privacy property: two
 * answers can still differ by one family. Months sort as strings because they
 * are zero-padded.
 */
export const partnerCampaignsQuery = withOrderedRange(
  z.object({
    from: isoMonthIn.optional(),
    to: isoMonthIn.optional(),
  }),
);

export const partnerTrafficQuery = withOrderedRange(
  z.object({
    page: z.enum(TRAFFIC_PAGE).optional(),
    product_id: uuid.optional(),
    ...dateRangeQuery,
  }),
).refine(
  (value) =>
    value.product_id === undefined ||
    value.page === undefined ||
    value.page === "product",
  {
    message: "implies page=product and cannot be combined with another page",
    path: ["product_id"],
  },
);

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

/**
 * The list envelope every record-returning resource answers in. A `null`
 * `next_cursor` is the last page; a string is handed back verbatim as `cursor`
 * to read the next one.
 */
function listEnvelope<S extends z.ZodTypeAny>(record: S) {
  return z.object({
    data: z.array(record),
    next_cursor: z.string().nullable(),
  });
}

const partnerProduct = z.object({
  id: uuid,
  /**
   * Locale code → name. At least one locale is always present, and the schema
   * says so: a product whose every name was missing would serialize to `{}`
   * and give the partner's dashboard nothing to print.
   */
  name: z
    .record(z.string(), z.string())
    .refine(
      (names) => Object.keys(names).length > 0,
      "must carry a name in at least one locale",
    ),
  type: z.enum(PRODUCT_TYPE),
  delivery: z.enum(DELIVERY),
  /**
   * Who may hold a seat, as the two independent flags the database stores. The
   * database refuses a product with neither, and so does the schema.
   */
  audience: z
    .object({ gamers: z.boolean(), parents: z.boolean() })
    .refine(
      (audience) => audience.gamers || audience.parents,
      "must admit gamers, parents or both",
    ),
  location: place.nullable(),
  status: z.enum(PRODUCT_STATUS),
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  timezone: z.string(),
  /** Null exactly when the audience admits no gamers, as the database holds it. */
  age_range: z
    .object({ min: z.number().int(), max: z.number().int() })
    .nullable(),
  groups: z.array(z.object({ id: uuid, name: z.string() })),
  created_at: isoTimestampUtc,
});

const partnerGamer = z.object({
  id: uuid,
  first_name: z.string(),
  created_at: isoTimestampUtc,
  birth_month: isoMonth,
  roblox: z
    .object({
      username: z.string(),
      /** Null on a username we could not confirm with Roblox. */
      user_id: z.number().int().nullable(),
      verified: z.boolean(),
    })
    .nullable(),
  photo_consent: consentState.nullable(),
});

const partnerParent = z.object({
  id: uuid,
  first_name: z.string(),
  last_name: z.string(),
  /** Present only while the Lynx marketing consent stands. */
  email: z.string().nullable(),
  created_at: isoTimestampUtc,
  location: place.nullable(),
  utm: z.object({
    source: z.string().nullable(),
    medium: z.string().nullable(),
    campaign: z.string().nullable(),
  }),
  /** Null where the parent has never been asked. */
  marketing_consent: consentState.nullable(),
});

/**
 * A family is not an account: the database links parents to gamers many to
 * many and holds no family row. `parents` is a list for that reason, although
 * the app links a gamer to one parent today — a record shaped for one parent
 * would make the second one a breaking change.
 *
 * For the same reason the record carries no `id` and no `updated_at`: there is
 * no stored family for either to belong to, so the people inside are the keys.
 */
const partnerFamily = z.object({
  parents: z.array(partnerParent).min(1, "a family always has a parent"),
  gamers: z.array(partnerGamer),
});

const acceptedDocument = z.object({
  /** The document's version, as the date it was published. */
  version: isoDate,
  accepted_at: isoTimestampUtc,
});

const partnerEnrolment = z.object({
  id: uuid,
  product_id: uuid,
  /** Null until an admin places the seat in a group. */
  group_id: uuid.nullable(),
  /** A gamer's id, or on a parent's own seat the parent's — then equal to `parent_id`. */
  participant_id: uuid,
  parent_id: uuid,
  status: z.enum(ENROLMENT_STATUS),
  signed_up_at: isoTimestampUtc,
  consents: z.object({
    terms: acceptedDocument,
    privacy_policy: acceptedDocument,
  }),
  attendance: z.object({
    sessions_recorded: z.number().int(),
    sessions_present: z.number().int(),
  }),
  creations: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      is_roblox_url: z.boolean(),
    }),
  ),
});

const partnerSession = z.object({
  id: uuid,
  product_id: uuid,
  group_id: uuid,
  starts_at: isoTimestampUtc,
  ends_at: isoTimestampUtc,
  /** One entry per participant the Game Educator marked; an unmarked one is absent. */
  attendance: z.array(
    z.object({ participant_id: uuid, status: z.enum(ATTENDANCE_MARK) }),
  ),
  images: z.array(
    z.object({
      id: uuid,
      url: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    }),
  ),
});

const partnerFeedback = z.object({
  participant_id: uuid,
  group_id: uuid,
  product_id: uuid,
  /** Null when no session row was written for that day. */
  session_id: uuid.nullable(),
  session_opened_at: isoTimestampUtc,
  /**
   * Statement key → rating, 1 to 5, a skipped statement absent. The keys are
   * open by design: a statement may be added or retired without notice, so the
   * schema describes the ratings and not the roster.
   */
  answers: z.record(z.string(), z.number().int().min(1).max(5)),
  note: z.string(),
  exit_reason: z.enum(EXIT_REASON),
});

/**
 * The research row carries no identifier of the child or the family: that is
 * what makes it forwardable to Roblox as it stands, so it is a property of the
 * schema rather than of the code that will one day fill it.
 */
const partnerResearchRow = z.object({
  roblox_username: z.string(),
  roblox_user_id: z.number().int().nullable(),
  country_code: z.string().length(2).nullable(),
  city: z.string().nullable(),
  /** The child's age in whole years on the start date, as a range. */
  age: z
    .object({ min: z.number().int(), max: z.number().int() })
    .nullable(),
  activity: z.object({
    product_id: uuid,
    name: z.string(),
    type: z.enum(PRODUCT_TYPE),
    delivery: z.enum(DELIVERY),
    start_date: isoDate.nullable(),
  }),
  published_game_url: z.string().nullable(),
});

const campaignSplit = z.object({
  utm_campaign: z.string().nullable(),
  pageviews: z.number().int(),
});

const sourceMediumSplit = z.object({
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  pageviews: z.number().int(),
});

const daySplit = z.object({ date: isoDate, pageviews: z.number().int() });

export const partnerProductsResponse = listEnvelope(partnerProduct);
export const partnerFamiliesResponse = listEnvelope(partnerFamily);
export const partnerEnrolmentsResponse = listEnvelope(partnerEnrolment);
export const partnerSessionsResponse = listEnvelope(partnerSession);
export const partnerFeedbackResponse = listEnvelope(partnerFeedback);
export const partnerRobloxResearchResponse = listEnvelope(partnerResearchRow);

/**
 * The traffic aggregate: one entry per page that had a view in the range, and
 * the range itself — which the request either named or which defaults to the
 * last thirty days, so the answer always says what it covers.
 */
export const partnerTrafficResponse = z.object({
  range: z.object({ from: isoDate, to: isoDate }),
  pages: z.array(
    z.object({
      page: z.enum(TRAFFIC_PAGE),
      /** Null for the landing page and the shop. */
      product_id: uuid.nullable(),
      pageviews: z.number().int(),
      by_campaign: z.array(campaignSplit),
      by_source_medium: z.array(sourceMediumSplit),
      by_day: z.array(daySplit),
    }),
  ),
});

export type PartnerTrafficResponse = z.infer<typeof partnerTrafficResponse>;

/** A count as `/campaigns` shows it: at least the minimum, or withheld as null. */
const campaignCount = z
  .number()
  .int()
  .min(CAMPAIGN_MINIMUM_COUNT, "a count below the minimum must be withheld")
  .nullable();

/**
 * The campaign funnel: counts only, per Lynx campaign, over the months the
 * answer names. It carries no identifier and no record of any family, which is
 * why it may reach families who have not enrolled — and the schema holds it to
 * that: a count under the minimum and a campaign that is not Lynx's are both
 * refused here rather than trusted to the code that fills it.
 */
export const partnerCampaignsResponse = z.object({
  range: z.object({ from: isoMonth, to: isoMonth }),
  minimum_count: z.literal(CAMPAIGN_MINIMUM_COUNT),
  campaigns: z.array(
    z.object({
      utm_campaign: z
        .string()
        .refine(
          (campaign) =>
            campaign.toLowerCase().startsWith(LYNX_CAMPAIGN_PREFIX),
          `must start with ${LYNX_CAMPAIGN_PREFIX}`,
        ),
      accounts_created: campaignCount,
      children_added: campaignCount,
      children_eligible: campaignCount,
      enrolled: campaignCount,
    }),
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
//
// What the read modules behind the routes build, named once here so a record
// is typed against the contract it will be validated with rather than against
// a hand-written twin of it. Output types (`z.infer`), because these are the
// shapes after parsing: a query's `limit` is a number with its default applied,
// never the raw string the URL carried.

export type PartnerPlace = z.infer<typeof place>;
export type PartnerConsentState = z.infer<typeof consentState>;
export type PartnerAcceptedDocument = z.infer<typeof acceptedDocument>;
export type PartnerDelivery = (typeof DELIVERY)[number];
export type PartnerEnrolmentStatus = (typeof ENROLMENT_STATUS)[number];
export type PartnerExitReason = (typeof EXIT_REASON)[number];
export type PartnerAttendanceMark = (typeof ATTENDANCE_MARK)[number];

export type PartnerProduct = z.infer<typeof partnerProduct>;
export type PartnerFamily = z.infer<typeof partnerFamily>;
export type PartnerParent = z.infer<typeof partnerParent>;
export type PartnerGamer = z.infer<typeof partnerGamer>;
export type PartnerEnrolment = z.infer<typeof partnerEnrolment>;
export type PartnerSession = z.infer<typeof partnerSession>;
export type PartnerFeedback = z.infer<typeof partnerFeedback>;
export type PartnerResearchRow = z.infer<typeof partnerResearchRow>;
export type PartnerCampaignsResponse = z.infer<typeof partnerCampaignsResponse>;

export type PartnerProductsQuery = z.infer<typeof partnerProductsQuery>;
export type PartnerFamiliesQuery = z.infer<typeof partnerFamiliesQuery>;
export type PartnerEnrolmentsQuery = z.infer<typeof partnerEnrolmentsQuery>;
export type PartnerSessionsQuery = z.infer<typeof partnerSessionsQuery>;
export type PartnerFeedbackQuery = z.infer<typeof partnerFeedbackQuery>;
export type PartnerRobloxResearchQuery = z.infer<typeof partnerRobloxResearchQuery>;
export type PartnerTrafficQuery = z.infer<typeof partnerTrafficQuery>;
export type PartnerCampaignsQuery = z.infer<typeof partnerCampaignsQuery>;
