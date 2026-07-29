import { z } from "zod";
import { Constants } from "@/types";

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

export const locationRow = z.object({
  id: z.string(),
  name: z.string(),
  // locale -> display-name overrides, e.g. { sv: "Helsingfors" }. Null/absent
  // for the rows (most municipalities, every site) that have no alternate name.
  name_i18n: z.record(z.string(), z.string()).nullable(),
  type: z.enum(Constants.public.Enums.location_type),
  parent_id: z.string().nullable(),
  country_code: z.string().nullable(),
  // The official statistical code (INSEE / Tilastokeskus) on a seeded row;
  // null on the admin-created sites this API creates, which exist in no
  // national classification.
  external_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
