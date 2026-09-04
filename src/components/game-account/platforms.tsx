"use client";

import type { ReactElement } from "react";
import { minecraftSkinBodyUrl, minecraftSkinFaceUrl } from "@/lib/mojang";
import {
  GAME_PLATFORM_NAMES,
  type GamePlatform,
} from "@/lib/constants/game-platforms";
import { useVerifyMinecraft } from "@/services/minecraft";
import { useVerifyRoblox } from "@/services/roblox";

/**
 * One game identity, any platform.
 *
 * Everything a platform does differently lives in a **descriptor** here, and the
 * components in this directory are generic and render from it. The alternative —
 * the one this replaces — was a hand-forked component tree per platform, three
 * files each, which had already drifted: the two rows disagreed about the status
 * vocabulary, and only one of the two fields had the stale-response guard.
 *
 * The differences are real and they are not going to stop arriving. Each
 * platform has its own rule about what its API hands back, whether a skin or
 * avatar can be pulled at all, at what proportion, and at which sizes. A
 * descriptor is where that belongs. It is also why every component here takes a
 * **single** platform rather than a list: a surface may well end up showing only
 * the identity that matters for the product in front of the child, and composing
 * several platforms is the caller's business, not the component's.
 */

/**
 * Re-exported rather than declared, so the registry below and the zod schemas on
 * the wire cannot disagree about what a platform is. The tuple itself lives in a
 * React-free module — an API route has to name a platform too, and it cannot
 * import this one.
 */
export type { GamePlatform };

/**
 * What we hold about a child's identity on one platform. **Four states, and they
 * are a total function of the account** — whether a username is saved, and
 * whether a lookup ever returned an account id for it — plus the moment a lookup
 * is in flight.
 *
 * Every one of the four survives a reload, because each is a fact about the
 * account rather than about this render. That is the property the older
 * Minecraft vocabulary lacked: it carried an `idle` ("nobody has asked yet") and
 * an `invalid` ("the platform said no such account"), and neither is a state an
 * account can be *in*. `idle` described the component's own lifecycle and
 * evaporated on refresh; `invalid` described the outcome of one lookup. A name
 * that failed a lookup and a name nobody ever looked up are the same thing to
 * anyone reading a roster — **not verified** — and the surface that ran the
 * lookup is the one that should say why, in its own error copy, rather than
 * encoding a transient verdict here.
 */
export type GameAccountStatus =
  /** No username saved — we don't know. */
  | "unknown"
  /** A username, but no account id was ever obtained. */
  | "unverified"
  /** A username and a confirmed account id. */
  | "verified"
  /** A lookup is in flight. */
  | "checking";

/**
 * How much of the character the row draws.
 *
 * **One knob, two values, and it is a density choice rather than a size knob.**
 * `full` is the whole character — a Minecraft body, a Roblox bust — for a surface
 * with room to spend on it. `head` is the face alone, for a dense list where a
 * 60px figure crowds out the thing the list is actually about; it exists because
 * `full` was measurably too tall in the voice room and the admin detail line, not
 * because a caller might fancy something smaller.
 *
 * **In `head` mode both platforms have identical geometry**, which is the quiet
 * win: a Minecraft face render and a Roblox headshot are both square, so the
 * 1:2-vs-1:1 divergence that forces `full`'s box to differ per platform simply
 * does not exist here.
 *
 * Anything beyond these two is the size-variant sprawl this directory removed
 * once already. A third value needs a surface that measurably needs it.
 */
export type GameFigure = "full" | "head";

/**
 * **The height of a game account, per figure. Every one of them, everywhere.**
 *
 * Within a figure there is no size variant, on any component here: a game
 * identity renders one way, and the moment one figure can be two heights a
 * surface has to choose, two surfaces choose differently, and a component that
 * exists to stop rows twitching starts contributing its own inconsistency.
 *
 * 60px and 32px, on Tailwind's default `--spacing` of 0.25rem. Every figure width
 * in the registry below is derived from its height and its platform's proportion,
 * so changing a number here is the whole change — but the widths are literal
 * classes the Tailwind scanner has to see, so they are recomputed by hand rather
 * than by `calc`.
 */
const FIGURE_HEIGHT: Readonly<Record<GameFigure, string>> = {
  full: "h-15",
  head: "h-8",
};

/**
 * The height class for a figure.
 *
 * **A function rather than the record itself, and that is a guard rather than a
 * taste.** `cn()` takes an object as a conditional-class map, so handing it the
 * record whole type-checks and then silently emits `full head` as class names
 * with no height at all — which is exactly what happened once, in a roster row
 * whose comment claimed it pinned the height. A function is not a `ClassValue`,
 * so the same slip is now a compile error instead of a layout bug nobody sees.
 */
export function gameFigureHeight(figure: GameFigure): string {
  return FIGURE_HEIGHT[figure];
}

/**
 * The platform's own key for an account.
 *
 * Deliberately a union rather than a string both platforms are squeezed into:
 * Mojang's is a dashed UUID and Roblox's is a positive integer, and pretending
 * they share a value space is how one ends up stringified into a column typed
 * for the other. Nothing here does arithmetic or string work on it — the only
 * question ever asked of it is whether it is present, because **presence is what
 * "verified" means**.
 */
export type GameAccountExternalId = string | number;

/**
 * A verification result, normalised across platforms.
 *
 * The two lookups answer with different shapes (Mojang: canonical name + UUID;
 * Roblox: canonical name + numeric id + display name + a resolved avatar URL),
 * and this is the one shape the generic field consumes.
 */
export interface VerifiedGameAccount {
  /** The canonical casing, as the platform spells it. */
  username: string;
  /** The account key the lookup confirmed. */
  externalId: GameAccountExternalId;
  /**
   * One render per figure, so a caller hands the row the picture that matches the
   * figure it is drawing. `null` where the platform has none to give.
   * **Short-lived-resolvable, never a value to persist** on the platforms that
   * hand back a CDN URL — the JSON naming it is `no-cache` upstream.
   */
  figureUrls: Readonly<Record<GameFigure, string | null>>;
  /**
   * What other players see in-game, when the platform has such a name *and* it
   * differs from the handle. `null` on a platform where the handle is the only
   * name there is, and `null` when the two happen to match — in both cases
   * there is no second line worth drawing.
   *
   * Never shown *instead* of the handle: the handle is the unique one, so it is
   * what identifies an account.
   */
  displayName: string | null;
}

/** How one figure of one platform is sourced and drawn. */
export interface GameFigureModel {
  /**
   * How wide this figure's box is, as a Tailwind class. **The height is not the
   * platform's to choose** — it is `GAME_FIGURE_HEIGHT[figure]` — so width is the
   * one dimension a descriptor gets a say in, and it says only what the render's
   * own proportion is. A Minecraft body comes back at 1:2 and a Roblox bust at
   * 1:1, so `full` differs; both platforms' heads are square, so `head` does not.
   * The box is drawn at the render's proportion so `object-contain` fits the
   * figure whole; a shared width would crop one platform or letterbox the other.
   */
  widthClass: string;
  /**
   * Derives this figure's render URL from a username, on the platforms whose
   * image host is addressable by name, and `null` where it is not.
   *
   * This is the sharpest divergence between the two. Minecraft skins hang off a
   * host that takes the username straight in an `<img src>` — for the body and
   * for the face alike — so a row holding a name already holds everything it
   * needs. Roblox has no such endpoint (the legacy direct-image routes 404), so
   * either render costs two server hops behind a rate limit that a serverless
   * fleet shares per IP, and has to be handed *in* by whoever already resolved
   * it. That is why this is `null` for both Roblox figures.
   */
  urlFromUsername: ((username: string) => string) | null;
  /**
   * The bundled stand-in figure, **drawn rather than fetched**.
   *
   * A preview or style-guide surface must not reach a third-party host on load,
   * and a data-URI PNG would be both a fixed size and a fixed palette. An inline
   * SVG costs nothing and is drawn in the current text colour so it themes with
   * everything around it. Each one is on the same grid its platform's real
   * render comes back at, which is what lets the box behave identically against
   * a placeholder and against a real image.
   */
  Placeholder: () => ReactElement;
}

/** Both figures of one platform. */
export type GameAvatarModel = Readonly<Record<GameFigure, GameFigureModel>>;

/** Everything one platform does differently, in one object. */
export interface GamePlatformDescriptor {
  platform: GamePlatform;
  /**
   * The brand name, interpolated into the translated copy. **Not translated
   * itself** — "Minecraft" is "Minecraft" in every locale; the locales own the
   * words around it.
   */
  name: string;
  /**
   * A real handle on the platform, for the input's example placeholder.
   *
   * **An example, and nothing more.** There is deliberately no username *rule*
   * on this descriptor: a platform is the only authority on which of its own
   * names exist, so a typed name is sent to that platform and its answer is what
   * decides. A regex here would only be us guessing, and both platforms carry
   * live accounts our guesses called impossible.
   */
  usernameExample: string;
  avatar: GameAvatarModel;
}

/**
 * The Minecraft figure: a whole body on a 16×32 grid.
 *
 * Whole, not a head, and that is deliberate — a Minecraft skin is a *costume*,
 * and the half of it a child has actually chosen (the jacket, the tail, the
 * boots) is below the shoulders.
 */
function MinecraftBodyPlaceholder() {
  return (
    <svg
      viewBox="0 0 16 32"
      className="h-full w-full text-muted-foreground"
      aria-hidden
      focusable="false"
    >
      {/* Head */}
      <rect x="4" y="0" width="8" height="8" fill="currentColor" opacity="0.5" />
      <rect x="5" y="3" width="2" height="2" fill="currentColor" />
      <rect x="9" y="3" width="2" height="2" fill="currentColor" />
      {/* Torso and arms */}
      <rect x="4" y="8" width="8" height="12" fill="currentColor" opacity="0.35" />
      <rect x="1" y="8" width="3" height="12" fill="currentColor" opacity="0.5" />
      <rect x="12" y="8" width="3" height="12" fill="currentColor" opacity="0.5" />
      {/* Legs */}
      <rect x="4" y="20" width="3.5" height="12" fill="currentColor" opacity="0.3" />
      <rect x="8.5" y="20" width="3.5" height="12" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

/**
 * The Roblox figure: a bust on a 1:1 grid.
 *
 * The whole-body argument cannot survive a square frame. Roblox thumbnails are
 * 1:1 and the API refuses any other size, and inside that frame the full-body
 * variant draws the figure at about 27% of the frame and 40% of its width — a
 * small person adrift in transparent padding. The bust fills 88% and 98%, so the
 * same box shows a face instead of a speck.
 */
function RobloxBustPlaceholder() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-full w-full text-muted-foreground"
      aria-hidden
      focusable="false"
    >
      {/* Head */}
      <rect x="3.5" y="1" width="9" height="9" fill="currentColor" opacity="0.5" />
      <rect x="5.5" y="4.5" width="1.8" height="2" fill="currentColor" />
      <rect x="8.7" y="4.5" width="1.8" height="2" fill="currentColor" />
      {/* Torso and shoulders — the part of the body the bust crop keeps */}
      <rect x="4" y="11" width="8" height="5" fill="currentColor" opacity="0.35" />
      <rect x="0.5" y="11" width="3" height="5" fill="currentColor" opacity="0.5" />
      <rect x="12.5" y="11" width="3" height="5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/**
 * **The head stand-ins are drawn harder than the full-figure ones, deliberately.**
 *
 * They are the same colour on the same box — `muted-foreground` over `muted` —
 * but a quarter of the area, and contrast that reads fine across 60px of body
 * reads as an empty tinted square across 32px. The first version used the full
 * figures' opacities and was reported as "doesn't show anything": it *was*
 * rendering, it just had no area left to carry a faint step. Smaller marks need
 * more contrast to say the same thing, so the silhouettes sit around 0.55 and
 * the features are drawn at full strength.
 *
 * If either of these is ever restyled, the thing to preserve is legibility at
 * 32px against `bg-muted`, which sits a step lighter than the page — so a
 * stand-in that leans on the page being darker than the box disappears.
 */

/**
 * The Minecraft face: the 8×8 grid the real flat render is drawn on.
 *
 * Square and edge to edge, because that is what the face endpoint returns — so
 * the box behaves identically against this and against a real face.
 */
function MinecraftFacePlaceholder() {
  return (
    <svg
      viewBox="0 0 8 8"
      className="h-full w-full text-muted-foreground"
      aria-hidden
      focusable="false"
    >
      <rect x="0" y="0" width="8" height="8" fill="currentColor" opacity="0.55" />
      <rect x="1.4" y="2.75" width="1.8" height="1.8" fill="currentColor" />
      <rect x="4.8" y="2.75" width="1.8" height="1.8" fill="currentColor" />
      <rect
        x="2.1"
        y="5.3"
        width="3.8"
        height="1.3"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

/**
 * The Roblox head: the same square frame, drawn the way a Roblox headshot fills
 * it — rounded rather than Minecraft's hard-edged cube, so the compact row still
 * says which platform it is about with no picture and no icon.
 */
function RobloxHeadPlaceholder() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-full w-full text-muted-foreground"
      aria-hidden
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="3.5"
        fill="currentColor"
        opacity="0.55"
      />
      <rect x="3.9" y="5.4" width="2.8" height="3.3" rx="0.8" fill="currentColor" />
      <rect x="9.3" y="5.4" width="2.8" height="3.3" rx="0.8" fill="currentColor" />
      <rect
        x="4.9"
        y="10.8"
        width="6.2"
        height="1.8"
        rx="0.9"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

/** The descriptor registry. One entry per platform, and the only place a platform's quirks are written down. */
export const GAME_PLATFORMS: Readonly<
  Record<GamePlatform, GamePlatformDescriptor>
> = {
  minecraft: {
    platform: "minecraft",
    name: GAME_PLATFORM_NAMES.minecraft,
    usernameExample: "Steve",
    avatar: {
      full: {
        // Half the figure's height — the whole body's own 1:2 proportion.
        widthClass: "w-7.5",
        urlFromUsername: minecraftSkinBodyUrl,
        Placeholder: MinecraftBodyPlaceholder,
      },
      head: {
        // Square, like every head render on every platform.
        widthClass: "w-8",
        urlFromUsername: minecraftSkinFaceUrl,
        Placeholder: MinecraftFacePlaceholder,
      },
    },
  },
  roblox: {
    platform: "roblox",
    name: GAME_PLATFORM_NAMES.roblox,
    usernameExample: "builderman",
    avatar: {
      full: {
        // Square with the figure's height — the bust render's own 1:1 proportion.
        widthClass: "w-15",
        urlFromUsername: null,
        Placeholder: RobloxBustPlaceholder,
      },
      head: {
        widthClass: "w-8",
        urlFromUsername: null,
        Placeholder: RobloxHeadPlaceholder,
      },
    },
  },
};

/**
 * The status an account is in when nothing is in flight.
 *
 * **Derived from the account, never remembered.** A row nobody has touched shows
 * `verified` when a platform id is stored and `unverified` when only a name is,
 * so eight untouched rows are not eight rows claiming a check just ran. A caller
 * that really does have a lookup in flight passes `checking` over the top.
 */
export function gameAccountStatus(
  username: string | null,
  externalId: GameAccountExternalId | null,
): GameAccountStatus {
  if (username === null) return "unknown";
  return externalId === null ? "unverified" : "verified";
}

/**
 * The Roblox account id a generic row is holding, or `null` when there isn't one.
 *
 * Three surfaces render both platforms from one component and each needs to ask
 * the same question before it can resolve a picture: *is this a Roblox row, and
 * has it been verified?* Written out three times it would be three chances to
 * write `externalId as number`, which is exactly the cast that would let a
 * Mojang UUID reach an endpoint expecting an int64. The `typeof` check is what
 * makes the narrowing real rather than asserted, and it doubles as the verified
 * gate: an unverified row has no id, so it gets `null` and keeps its silhouette.
 */
export function robloxAccountId(
  platform: GamePlatform,
  externalId: GameAccountExternalId | null | undefined,
): number | null {
  if (platform !== "roblox") return null;
  return typeof externalId === "number" ? externalId : null;
}

/**
 * Verify a username against its platform, normalised to one result shape.
 *
 * **Both hooks are called on every render, whatever the platform is** — a hook
 * cannot be called conditionally, and a mutation nobody fires costs nothing but
 * the object it returns. Dispatching inside the returned function rather than
 * around the hook calls is what keeps this rule-of-hooks clean.
 */
export function useVerifyGameAccount(
  platform: GamePlatform,
): (username: string) => Promise<VerifiedGameAccount> {
  const verifyMinecraft = useVerifyMinecraft();
  const verifyRoblox = useVerifyRoblox();

  return async (username: string): Promise<VerifiedGameAccount> => {
    if (platform === "minecraft") {
      const profile = await verifyMinecraft.mutateAsync(username);
      return {
        username: profile.username,
        externalId: profile.uuid,
        // Both derivable from the canonical name, so the row gets a real picture
        // out of a lookup that never mentioned one — whichever figure it draws.
        figureUrls: {
          full: minecraftSkinBodyUrl(profile.username),
          head: minecraftSkinFaceUrl(profile.username),
        },
        // Mojang has no second name: the handle is the only one there is.
        displayName: null,
      };
    }

    const profile = await verifyRoblox.mutateAsync(username);
    return {
      username: profile.username,
      externalId: profile.userId,
      // Resolved server-side, both in the one round trip — neither is derivable
      // here, and each degrades to null on its own.
      figureUrls: { full: profile.avatarUrl, head: profile.headshotUrl },
      // A display name identical to the handle is not a second line; it is the
      // same line twice.
      displayName:
        profile.displayName === profile.username ? null : profile.displayName,
    };
  };
}
