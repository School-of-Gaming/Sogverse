import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **A product save and a calendar save refresh every reader of a plan.**
 *
 * A club's plan is its term crossed with its weekly slots, less the holiday
 * breaks of the calendar it follows. A product edit can move any of the three
 * and a calendar save moves the breaks, so both mutations have to mark every
 * cache root that derives from a plan stale — the family and gedu feeds, the
 * admin session document, substitutions, both invoicing ledgers, the
 * dashboard, the calendars and the breaks a product page lists. One shared
 * invalidation holds that set; this proves both hooks run all of it.
 *
 * The services are stood in for; what is under test is the invalidation the
 * mutation hooks run on success.
 */
vi.mock("@/lib/supabase/client", () => ({ getClient: () => ({}) }));

vi.mock("@/services/products/products.service", () => ({
  ProductsService: class {
    updateProduct() {
      return Promise.resolve({});
    }
  },
}));

vi.mock("@/services/holiday-calendars/holiday-calendars.service", () => ({
  HolidayCalendarsService: class {
    updateHolidayCalendar() {
      return Promise.resolve({});
    }
  },
}));

import { useUpdateHolidayCalendar } from "@/services/holiday-calendars/holiday-calendars.queries";
import { holidayBreakKeys } from "@/services/holiday-breaks/holiday-breaks.keys";
import {
  invalidatePlanReaders,
  planReaderRoots,
} from "@/services/products/plan-readers";
import { useUpdateProduct } from "@/services/products/products.queries";
import type { UpdateProductInput } from "@/services/products/products.service";

const PRODUCT = "e2b9c4d1-8a3f-4f6e-b0d2-9c5a1e7f3b28";
const CALENDAR = "4b8e2f6a-1c3d-4e5f-8a7b-9c0d1e2f3a4b";

/** A whole product edit; the service is stood in for, so only its shape matters. */
const PRODUCT_EDIT: UpdateProductInput = {
  billing_mode: "paid",
  translations: [
    { locale: "en", name: "X", short_description: "Y", long_description: null },
  ],
  topic: "minecraft_java",
  for_gamers: true,
  for_parents: false,
  min_age: 7,
  max_age: 12,
  tag: null,
  region_lock_country: null,
  requires_gamer_creations: false,
  spoken_language_code: "en",
  image_id: null,
  material_url: null,
  location_id: null,
  is_remote: true,
  start_date: "2026-09-01",
  end_date: null,
  timezone: "Europe/Helsinki",
  seat_count: null,
  waitlist_enabled: false,
  registration_opens_at: "2026-01-01T00:00:00Z",
  is_visible: true,
  schedule_slots: [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }],
  prices: [],
  required_consent_slugs: [],
  marketing_consent_types: [],
  gamer_photo_consent_types: [],
  primary_gedu_fee_cents: null,
  assistant_gedu_fee_cents: null,
  municipality_fee_cents: null,
  invoice_customer_id: null,
  holiday_calendar_ids: [CALENDAR],
};

/** One cached entry under each plan-reader root, plus one under none of them. */
const UNRELATED = ["unrelated-root", "entry"] as const;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  for (const root of planReaderRoots) {
    client.setQueryData([...root, "entry"], { cached: true });
  }
  client.setQueryData(UNRELATED, { cached: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = (key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;
  return { client, wrapper, stale };
}

function expectEveryPlanReaderStale(stale: (key: readonly unknown[]) => unknown) {
  for (const root of planReaderRoots) {
    expect(stale([...root, "entry"]), JSON.stringify(root)).toBe(true);
  }
  expect(stale(UNRELATED)).toBe(false);
}

describe("plan-reader invalidation", () => {
  it("names the holiday breaks a product page lists among the plan readers", () => {
    expect(planReaderRoots).toContainEqual(holidayBreakKeys.all);
  });

  it("marks every plan-reader root stale, and nothing else", async () => {
    const { client, stale } = setup();

    await invalidatePlanReaders(client);

    expectEveryPlanReaderStale(stale);
  });

  it("runs on a product save", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useUpdateProduct(PRODUCT), { wrapper });

    await act(() => result.current.mutateAsync(PRODUCT_EDIT));

    expectEveryPlanReaderStale(stale);
  });

  it("runs on a calendar save", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useUpdateHolidayCalendar(), {
      wrapper,
    });

    await act(() =>
      result.current.mutateAsync({
        id: CALENDAR,
        input: { name: "Autumn", breaks: [] },
      }),
    );

    expectEveryPlanReaderStale(stale);
  });
});
