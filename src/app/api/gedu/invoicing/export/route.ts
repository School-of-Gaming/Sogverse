import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import {
  buildGeduInvoicing,
  type GeduInvoice,
} from "@/components/gedu-invoicing/build-gedu-invoicing";
import { buildGeduInvoiceCsv } from "@/components/gedu-invoicing/gedu-invoice-csv";
import { getGeduInvoicingTranslator } from "@/components/gedu-invoicing/gedu-invoice-export";
import {
  GEDU_INVOICE_EXPORT_FORMATS,
  geduInvoiceFileName,
} from "@/components/gedu-invoicing/gedu-invoice-file";
import { renderGeduInvoicePdf } from "@/components/gedu-invoicing/gedu-invoice-pdf";
import { GeduInvoicingService } from "@/services/gedu-invoicing";

/**
 * GET /api/gedu/invoicing/export?month=YYYY-MM&format=csv|pdf&locale=<locale>
 *
 * The calling gedu's month as a file: a CSV for their spreadsheet, or a PDF
 * work statement to attach to the invoice they write in their own tool.
 *
 * **It reads the month exactly as the gedu's page does**: the same RPC through
 * the same service on the gedu's own session client, which answers for the
 * caller alone and is guard-first on the gedu role — so the role gate here is
 * the first of two layers, and no other gedu's seats can reach the file.
 *
 * **The file is worded in the page's language**, which the page puts in the
 * link: the page's language is its URL's, and this route is outside the
 * `[locale]` tree.
 *
 * **A month with nothing in it still downloads**, as an empty month named for
 * the caller — a header-only CSV, and a statement saying there is nothing to
 * invoice — because that is a true answer about the month. A failed read is
 * not one, and answers an error rather than an empty file.
 */

/**
 * `?month=YYYY-MM`, with the year inside this century. Where the page falls
 * back to a default for a malformed value, a file refuses one: it cannot be
 * "close enough" to the month it claims to be.
 */
const MONTH_PARAM = /^20\d{2}-(0[1-9]|1[0-2])$/;

const CONTENT_TYPE = {
  // The CSV carries its own byte-order mark, which a string body sends as the
  // UTF-8 bytes Excel looks for.
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
} as const;

export const GET = defineRoute({
  posture: "role-gated",
  roles: "gedu",
  forbiddenMessage: "Only gedus can export their invoicing month",
  query: z.object({
    month: z
      .string()
      .regex(MONTH_PARAM, "Use a month of this century, e.g. 2026-05"),
    format: z.enum(GEDU_INVOICE_EXPORT_FORMATS),
    locale: z.enum(SUPPORTED_LOCALES),
  }),

  handler: async ({ supabase, user, profile, query }) => {
    // One clock for the request: what pays is decided against the same instant
    // the statement says its figures were read at.
    const now = new Date();
    const monthStart = `${query.month}-01`;
    const { locale } = query;

    const snapshot = await new GeduInvoicingService(supabase).getMyMonth(
      monthStart,
    );
    const invoice =
      buildGeduInvoicing({ snapshot, locale, now }).gedus.at(0) ??
      emptyMonth({
        id: user.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        email: profile.email,
      });

    const t = await getGeduInvoicingTranslator(locale);
    const body =
      query.format === "csv"
        ? buildGeduInvoiceCsv({ invoice, locale, t })
        : new Uint8Array(
            await renderGeduInvoicePdf({ invoice, monthStart, locale, now, t }),
          );

    return new NextResponse(body, {
      headers: {
        "Content-Type": CONTENT_TYPE[query.format],
        "Content-Disposition": `attachment; filename="${geduInvoiceFileName(monthStart, invoice, query.format)}"`,
        // Every figure is recomputed from today's facts on every read, so a
        // cached copy is a file that can quietly disagree with the page.
        "Cache-Control": "no-store",
      },
    });
  },
});

/**
 * The caller's month when the read carries nobody: the build lists only gedus
 * with at least one line, so the gedu is named from their own profile.
 */
function emptyMonth(
  gedu: Pick<GeduInvoice, "id" | "firstName" | "lastName" | "email">,
): GeduInvoice {
  return {
    ...gedu,
    clubs: [],
    municipalityTotalCents: 0,
    consumerTotalCents: 0,
    totalCents: 0,
    paidCount: 0,
    unrecordedCount: 0,
    clubsWithoutFee: 0,
    sessionsWithoutFee: 0,
  };
}
