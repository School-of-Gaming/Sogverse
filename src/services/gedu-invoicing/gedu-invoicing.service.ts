import type { AppSupabaseClient } from "@/types";
import {
  geduInvoicingSnapshot,
  type GeduInvoicingSnapshot,
} from "./gedu-invoicing.contracts";

/**
 * Gedu invoicing's data layer: two reads over one document.
 *
 * Both RPCs wrap the same internal builder and return the same shape. The admin
 * one answers for every gedu and is guard-first on `assert_admin`; the gedu one
 * answers for the caller alone and is guard-first on `assert_role('gedu')`. So
 * both are called with the signed-in user's own session — no API route, no
 * admin client.
 *
 * `monthStart` is the month's first day as a bare `YYYY-MM-01` date; anything
 * else is refused by the function itself.
 */
export class GeduInvoicingService {
  constructor(private supabase: AppSupabaseClient) {}

  /** One calendar month of invoicing for every gedu (admin-only). */
  async getAdminMonth(monthStart: string): Promise<GeduInvoicingSnapshot> {
    const { data, error } = await this.supabase.rpc(
      "get_admin_gedu_invoicing",
      { p_month_start: monthStart },
    );
    if (error) throw error;
    // The RPC returns `Json`; the contract schema is the structure.
    return geduInvoicingSnapshot.parse(data);
  }

  /** One calendar month of the calling gedu's own invoicing (gedu-only). */
  async getMyMonth(monthStart: string): Promise<GeduInvoicingSnapshot> {
    const { data, error } = await this.supabase.rpc("get_my_gedu_invoicing", {
      p_month_start: monthStart,
    });
    if (error) throw error;
    return geduInvoicingSnapshot.parse(data);
  }
}
