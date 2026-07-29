import { z } from "zod";
import { Constants } from "@/types";
import { CATALOG_COUNTRIES } from "@/lib/locations/catalog";

/**
 * Request/response contracts for the admin locations API.
 *
 * Both ends import from here: the route parses its request body with the
 * body schema (`parseJsonBody`), the service parses the response with the
 * row schema (`parseJsonResponse`). The compiler keeps the schemas honest at
 * the use sites — the route inserts the parsed body into `locations` (checked
 * against the generated Insert type) and the service returns `Location`
 * (checked against the generated Row type).
 */

export const createLocationBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(Constants.public.Enums.location_type),
  parent_id: z.string().nullable(),
  country_code: z.string().nullable().default(null),
});

export const updateLocationBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

/**
 * Identifies ONE municipality-level catalog entry — the pair the shipped
 * catalogs are keyed on. Everything the row needs (its name, and the names and
 * codes of every ancestor) comes from the catalog on the server, never from
 * the caller: that is what makes typos and duplicate spellings structurally
 * impossible. The country is an enum over the catalogs that actually ship, so
 * a country with no catalog is refused by the schema rather than by a lookup.
 */
export const materializeLocationBody = z.object({
  country_code: z.enum(CATALOG_COUNTRIES),
  external_code: z.string().trim().min(1, "A catalog code is required"),
});

export type MaterializeLocationBody = z.infer<typeof materializeLocationBody>;

export const locationRow = z.object({
  id: z.string(),
  name: z.string(),
  // locale -> display-name overrides, e.g. { sv: "Helsingfors" }. Null/absent
  // for the rows (most municipalities, every site) that have no alternate name.
  name_i18n: z.record(z.string(), z.string()).nullable(),
  type: z.enum(Constants.public.Enums.location_type),
  parent_id: z.string().nullable(),
  country_code: z.string().nullable(),
  // The official statistical code (INSEE / Tilastokeskus) on a seeded or
  // materialized row; null on the admin-created sites this API creates, which
  // exist in no national classification.
  external_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
