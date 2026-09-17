import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

/**
 * The partner API's database client, constructed in exactly one place.
 *
 * **Service role, because there is no session to read as.** The caller is Lynx
 * Educate's tooling presenting an API key, not a Sogverse user, so no row-level
 * policy has anyone to evaluate — and the reads cross every family on a
 * Programme product by design. The key checked in each route is the whole of
 * the authorization; what bounds what leaves is the scope the read modules
 * apply (Programme products, live seats) and the response schemas, which admit
 * no field the published page does not describe.
 *
 * **Why an accessor rather than `createAdminClient()` in each read module.**
 * The route registry pins every file that names the service-role factory to a
 * written justification. The partner API has one justification for all of its
 * reads, so it has one construction site: routes call `partnerDb()` and hand
 * the client to the `partner-*.server.ts` read modules, which take it as a
 * parameter — the parameter is also what lets a test drive them with a stubbed
 * client. The registry's partner check holds the other half of the bargain:
 * this accessor may be named only under the partner routes and the partner
 * services, so it cannot become a way for the rest of the app to reach the
 * service role without the registry hearing about it.
 */
export type PartnerDb = SupabaseClient<Database>;

export function partnerDb(): PartnerDb {
  return createAdminClient();
}
