import { holidayBreakRows, type HolidayBreak } from "@/lib/holiday-breaks";
import type { AppSupabaseClient } from "@/types";

/**
 * The public read of a club's holiday breaks — what a family is shown before
 * and after signing up. The database answers it for anyone, signed in or not,
 * because a holiday calendar is public information about when a club meets.
 */
export class HolidayBreaksService {
  constructor(private readonly supabase: AppSupabaseClient) {}

  /**
   * The breaks of every calendar the product follows that overlap the span
   * (product-local `YYYY-MM-DD`, both inclusive), by first day, each with the
   * sessions it withdrew inside the span.
   */
  async getHolidayBreaks(
    productId: string,
    from: string,
    to: string,
  ): Promise<HolidayBreak[]> {
    const { data, error } = await this.supabase.rpc("holiday_breaks_document", {
      p_product_id: productId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    return holidayBreakRows.parse(data);
  }
}
