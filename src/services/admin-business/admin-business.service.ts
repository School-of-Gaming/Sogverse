import { buildMunicipalityInvoicing } from "@/components/admin/municipality-invoicing/build-municipality-invoicing";
import { buildGeduInvoicing } from "@/components/gedu-invoicing/build-gedu-invoicing";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { HELD_SEAT_STATUSES } from "@/lib/constants/participations";
import { walkPages } from "@/lib/supabase/paging";
import { GeduInvoicingService } from "@/services/gedu-invoicing/gedu-invoicing.service";
import { MunicipalityInvoicingService } from "@/services/municipality-invoicing/municipality-invoicing.service";
import type { AppSupabaseClient } from "@/types";
import {
  BUSINESS_MONTH_COUNT,
  buildBusinessOverview,
  type BusinessFacts,
  type BusinessOverview,
  type GeduMonthSessions,
  type HeldSession,
  type MunicipalityMonthTotal,
} from "./admin-business.build";
import { recentHelsinkiMonths } from "./helsinki-month";

/**
 * The business page's reads (admin-only).
 *
 * Every table here already admits an admin through its own policy, so the
 * reads are plain walked selects on the admin's own session, shaped in
 * `admin-business.build.ts`. The two invoicing figures are not recomputed:
 * each month is read through the invoicing page's own RPC and built by that
 * page's own build, so the money and the gedus counted here are exactly the
 * ones those pages show.
 */
export class AdminBusinessService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Every figure on the page, as of `now` — which the caller fixes once per
   * request so the invoicing builds and this one share a clock.
   *
   * A perceptibly slow read: every parent, seat, subscription and payment,
   * plus twelve months of each invoicing document. A refusal from either
   * invoicing read (a municipality club whose location reaches no
   * municipality) fails the whole read, as it fails that page.
   */
  async getOverview(now: Date): Promise<BusinessOverview> {
    const months = recentHelsinkiMonths(now, BUSINESS_MONTH_COUNT);
    const [
      families,
      products,
      seats,
      subscriptions,
      prices,
      payments,
      municipalityMonths,
      geduMonths,
      assignments,
      geduProfiles,
    ] = await Promise.all([
      this.readFamilies(),
      this.readProducts(),
      this.readSeats(),
      this.readSubscriptions(),
      this.readPrices(),
      this.readPayments(),
      Promise.all(months.map((month) => this.readMunicipalityMonth(month, now))),
      Promise.all(months.map((month) => this.readGeduMonth(month, now))),
      this.readAssignments(),
      this.readGeduProfiles(),
    ]);
    const facts: BusinessFacts = {
      families,
      products,
      seats,
      subscriptions,
      prices,
      payments,
      municipalityMonths,
      geduMonths,
      assignments,
      geduProfiles,
    };
    return buildBusinessOverview(facts, now);
  }

  private readFamilies() {
    return walkPages("businessFamilies", (from, to) =>
      this.supabase
        .from("profiles")
        .select("id, created_at", { count: "exact" })
        .eq("role", "customer")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
  }

  private readProducts() {
    return walkPages("businessProducts", (from, to) =>
      this.supabase
        .from("products")
        .select("id, product_type, billing_mode, start_date, end_date, timezone", { count: "exact" })
        .order("id")
        .range(from, to),
    );
  }

  /** Every seat held now or once; a waitlist place never was one. */
  private readSeats() {
    return walkPages("businessSeats", (from, to) =>
      this.supabase
        .from("participations")
        .select(
          "id, customer_id, participant_id, product_id, group_id, group_joined_at, signed_up_at, ended_at",
          { count: "exact" },
        )
        .in("status", [...HELD_SEAT_STATUSES, "ended"])
        .order("id")
        .range(from, to),
    );
  }

  private readSubscriptions() {
    return walkPages("businessSubscriptions", (from, to) =>
      this.supabase
        .from("family_subscriptions")
        .select("customer_id, participation_id, currency, status, created_at, ended_at", {
          count: "exact",
        })
        .order("id")
        .range(from, to),
    );
  }

  private readPrices() {
    return walkPages("businessPrices", (from, to) =>
      this.supabase
        .from("product_prices")
        .select("product_id, currency, price_cents", { count: "exact" })
        .order("product_id")
        .order("currency")
        .range(from, to),
    );
  }

  private readPayments() {
    return walkPages("businessPayments", (from, to) =>
      this.supabase
        .from("payments")
        .select("customer_id, amount_cents, currency, purpose, product_id, created_at", {
          count: "exact",
        })
        .order("id")
        .range(from, to),
    );
  }

  /**
   * One month's municipality invoicing total, from that page's build. The
   * locale only names and orders the ledger's lines, so any one gives the
   * same total.
   */
  private async readMunicipalityMonth(
    month: string,
    now: Date,
  ): Promise<MunicipalityMonthTotal> {
    const snapshot = await new MunicipalityInvoicingService(this.supabase).getMonth(month);
    const view = buildMunicipalityInvoicing({ snapshot, locale: DEFAULT_LOCALE, now });
    return { month, totalCents: view.totalCents, clubsWithoutFee: view.clubsWithoutFee };
  }

  /** Every gedu's group assignment now: assignments keep no history. */
  private readAssignments() {
    return walkPages("businessAssignments", (from, to) =>
      this.supabase
        .from("gedu_group_assignments")
        .select("gedu_id, group_id, product_id", { count: "exact" })
        .order("group_id")
        .order("gedu_id")
        .range(from, to),
    );
  }

  private readGeduProfiles() {
    return walkPages("businessGeduProfiles", (from, to) =>
      this.supabase
        .from("gedu_profiles")
        .select("user_id, certified", { count: "exact" })
        .order("user_id")
        .range(from, to),
    );
  }

  /**
   * The month's sessions held, each with the gedus that month's gedu invoicing
   * pays for it: one paid line is one gedu who ran one (group, date). The
   * locale only names the lines, so any one gives the same sessions.
   */
  private async readGeduMonth(month: string, now: Date): Promise<GeduMonthSessions> {
    const snapshot = await new GeduInvoicingService(this.supabase).getAdminMonth(month);
    const view = buildGeduInvoicing({ snapshot, locale: DEFAULT_LOCALE, now });
    const sessions = new Map<string, HeldSession & { geduIds: string[] }>();
    for (const gedu of view.gedus) {
      for (const club of gedu.clubs) {
        for (const line of club.lines) {
          if (line.kind !== "paid") continue;
          const key = `${line.groupId}:${line.date}`;
          const session = sessions.get(key);
          if (session === undefined) {
            sessions.set(key, {
              groupId: line.groupId,
              productId: club.productId,
              date: line.date,
              geduIds: [gedu.id],
            });
          } else if (!session.geduIds.includes(gedu.id)) {
            session.geduIds.push(gedu.id);
          }
        }
      }
    }
    return { month, sessions: [...sessions.values()] };
  }
}
