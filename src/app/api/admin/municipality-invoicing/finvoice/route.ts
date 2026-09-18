import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import {
  buildFinvoiceForMonth,
  finvoiceFileName,
  serializeFinvoice,
  type FinvoiceRefusal,
} from "@/lib/finvoice";
import { MunicipalityInvoicingService } from "@/services/municipality-invoicing";

/**
 * GET /api/admin/municipality-invoicing/finvoice?month=YYYY-MM&customer=<uuid>
 *
 * One Fennoa customer's month as a Finvoice 3.0 file, for the CFO to import.
 *
 * **It is a read, and a download is a navigation.** Nothing is written, nothing
 * is marked as exported, and re-fetching the same month for the same customer
 * produces the same invoice — Fennoa assigns the real invoice number when the
 * invoice is sent, so there is no number for us to consume and no state for us
 * to keep. That is why this is a GET the page can link to rather than a POST
 * behind a button.
 *
 * **It reads the month exactly as the page does**: the same RPC through the
 * same service on the admin's own session client. The RPC is guard-first on
 * `assert_admin()`, so the role gate here is the first of two layers rather
 * than the only one.
 *
 * **The month is built in Finnish whatever the admin reads in.** Every name in
 * the file — the municipality, the hall, the club — goes to a Finnish
 * municipality's accounts payable, so the export's locale is a property of the
 * document rather than of the reader.
 *
 * A refusal is a 409 with a machine-readable `code`, because the two refusals
 * are ordinary states of an ordinary month rather than faults: a club that ran
 * this month with no fee against it, and a customer with nothing recorded. The
 * page already renders the same two states as a disabled control with the same
 * reason — both from one predicate — so a 409 here is what somebody reaches by
 * pasting a stale link, not by clicking.
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
    // One clock for the request: the month's own "today" — which decides what
    // bills — and the file's generation stamp are read from the same instant.
    const now = new Date();

    const service = new MunicipalityInvoicingService(supabase);
    const snapshot = await service.getMonth(`${query.month}-01`);

    const result = buildFinvoiceForMonth({
      snapshot,
      customerId: query.customer,
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
 * that can render a translated version of these two states — the ledger — has
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
      return "No club in this month is invoiced to that customer.";
    case "club_without_fee":
      return refusal.clubsWithoutFee === 1
        ? "One of this customer's clubs ran this month with no fee set, so the invoice would be short. Set the fee and export again."
        : `${refusal.clubsWithoutFee} of this customer's clubs ran this month with no fee set, so the invoice would be short. Set the fees and export again.`;
    case "nothing_to_invoice":
      return "This customer's clubs recorded no sessions in this month, so there is nothing to invoice.";
  }
}
