import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  familyListResponse,
  switchAccountErrorResponse,
  type FamilyListResponse,
  type SwitchAccountErrorCode,
} from "./family.contracts";

export type { FamilyMember, FamilyListResponse } from "./family.contracts";

/**
 * A refusal of the switch route that the caller is meant to act on, carrying the
 * machine-readable code the route attached.
 *
 * A typed error rather than a returned discriminated union because every caller
 * of `switchAccount` is inside a `try` already — the success path ends in a
 * full-page navigation and has nothing to return to — so an error is the shape
 * that reaches them. `code` is undefined for the refusals that are not gate
 * failures at all (switching to yourself, to somebody outside your family), and
 * a caller branching on it must handle that.
 */
export class SwitchAccountError extends Error {
  readonly code: SwitchAccountErrorCode | undefined;
  readonly status: number;

  constructor(
    message: string,
    status: number,
    code: SwitchAccountErrorCode | undefined,
  ) {
    super(message);
    this.name = "SwitchAccountError";
    this.status = status;
    this.code = code;
  }
}

/**
 * The credential a switch may have to carry. Optional, because only one caller
 * in three pays anything: a parent dropping to a child sends nothing, a child in
 * a switched-in session sends a linked parent's PIN, and a child in a session
 * they opened themselves cannot switch at all — no credential buys that.
 */
export interface SwitchAccountCredentials {
  /** A linked parent's PIN — required when leaving a switched-in session. */
  pin?: string;
}

export class FamilyService {
  async getFamily(): Promise<FamilyListResponse> {
    const res = await fetch("/api/family/list", { method: "GET" });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to load family"));
    }
    return parseJsonResponse(res, familyListResponse);
  }

  async switchAccount(
    userId: string,
    credentials: SwitchAccountCredentials = {},
  ): Promise<void> {
    const res = await fetch("/api/auth/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...credentials }),
    });
    if (res.ok) return;

    // The refusal body is read once and parsed leniently: a gate failure carries
    // a code, and everything else (a 500, a proxy's own error page) does not, so
    // a failed parse must still surface a usable message rather than becoming a
    // second, unrelated error.
    const fallback = "Failed to switch account";
    const parsed = switchAccountErrorResponse.safeParse(
      await res.json().catch(() => null),
    );
    throw new SwitchAccountError(
      parsed.success ? parsed.data.error : fallback,
      res.status,
      parsed.success ? parsed.data.code : undefined,
    );
  }
}
