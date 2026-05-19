import "server-only";
import { cookies } from "next/headers";
import { resolveTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";

/**
 * Server-side mirror of `useTimezone()` — reads and validates the same
 * `timezone` cookie that `TimezoneProvider` seeds, falling back to
 * `DEFAULT_TIMEZONE` when the cookie is missing or malformed.
 *
 * Use this in any Server Component or server-side helper that formats a
 * date/time for the viewer. SSR and the first client render then consume
 * the same zone (the provider passes the same value into context), so
 * dates render identically across the hydration boundary.
 */
export async function getServerTimezone(): Promise<string> {
  const cookieStore = await cookies();
  return resolveTimezone(cookieStore.get(TIMEZONE_COOKIE_NAME)?.value);
}
