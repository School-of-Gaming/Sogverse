import { z } from "zod";
import {
  distinctIds,
  entryOf,
  isWritten,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * The icons a point may carry: lucide icons, by their kebab-case name, chosen
 * from this list and never uploaded. The renderer maps each name to its
 * component, exhaustively, so a name added here fails type-check there until
 * it is drawn.
 */
export const LANDING_ICONS = [
  "sparkles",
  "star",
  "heart",
  "shield-check",
  "users",
  "gamepad-2",
  "graduation-cap",
  "book-open",
  "map-pin",
  "calendar",
  "clock",
  "trophy",
  "rocket",
  "lightbulb",
  "message-circle",
  "smile",
  "puzzle",
  "globe",
  "laptop",
  "circle-check",
  "palette",
  "handshake",
  "target",
  "leaf",
] as const;

export type LandingIcon = (typeof LANDING_ICONS)[number];

/** Two to six points, each an icon with a title and a short body. */
const section = z
  .object({
    id: landingId,
    type: z.literal("points"),
    items: z
      .array(z.object({ id: landingId, icon: z.enum(LANDING_ICONS) }).strict())
      .min(2, "A points section has at least two points")
      .max(6, "A points section has at most six points")
      .refine(distinctIds, "Two points share an id"),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    intro: plainText,
    /** Each point's words, by the point's id. */
    items: z
      .record(z.string(), z.object({ title: plainText, body: plainText }).strict())
      .optional(),
  })
  .strict();

export const pointsSection = {
  type: "points",
  label: "Points",
  section,
  text,
  missingText: (block, words) => [
    ...(isWritten(words.heading) ? [] : ["heading"]),
    ...block.items.flatMap((item) => {
      const entry = entryOf(words.items, item.id);
      return [
        ...(isWritten(entry.title) ? [] : [`items.${item.id}.title`]),
        ...(isWritten(entry.body) ? [] : [`items.${item.id}.body`]),
      ];
    }),
  ],
} as const satisfies LandingSectionDefinition<"points", typeof section, typeof text>;
