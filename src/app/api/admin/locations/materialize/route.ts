import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { materializeLocationBody } from "@/services/locations/locations.contracts";
import {
  findLeafChain,
  loadCatalog,
  type CatalogCountry,
} from "@/lib/locations/catalog";
import { getCountryConfig } from "@/lib/constants";
import type { AppSupabaseClient, Location, LocationType } from "@/types";

/**
 * POST /api/admin/locations/materialize
 *
 * Turns one municipality-level catalog entry into `locations` rows: the
 * commune plus whichever of its ancestors are not there yet, top-down.
 *
 * The catalogs are exhaustive (34,875 French communes) and the table holds only
 * rows something references, so a commune becomes a row the first moment an
 * admin picks it. Every name and code in the chain is read from the catalog on
 * the server — the request carries only the pair that identifies the entry —
 * which is what makes a mistyped or duplicated place name impossible rather
 * than merely discouraged.
 *
 * Same posture as the create route: `locations` is admin-only reference data,
 * the write runs on the USER-bound client, and the admin_manage_locations
 * policy is the second layer behind the route's role check.
 *
 * Idempotent by construction. Every level is looked up on the same
 * `(country_code, type, external_code)` key the unique index enforces, so a
 * second call for an already-materialized commune inserts nothing and returns
 * the existing row.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can add locations from the catalog",
  body: materializeLocationBody,

  handler: async ({ supabase, body }) => {
    const catalog = await loadCatalog(body.country_code);
    const chain = findLeafChain(catalog, body.external_code);

    // A code the catalog does not contain is bad input, not a missing
    // resource: the pair is a request field the schema alone cannot fully
    // validate, so it answers the same 400 a schema failure would.
    if (!chain) {
      throw new ApiError(
        `No ${body.country_code} catalog entry with code ${body.external_code}`,
        400,
      );
    }

    let parentId = await getOrCreateCountry(supabase, body.country_code);
    let row: Location | null = null;

    for (const [depth, node] of chain.entries()) {
      // The catalog's own `levels` says what each depth means, and the chain is
      // built by walking those levels — so a country that skips one (Finland
      // has no `district`) needs no special case here.
      row = await getOrCreate(supabase, {
        countryCode: body.country_code,
        type: catalog.levels[depth],
        externalCode: node[0],
        name: node[1],
        parentId,
      });
      parentId = row.id;
    }

    // `chain` is non-empty whenever `findLeafChain` matched, so the loop always
    // assigns — the check is what proves it to the compiler.
    if (!row) {
      throw new ApiError(
        `Empty catalog chain for ${body.country_code} ${body.external_code}`,
        500,
      );
    }
    return row;
  },
});

/**
 * The chain's root parent. Seeded for every catalog country, and the COG has no
 * country-level code so this one row is matched on its type and country rather
 * than on `external_code`.
 *
 * Creating it when it is missing is deliberate: the catalog is authoritative,
 * and an admin's pick must not fail because reference data is incomplete. The
 * name then comes from the hierarchy config, which is where the app's own
 * country names live.
 */
async function getOrCreateCountry(
  supabase: AppSupabaseClient,
  countryCode: CatalogCountry,
): Promise<string> {
  const existing = await findCountry(supabase, countryCode);
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("locations")
    .insert({
      name: getCountryConfig(countryCode)?.name ?? countryCode,
      type: "country",
      parent_id: null,
      country_code: countryCode,
    })
    .select()
    .single();

  if (error) {
    // No unique index covers the country row (its `external_code` is null), so
    // a lost race shows up as whatever the insert failed with. Re-read before
    // giving up: if a concurrent caller seeded it, its row is the right answer.
    const winner = await findCountry(supabase, countryCode);
    if (winner) return winner.id;
    throw error;
  }
  return data.id;
}

async function findCountry(
  supabase: AppSupabaseClient,
  countryCode: string,
): Promise<Location | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("type", "country")
    .eq("country_code", countryCode)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

interface CatalogLevelRow {
  countryCode: CatalogCountry;
  type: LocationType;
  externalCode: string;
  name: string;
  parentId: string;
}

async function getOrCreate(
  supabase: AppSupabaseClient,
  level: CatalogLevelRow,
): Promise<Location> {
  const existing = await findByCode(supabase, level);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("locations")
    .insert({
      name: level.name,
      type: level.type,
      parent_id: level.parentId,
      country_code: level.countryCode,
      external_code: level.externalCode,
    })
    .select()
    .single();

  if (error) {
    // 23505 — a concurrent materialization of the same commune inserted this
    // level between our read and our write. The unique index is the arbiter, so
    // re-read and use the winner's row rather than failing a request that asked
    // for exactly the row that now exists.
    if (error.code === "23505") {
      const winner = await findByCode(supabase, level);
      if (winner) return winner;
    }
    throw error;
  }
  return data;
}

async function findByCode(
  supabase: AppSupabaseClient,
  level: CatalogLevelRow,
): Promise<Location | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("country_code", level.countryCode)
    .eq("type", level.type)
    .eq("external_code", level.externalCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}
