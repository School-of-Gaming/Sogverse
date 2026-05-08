import type { FamilyMember } from "@/app/api/family/list/route";

export type { FamilyMember };

export class FamilyService {
  async getFamily(): Promise<FamilyMember[]> {
    const res = await fetch("/api/family/list", { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Failed to load family");
    }
    const data = (await res.json()) as { family: FamilyMember[] };
    return data.family;
  }

  async switchAccount(userId: string): Promise<void> {
    const res = await fetch("/api/auth/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Failed to switch account");
    }
  }
}
