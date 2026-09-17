import type { AppSupabaseClient } from "@/types";
import {
  municipalityInvoicingSnapshot,
  type MunicipalityInvoicingSnapshot,
} from "./municipality-invoicing.contracts";

/**
 * The municipality invoicing page's data layer: one read, one RPC, one
 * document.
 *
 * An invoice is a claim about a whole month at one moment — which clubs ran,
 * how often, at what fee — and the parts of it are only meaningful together: a
 * municipality's total is the sum of its clubs, and a club that answered from a
 * second round trip could be counted against a fee read in the first. One
 * function answers all of it at one moment, and this class is the whole of its
 * client side.
 *
 * The RPC is admin-gated in its own body (guard-first on `assert_admin`), so it
 * is called with the admin's own session — no API route, no admin client.
 */
export class MunicipalityInvoicingService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Loads one calendar month of municipality invoicing (admin-only).
   *
   * `monthStart` is the month's first day as a bare `YYYY-MM-01` date. Anything
   * else is refused by the function itself rather than quietly answered with a
   * month-long window that matches no calendar month.
   */
  async getMonth(monthStart: string): Promise<MunicipalityInvoicingSnapshot> {
    const { data, error } = await this.supabase.rpc(
      "get_admin_municipality_invoicing",
      { p_month_start: monthStart },
    );
    if (error) throw error;
    // The RPC returns `Json`; the contract schema is the structure.
    return municipalityInvoicingSnapshot.parse(data);
  }
}
