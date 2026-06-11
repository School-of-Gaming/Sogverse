import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import { familyListResponse, type FamilyMember } from "./family.contracts";

export type { FamilyMember } from "./family.contracts";

export class FamilyService {
  async getFamily(): Promise<FamilyMember[]> {
    const res = await fetch("/api/family/list", { method: "GET" });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to load family"));
    }
    const data = await parseJsonResponse(res, familyListResponse);
    return data.family;
  }

  async switchAccount(userId: string): Promise<void> {
    const res = await fetch("/api/auth/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      throw new Error(
        await readErrorMessage(res, "Failed to switch account")
      );
    }
  }
}
