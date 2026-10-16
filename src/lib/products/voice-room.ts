import { z } from "zod";
import { Constants, type VoiceRoomMode } from "@/types";

// How a product's sessions are joined, as every Join surface receives it.
//
// An online product picks one of three ways in: the Sogverse voice room (the
// default, and the only one an in-person product may hold), a meeting held on
// another service at a link, or no room at all and join instructions written
// per locale. Each read that draws a Join carries the product's mode and link
// and every translation's instructions; `productVoiceRoom` folds them into the
// one value a surface passes around, so no card re-derives the choice from raw
// columns.
//
// The instructions stay per locale here, never picked: the surface that shows
// them picks the reader's version with `resolveTranslation()`, as it does the
// product's name.

/** The two product-level wire fields, for a read's product shell schema. */
export const voiceRoomWireFields = {
  voice_room_mode: z.enum(Constants.public.Enums.voice_room_mode),
  external_voice_url: z.string().nullable(),
};

/** The per-translation wire field, for a read's translation schema. */
export const voiceJoinInstructionsWireField = {
  voice_join_instructions: z.string().nullable(),
};

/** One locale's join instructions, as plain text the team wrote. */
export interface VoiceJoinInstructions {
  locale: string;
  text: string;
}

/**
 * How this product's sessions are joined.
 *
 * - `sogverse` — the Sogverse group voice room, during the session window.
 * - `external` — the meeting at `url`, on another service. Public by design.
 * - `none` — no room; the reader is shown `instructions` in their locale,
 *   picked with `resolveTranslation()`. Only the locales that have
 *   instructions written are listed; the product writers refuse mode `none`
 *   with none at all, so the list is never empty for real data.
 */
export type ProductVoiceRoom =
  | { mode: "sogverse" }
  | { mode: "external"; url: string }
  | { mode: "none"; instructions: readonly VoiceJoinInstructions[] };

/**
 * Fold a product's voice columns and its translations into a
 * {@link ProductVoiceRoom}.
 *
 * An external mode with no link cannot be stored
 * (`chk_products_external_voice_url_iff_external`), so meeting one throws
 * rather than inventing a destination.
 */
export function productVoiceRoom(
  product: { voice_room_mode: VoiceRoomMode; external_voice_url: string | null },
  translations: readonly {
    locale: string;
    voice_join_instructions: string | null;
  }[],
): ProductVoiceRoom {
  switch (product.voice_room_mode) {
    case "sogverse":
      return { mode: "sogverse" };
    case "external":
      if (product.external_voice_url === null) {
        throw new Error(
          "An external voice room arrived with no link, which a CHECK on products forbids",
        );
      }
      return { mode: "external", url: product.external_voice_url };
    case "none":
      return {
        mode: "none",
        instructions: translations.flatMap((t) =>
          t.voice_join_instructions === null
            ? []
            : [{ locale: t.locale, text: t.voice_join_instructions }],
        ),
      };
  }
}
