import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

// Proxies frankfurter.dev to avoid adding an external origin to the
// browser's CSP connect-src. Frankfurter is free, no-auth, ECB-sourced
// reference rates — good enough for the admin pricing suggestion in
// product-form.tsx. Admin-only because this endpoint is a ~cheap~
// leverage point for frankfurter traffic if exposed publicly.
//
// The route itself is dynamic (reads cookies for the admin auth check),
// so the cache that actually does work is the inner fetch's `next.revalidate`
// below — Next.js's data cache, keyed by URL.

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export async function GET() {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const res = await fetch(
    "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP,USD",
    { next: { revalidate: 21600 } }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Frankfurter HTTP ${res.status}` },
      { status: 502 }
    );
  }
  const body = (await res.json()) as FrankfurterResponse;
  return NextResponse.json({
    eur: 1,
    gbp: body.rates.GBP,
    usd: body.rates.USD,
  });
}
