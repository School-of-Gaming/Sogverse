import { UTM_COOKIE_NAME } from "@/lib/utm";

/**
 * The `sog_attribution` pair as a browser sends it back, for a `Cookie` header:
 * the serialised fields, percent-encoded once more as both writers encode them.
 * Serialised here rather than through `serialiseUtm` so a case can also carry a
 * value the sanitiser refuses, which a hand-edited cookie could.
 */
export function attributionCookie(fields: Record<string, string>): string {
  const serialised = new URLSearchParams(fields).toString();
  return `${UTM_COOKIE_NAME}=${encodeURIComponent(serialised)}`;
}
