import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * A session belongs to a gedu when its start instant falls in
 * [started_at, ended_at), so a fixture about past sessions needs a period that
 * began long before them. This default is far earlier than any fixture date.
 */
export const EARLY_ASSIGNMENT_START = "2000-01-01T00:00:00Z";

export interface AssignmentSeed {
  groupId: string;
  geduId: string;
  productId: string;
  role?: "primary" | "assistant";
  startedAt?: string;
  endedAt?: string | null;
}

/** Insert several assignment periods straight into the table (service role). Throws on error. */
export async function seedAssignments(
  client: SupabaseClient<Database>,
  rows: AssignmentSeed[],
): Promise<void> {
  const { error } = await client.from("gedu_group_assignments").insert(
    rows.map((row) => ({
      group_id: row.groupId,
      gedu_id: row.geduId,
      product_id: row.productId,
      role: row.role ?? "primary",
      started_at: row.startedAt ?? EARLY_ASSIGNMENT_START,
      ended_at: row.endedAt ?? null,
    })),
  );
  if (error) throw new Error(`seed assignments failed: ${error.message}`);
}

/** Insert one assignment period straight into the table (service role). Throws on error. */
export function seedAssignment(
  client: SupabaseClient<Database>,
  row: AssignmentSeed,
): Promise<void> {
  return seedAssignments(client, [row]);
}
