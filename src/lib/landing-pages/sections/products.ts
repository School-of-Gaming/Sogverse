import { z } from "zod";
import { landingId, plainText, type LandingSectionDefinition } from "./shared";

/**
 * Hand-picked shop products, each drawn as the shop's own card in a carousel,
 * in the order the admin picked them.
 *
 * **The picks are structure, never words**: a product is the same product in
 * every language, so its id sits in the page's structure beside the other
 * sections' pictures and buttons. At least one, and no upper bound — the
 * carousel scrolls, and how many is reasonable is the admin's call. A product
 * named twice is refused, since it would only be drawn twice.
 *
 * **Its words are an optional eyebrow, heading and intro**, the same header
 * every other section with a heading takes, and none of them is required: a
 * card says everything a pick needs, live — its name, schedule, ages, price,
 * seats and registration state — so this section never makes a version
 * incomplete. The SQL half of the required-text rule (`landing_version_missing`)
 * names the type with no required words too, and the DB test holds the two
 * halves to the same answer.
 *
 * **A pick goes stale; the section does not break.** Whether a picked product
 * still exists is checked when a structure naming it is saved — the database
 * refuses an id no product has. Whether the shop still lists it is asked on
 * every render: a pick that has ended, been unlisted, or is not a product the
 * shop sells is simply not drawn, and a section with none listed is not drawn
 * at all. The admin's status page and the MCP read tools say which picks are
 * hidden and why, so next term's product can be swapped in.
 */
const section = z
  .object({
    id: landingId,
    type: z.literal("products"),
    productIds: z
      .array(landingId)
      .min(1, "A products section picks at least one product")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "A products section names each product once",
      ),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    intro: plainText,
  })
  .strict();

export const productsSection = {
  type: "products",
  label: "Products",
  section,
  text,
  missingText: () => [],
  markdownFields: [],
} as const satisfies LandingSectionDefinition<"products", typeof section, typeof text>;
