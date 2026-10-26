import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enAdmin from "@/../messages/en/admin.json";
import enCommon from "@/../messages/en/common.json";
import enProductTag from "@/../messages/en/productTag.json";
import enConsentDocuments from "@/../messages/en/consentDocuments.json";
import enProductDetail from "@/../messages/en/productDetail.json";
import enProductAudience from "@/../messages/en/productAudience.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { ProductDetailsPage } from "@/components/admin/products/product-details-page";
import type { PlannedSession } from "@/lib/planned-sessions";
import type {
  ProductAdminDetailRow,
} from "@/services/products/products.service";

const messages = {
  admin: enAdmin,
  common: enCommon,
  productTag: enProductTag,
  consentDocuments: enConsentDocuments,
  productDetail: enProductDetail,
  productAudience: enProductAudience,
};

/**
 * ============================================================================
 * The admin product page paints its groups once, with the plan already read.
 * ============================================================================
 *
 * Whether each group card's header carries a Join button is decided by the
 * product's plan, which is a second read behind the product row. A button that
 * arrived after the cards had painted would rewrap the group name beside it —
 * a shift on the data's schedule. So the page stays in its loading state until
 * the plan has answered, and the groups panel is first rendered already knowing
 * whether voice is available. A failed plan read ends the wait as well.
 *
 * The reads are stubbed at their hooks, and the groups panel at its component:
 * what is under test is when the page hands the panel its voice answer, never
 * how the panel draws it.
 */

const PRODUCT_ID = "5b0e8f43-2d6a-4c1e-9f7b-8a3d2c1e0f94";
const NOW = new Date("2026-03-16T12:00:00.000Z");

const reads = vi.hoisted(() => ({
  product: { data: undefined as unknown, isLoading: true },
  plan: { data: undefined as unknown, isPending: true },
}));

/** Every `voiceAvailable` the groups panel was rendered with, in order. */
const voiceSeen = vi.hoisted(() => ({ value: [] as boolean[] }));

vi.mock("@/services/products/products.queries", () => ({
  useProductAdmin: () => reads.product,
  usePlannedSessions: () => reads.plan,
}));

vi.mock("@/components/admin/products/groups/groups-panel", () => ({
  GroupsPanel: ({ voiceAvailable }: { voiceAvailable: boolean }) => {
    voiceSeen.value.push(voiceAvailable);
    return <div data-testid="groups-panel" />;
  },
}));

/** A remote, open-ended weekly club: the shape a Join button belongs to. */
function remoteClub(): ProductAdminDetailRow {
  return {
    id: PRODUCT_ID,
    product_type: "consumer_club",
    billing_mode: "paid",
    topic: "minecraft_java",
    for_gamers: true,
    for_parents: false,
    min_age: 7,
    max_age: 12,
    tag: null,
    region_lock_country: null,
    requires_gamer_creations: false,
    voice_room_mode: "sogverse",
    external_voice_url: null,
    spoken_language_code: "en",
    image_id: null,
    image_path: null,
    catalogue_images: null,
    product_staff_details: null,
    location_id: null,
    delivery_mode: "online",
    start_date: "2026-01-05",
    end_date: null,
    timezone: "Europe/Helsinki",
    seat_count: 10,
    waitlist_enabled: false,
    registration_opens_at: "2025-12-01T08:00:00.000Z",
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    invoice_customer_id: null,
    invoice_customer: null,
    is_visible: true,
    created_by: "admin-1",
    creator: { id: "admin-1", first_name: "Aino", last_name: "Admin" },
    created_at: "2025-12-01T08:00:00.000Z",
    updated_at: "2025-12-01T08:00:00.000Z",
    product_translations: [
      {
        product_id: PRODUCT_ID,
        locale: "en",
        name: "Build Club",
        short_description: "Build castles together.",
        long_description: null,
        voice_join_instructions: null,
        created_at: "2025-12-01T08:00:00.000Z",
        updated_at: "2025-12-01T08:00:00.000Z",
      },
    ],
    product_prices: [{ currency: "eur", price_cents: 4500 }],
    schedule_slots: [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }],
    locations: null,
    product_required_consents: [],
    product_marketing_consents: [],
    product_gamer_photo_consents: [],
    product_holiday_calendars: [],
  };
}

/** Next Monday's session, a week out from `NOW`. */
const UPCOMING: PlannedSession[] = [
  {
    date: "2026-03-23",
    startsAt: new Date("2026-03-23T14:00:00.000Z"),
    endsAt: new Date("2026-03-23T15:30:00.000Z"),
    cancelled: false,
  },
];

function page() {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <ProductDetailsPage productType="consumer_club" productId={PRODUCT_ID} />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>
  );
}

describe("the admin product page's groups wait for the plan", () => {
  beforeEach(() => {
    reads.product = { data: undefined, isLoading: true };
    reads.plan = { data: undefined, isPending: true };
    voiceSeen.value = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("stays in its loading state while the plan is still being read", () => {
    reads.product = { data: remoteClub(), isLoading: false };
    render(page());

    expect(screen.queryByTestId("groups-panel")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Build Club" })).toBeNull();
    expect(voiceSeen.value).toEqual([]);
  });

  it("first renders the groups already knowing the Join belongs there", () => {
    reads.product = { data: remoteClub(), isLoading: false };
    const { rerender } = render(page());

    reads.plan = { data: UPCOMING, isPending: false };
    rerender(page());

    expect(screen.getByTestId("groups-panel")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Build Club" })).toBeTruthy();
    // Never a `false` first: the panel's first render already holds the
    // answer, so no Join can arrive into a painted card.
    expect(voiceSeen.value.length).toBeGreaterThan(0);
    expect(voiceSeen.value.every((available) => available)).toBe(true);
  });

  it("ends the wait when the plan read fails, and renders without a Join", () => {
    reads.product = { data: remoteClub(), isLoading: false };
    reads.plan = { data: undefined, isPending: false };
    render(page());

    expect(screen.getByTestId("groups-panel")).toBeTruthy();
    expect(voiceSeen.value.every((available) => !available)).toBe(true);
  });
});
