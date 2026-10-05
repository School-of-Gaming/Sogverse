import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import {
  buildFinvoiceForPeriod,
  finvoiceFileName,
  finvoiceFileState,
  serializeFinvoice,
  type BillingPeriod,
  type FinvoiceRefusal,
} from "@/lib/finvoice";
import { InvoiceCustomersService } from "@/services/invoice-customers";
import { MunicipalityInvoicingService } from "@/services/municipality-invoicing";

/**
 * GET /api/admin/municipality-invoicing/finvoice?month=YYYY-MM&customer=<uuid>
 *
 * One Fennoa customer's billing period as a Finvoice 3.0 file, for the CFO to
 * import: its month for a monthly customer, and for a quarterly or half-yearly
 * one the whole period that ends in `month`. A month that ends no period of the
 * customer's is refused — a period's file is produced in its last month and
 * nowhere else.
 *
 * **It is a read, and a download is a navigation.** Nothing is written, nothing
 * is marked as exported, and re-fetching the same period for the same customer
 * produces the same invoice — Fennoa assigns the real invoice number when the
 * invoice is sent, so there is no number for us to consume and no state for us
 * to keep. That is why this is a GET the page can link to rather than a POST
 * behind a button.
 *
 * **It reads each month exactly as the page does**: the same RPC through the
 * same service on the admin's own session client, once per month of the
 * period. The customer's own row is read first, because its cadence decides
 * which months those are — and a quarterly buyer whose clubs stopped in May
 * still owes the quarter that ends in June, a month with no club of its in it.
 * The RPC is guard-first on `assert_admin()` and the customer table is
 * admin-only by RLS, so the role gate here is the first of two layers rather
 * than the only one.
 *
 * **The months are built in Finnish whatever the admin reads in.** Every name
 * in the file — the municipality, the hall, the club — goes to a Finnish
 * municipality's accounts payable, so the export's locale is a property of the
 * document rather than of the reader.
 *
 * A refusal is a 409 with a machine-readable `code`, because every refusal is
 * an ordinary state of an ordinary month rather than a fault: a period that has
 * not ended, a club that ran with no fee against it, and a customer with
 * nothing to bill. The page already renders the same states as a label or a
 * disabled control with the same reason — all from one predicate — so a 409
 * here is what somebody reaches by pasting a stale link, not by clicking.
 */

/**
 * `?month=YYYY-MM`, with the year inside this century — the same bound the page
 * route applies, and for the same reason: `0007-03` is spelled correctly and
 * names a month nobody has ever invoiced.
 *
 * Where the page falls back to a default for a malformed value, this refuses
 * one: a page with a mistyped URL can still show the reader the month they
 * meant, and a file cannot be "close enough" to the month it claims to be.
 */
const MONTH_PARAM = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const GET = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can export municipality invoices",
  query: z.object({
    month: z
      .string()
      .regex(MONTH_PARAM, "Use a month of this century, e.g. 2026-05"),
    customer: z.string().uuid(),
  }),

  handler: async ({ supabase, query }) => {
    // One clock for the request: each month's own "today" — which decides what
    // bills — and the file's generation stamp are read from the same instant.
    const now = new Date();
    const monthStart = `${query.month}-01`;

    const customer = await new InvoiceCustomersService(
      supabase,
    ).getInvoiceCustomer(query.customer);
    if (customer === null) {
      return refusalResponse({ ok: false, reason: "unknown_customer" });
    }

    // Asked before any month is read, of the same predicate the build asks
    // again below: with nothing read yet it can only say whether this month
    // ends the customer's period, and a month in the middle is refused here by
    // the answer the page's label comes from rather than by a second spelling
    // of the rule.
    const before = finvoiceFileState({
      monthStart,
      cadence: customer.billing_cadence,
      months: new Map(),
    });
    if (!before.ok && before.reason === "not_period_end") {
      return refusalResponse(before);
    }

    const service = new MunicipalityInvoicingService(supabase);
    const snapshots = await Promise.all(
      before.period.months.map((month) => service.getMonth(month)),
    );

    const result = buildFinvoiceForPeriod({
      monthStart,
      snapshots,
      customerId: customer.id,
      now,
    });
    if (!result.ok) return refusalResponse(result);

    const { invoice } = result;
    const xml = serializeFinvoice(invoice, now);

    // A string body is encoded as UTF-8 with no byte-order mark, which is what
    // the import needs — a BOM reaches Fennoa as stray bytes before the XML
    // declaration and the file is refused.
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${finvoiceFileName(invoice.monthStart, invoice.customer.fennoa_customer_no)}"`,
        // An invoice is recomputed from today's fees every time it is asked
        // for, so a cached copy is a file that can quietly disagree with the
        // ledger the CFO checked it against.
        "Cache-Control": "no-store",
      },
    });
  },
});

/**
 * A refusal, in the wire shape every other route on this surface uses: a
 * sentence for the admin and a stable `code` for anything reading the response.
 *
 * The sentences are English here rather than in `messages/`, like every other
 * route's: this is an API answer rather than a rendered page, and the surface
 * that can render a translated version of these states — the ledger — has
 * already done so beside the control the reader would have clicked.
 */
function refusalResponse(refusal: FinvoiceRefusal): NextResponse {
  return NextResponse.json(
    { error: refusalMessage(refusal), code: refusal.reason },
    { status: 409 },
  );
}

function refusalMessage(refusal: FinvoiceRefusal): string {
  switch (refusal.reason) {
    case "unknown_customer":
      return "No club in this period is invoiced to that customer.";
    case "not_period_end":
      return `This customer is invoiced ${CADENCE_WORD[refusal.period.cadence]}, so its invoice for this period is produced in ${monthName(refusal.period.lastMonth)}.`;
    case "club_without_fee":
      return refusal.clubsWithoutFee === 1
        ? `One of this customer's clubs ran in ${monthName(refusal.monthStart)} with no fee set, so the invoice would be short. Set the fee and export again.`
        : `${refusal.clubsWithoutFee} of this customer's clubs ran in ${monthName(refusal.monthStart)} with no fee set, so the invoice would be short. Set the fees and export again.`;
    case "nothing_to_invoice":
      return `This customer's clubs have no billable sessions in ${periodName(refusal.period)}, so there is nothing to invoice.`;
  }
}

const CADENCE_WORD: Record<BillingPeriod["cadence"], string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  half_yearly: "half-yearly",
};

/** `March 2026` — English, like every sentence this route writes. */
function monthName(monthStart: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart}T00:00:00Z`));
}

/** The month, or the run of months, a refusal is about. */
function periodName(period: BillingPeriod): string {
  return period.months.length === 1
    ? monthName(period.lastMonth)
    : `${monthName(period.firstMonth)} to ${monthName(period.lastMonth)}`;
}
