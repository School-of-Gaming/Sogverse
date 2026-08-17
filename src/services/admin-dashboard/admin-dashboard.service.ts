import type { AppSupabaseClient } from "@/types";
import {
  adminDashboardSnapshot,
  type AdminDashboardSnapshot,
} from "./admin-dashboard.contracts";

/**
 * The admin dashboard's data layer: one read, one RPC, one document.
 *
 * The page is four platform-wide aggregates — a users strip, a gedu
 * certification queue, a product attention queue, and a schedule with its
 * coming-up feed — and they are only meaningful together: the schedule marks a
 * chip because the attention queue flagged that product. Four separate queries
 * would be four round trips and four cache entries that can disagree about what
 * the platform looks like. `get_admin_dashboard` answers all of it at one
 * moment, and this class is the whole of its client side.
 *
 * The RPC is admin-gated in its own body (guard-first on `assert_admin`), so it
 * is called from the browser with the admin's own session — no API route, no
 * admin client.
 */
export class AdminDashboardService {
  constructor(private supabase: AppSupabaseClient) {}

  /** Loads the whole admin dashboard document (admin-only). */
  async getDashboard(): Promise<AdminDashboardSnapshot> {
    const { data, error } = await this.supabase.rpc("get_admin_dashboard");
    if (error) throw error;
    // The RPC returns `Json`; the contract schema is the structure.
    return adminDashboardSnapshot.parse(data);
  }
}
