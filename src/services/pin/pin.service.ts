import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Parent-PIN client service. Follows the project's two-file service pattern:
 * the read (`isSet`) uses the injected Supabase client (`pin_is_set` is granted
 * to `authenticated` and scoped to the caller's own row), while the writes go
 * through the API routes — they set/clear the HMAC unlock cookie server-side
 * (`verify`, `setPin`) or touch the service-role admin client (`reset`), none
 * of which the browser client can do. See docs/parent-pin-architecture.md.
 */
export class PinService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** Whether the current parent account has a PIN configured. */
  async isSet(): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("pin_is_set");
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Whether a PIN exists (`isSet`) and whether THIS session is unlocked
   * (`unlocked`). The unlock bit can't be read from the browser (HttpOnly
   * cookie), so it comes from the server route. Drives UI that must gate on
   * unlock state without bouncing through the full-page `/parent/unlock` gate.
   */
  async status(): Promise<{ isSet: boolean; unlocked: boolean }> {
    const res = await fetch("/api/auth/pin/status");
    if (!res.ok) throw new Error(await errorMessage(res, "Failed to load PIN status"));
    return (await res.json()) as { isSet: boolean; unlocked: boolean };
  }

  /**
   * Verify a PIN and unlock the session. Returns `true` on the correct PIN
   * (the unlock cookie is now set), `false` on an incorrect one. A wrong PIN is
   * a 200 with `{ verified: false }` — only a genuine request failure (e.g. the
   * session itself is invalid) throws.
   */
  async verify(pin: string): Promise<boolean> {
    const res = await fetch("/api/auth/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, "Failed to verify PIN"));
    const data = (await res.json()) as { verified?: boolean };
    return data.verified === true;
  }

  /**
   * Create the PIN (when none is set) or change it. Changing requires the
   * session to already be unlocked — the server rejects an overwrite from a
   * locked session. Also sets the unlock cookie, so the session is unlocked
   * afterwards.
   */
  async setPin(pin: string): Promise<void> {
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, "Failed to set PIN"));
  }

  /** Email the parent's inbox a PIN-reset link. Always resolves (no info leak). */
  async forgot(): Promise<void> {
    const res = await fetch("/api/auth/pin/forgot", { method: "POST" });
    if (!res.ok) throw new Error(await errorMessage(res, "Failed to send reset email"));
  }

  /** Complete a reset from the emailed link's signed token. Session-agnostic. */
  async reset(token: string, pin: string): Promise<void> {
    const res = await fetch("/api/auth/pin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pin }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, "Failed to reset PIN"));
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || fallback;
}
