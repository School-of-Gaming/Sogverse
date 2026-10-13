import type { AppSupabaseClient, ProductType } from "@/types";
import { walkPages } from "@/lib/supabase/paging";
import {
  holidayCalendarChangePreview,
  holidayCalendarInput,
  type HolidayBreakInput,
  type HolidayCalendarChangePreview,
  type HolidayCalendarInput,
} from "./holiday-calendars.contracts";

/** One authored name — a break's in one locale, or a product's. */
export interface LocaleName {
  locale: string;
  name: string;
}

/** One stored break: bare calendar dates, both inclusive, and its names. */
export interface HolidayCalendarBreak {
  id: string;
  startDate: string;
  endDate: string;
  names: LocaleName[];
}

/** A calendar as the list shows it. */
export interface HolidayCalendarSummary {
  id: string;
  /** Admin-only: no family or gedu ever reads it. */
  name: string;
  /** Soonest first. */
  breaks: HolidayCalendarBreak[];
  /** How many clubs follow the calendar. */
  productCount: number;
}

/** A club following the calendar, as its page links to it. */
export interface HolidayCalendarProduct {
  id: string;
  productType: ProductType;
  /** Every locale written; which one to read is the reader's. */
  translations: LocaleName[];
}

/** One calendar as its page and its edit form read it. */
export interface HolidayCalendarDetail {
  id: string;
  name: string;
  /** Soonest first. */
  breaks: HolidayCalendarBreak[];
  products: HolidayCalendarProduct[];
}

const BREAK_COLUMNS =
  "id, start_date, end_date, holiday_break_translations(locale, name)";

interface StoredBreak {
  id: string;
  start_date: string;
  end_date: string;
  holiday_break_translations: LocaleName[];
}

/** Stored breaks in the shape every reader takes, soonest first. */
function toBreaks(rows: readonly StoredBreak[]): HolidayCalendarBreak[] {
  return rows
    .map((row) => ({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      names: row.holiday_break_translations,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** The writers' break payload, as the functions name its fields. */
function toPayload(breaks: readonly HolidayBreakInput[]) {
  return breaks.map((entry) => ({
    id: entry.id,
    start_date: entry.start_date,
    end_date: entry.end_date,
    names: entry.names,
  }));
}

/**
 * Holiday calendars — the named lists of breaks a club follows.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`:
 * no write needs a server-side secret. The reads are plain table reads under
 * the tables' admin select policies, and the writes and the preview are
 * admin-guarded functions — the tables carry no write grant, so the functions
 * are the only way in.
 */
export class HolidayCalendarsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Every calendar, ordered by name, with its breaks and how many clubs follow
   * it. Walked rather than read in one request, because a truncated read would
   * quietly drop calendars off the end of a list whose job is to show them all.
   */
  async listHolidayCalendars(): Promise<HolidayCalendarSummary[]> {
    const rows = await walkPages("listHolidayCalendars", (from, to) =>
      this.supabase
        .from("holiday_calendars")
        .select(
          `id, name, holiday_breaks(${BREAK_COLUMNS}), product_holiday_calendars(product_id)`,
          { count: "exact" },
        )
        .order("name")
        .order("id")
        .range(from, to),
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      breaks: toBreaks(row.holiday_breaks),
      productCount: row.product_holiday_calendars.length,
    }));
  }

  /**
   * One calendar by id, with its breaks and the clubs following it. `null`
   * for an id no calendar has, which the page renders as not found.
   */
  async getHolidayCalendar(id: string): Promise<HolidayCalendarDetail | null> {
    const { data, error } = await this.supabase
      .from("holiday_calendars")
      .select(
        `id, name, holiday_breaks(${BREAK_COLUMNS}), product_holiday_calendars(products!inner(id, product_type, product_translations(locale, name)))`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      breaks: toBreaks(data.holiday_breaks),
      products: data.product_holiday_calendars.map(({ products }) => ({
        id: products.id,
        productType: products.product_type,
        translations: products.product_translations,
      })),
    };
  }

  /** Create a calendar. Returns its id. */
  async createHolidayCalendar(input: HolidayCalendarInput): Promise<string> {
    const parsed = holidayCalendarInput.parse(input);

    const { data, error } = await this.supabase.rpc("create_holiday_calendar", {
      p_name: parsed.name,
      p_breaks: toPayload(parsed.breaks),
    });

    if (error) throw error;
    if (!data) throw new Error("create_holiday_calendar returned no id");
    return data;
  }

  /**
   * Save a calendar's name and its whole set of breaks: a break with an id is
   * that stored break, one without is new, and a stored break left out is
   * deleted. Live — every club following the calendar changes with it.
   */
  async updateHolidayCalendar(
    id: string,
    input: HolidayCalendarInput,
  ): Promise<void> {
    const parsed = holidayCalendarInput.parse(input);

    const { error } = await this.supabase.rpc("update_holiday_calendar", {
      p_id: id,
      p_name: parsed.name,
      p_breaks: toPayload(parsed.breaks),
    });

    if (error) throw error;
  }

  /**
   * What saving `breaks` to the calendar would change, per club following it.
   * Writes nothing, and refuses exactly what the save would, with the same
   * sentence.
   */
  async previewHolidayCalendarChange(
    id: string,
    breaks: readonly HolidayBreakInput[],
  ): Promise<HolidayCalendarChangePreview> {
    const { data, error } = await this.supabase.rpc(
      "preview_holiday_calendar_change",
      { p_calendar_id: id, p_breaks: toPayload(breaks) },
    );

    if (error) throw error;
    return holidayCalendarChangePreview.parse(data);
  }
}
