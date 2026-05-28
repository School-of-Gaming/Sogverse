import type { GeduAssignedProductRosterEntry } from "@/types";

/**
 * Convenience alias for the roster row shape consumed by
 * `GamerRosterRow` and `AssignedGroupCard`. The RPC already returns
 * exactly this — the alias is just a shorter import for the components.
 */
export type GamerSessionRow = GeduAssignedProductRosterEntry;
