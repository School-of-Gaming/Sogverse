"use client";

import type { ReactElement } from "react";
import { Blocks, Pickaxe, type LucideIcon } from "lucide-react";
import { isValidMinecraftUsername } from "@/lib/mojang";
import { isValidRobloxUsername } from "@/lib/roblox";
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

export type GamePlatform = "minecraft" | "roblox";

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
 * The row's two sizes. The same asset at two scales, never two assets and never
 * a crop: `"row"` sits in a list beside a name, `"full"` is a third bigger for a
 * surface with room to spend on it.
 */
export type GameAccountRowSize = "row" | "full";

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
   * A render for the account, or `null` when the platform has none to give.
   * **Short-lived-resolvable, never a value to persist** on the platforms that
   * hand back a CDN URL — the JSON naming it is `no-cache` upstream.
   */
  avatarUrl: string | null;
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

/** How a platform's figure is sourced and drawn. */
export interface GameAvatarModel {
  /**
   * The fixed box the figure occupies, per size, as Tailwind classes.
   *
   * Per-platform because the render's own proportion is: a Minecraft skin comes
   * back as a whole body at 1:2, a Roblox thumbnail is 1:1 and the API refuses
   * any other ratio. The box is drawn at the render's proportion so
   * `object-contain` fits the figure whole — a shared box would have to crop one
   * platform or letterbox the other.
   */
  boxClass: Readonly<Record<GameAccountRowSize, string>>;
  /**
   * Derives a render URL from a username, on the platforms whose image host is
   * addressable by name, and `null` where it is not.
   *
   * This is the sharpest divergence between the two. Minecraft skins hang off a
   * host that takes the username straight in an `<img src>`, so a row holding a
   * name already holds everything it needs. Roblox has no such endpoint — the
   * legacy direct-image routes 404 — so an avatar costs two server hops
   * (username → numeric id → CDN URL) behind a rate limit that a serverless
   * fleet shares per IP. A Roblox avatar therefore has to be handed *in* by
   * whoever already resolved it, which is why this is `null` there.
   */
  urlFromUsername: ((username: string) => string) | null;
  /**
   * The bundled stand-in figure, **drawn rather than fetched**.
   *
   * A preview or style-guide surface must not reach a third-party host on load,
   * and a data-URI PNG would be both a fixed size and a fixed palette. An inline
   * SVG costs nothing, scales to either variant, and is drawn in the current text
   * colour so it themes with everything around it. Each one is on the same grid
   * its platform's real render comes back at, which is what lets the box behave
   * identically against a placeholder and against a real image.
   */
  Placeholder: () => ReactElement;
}

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
   * The glyph that says which platform a line is about, so callers never prefix
   * a `"Minecraft:"` label of their own. Always decorative: the state travels in
   * words through the accessible name.
   */
  Icon: LucideIcon;
  /**
   * The platform's own username rule. Imported from the module that also runs
   * the lookup, so the field and the server agree by construction rather than by
   * two copies of a regex agreeing today.
   */
  isValidUsername: (username: string) => boolean;
  /** A real handle on the platform, for the input's example placeholder. */
  usernameExample: string;
  avatar: GameAvatarModel;
}

/**
 * The Minecraft skin host, addressable by username.
 *
 * `img-src` in the proxy's CSP already allows this host. Encoded even though a
 * valid Minecraft username has nothing to encode — a row renders whatever is
 * stored, and a stored value is not a validated one.
 */
function minecraftSkinUrl(username: string): string {
  return `https://mc-heads.net/body/${encodeURIComponent(username)}`;
}

/**
 * The Minecraft figure: a whole body on a 16×32 grid.
 *
 * Whole, not a head, and that is deliberate — a Minecraft skin is a *costume*,
 * and the half of it a child has actually chosen (the jacket, the tail, the
 * boots) is below the shoulders.
 */
function MinecraftPlaceholder() {
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
function RobloxPlaceholder() {
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

/** The descriptor registry. One entry per platform, and the only place a platform's quirks are written down. */
export const GAME_PLATFORMS: Readonly<
  Record<GamePlatform, GamePlatformDescriptor>
> = {
  minecraft: {
    platform: "minecraft",
    name: "Minecraft",
    Icon: Pickaxe,
    isValidUsername: isValidMinecraftUsername,
    usernameExample: "Steve",
    avatar: {
      // 1:2 in both sizes — the figure's own proportion, so neither crops.
      boxClass: { row: "h-12 w-6", full: "h-16 w-8" },
      urlFromUsername: minecraftSkinUrl,
      Placeholder: MinecraftPlaceholder,
    },
  },
  roblox: {
    platform: "roblox",
    name: "Roblox",
    Icon: Blocks,
    isValidUsername: isValidRobloxUsername,
    usernameExample: "builderman",
    avatar: {
      // 1:1 in both sizes — the taller box shows the same bust larger.
      boxClass: { row: "h-12 w-12", full: "h-16 w-16" },
      urlFromUsername: null,
      Placeholder: RobloxPlaceholder,
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
        // Derivable from the canonical name, so the field gets a real skin out
        // of a lookup that never mentioned one.
        avatarUrl: minecraftSkinUrl(profile.username),
        // Mojang has no second name: the handle is the only one there is.
        displayName: null,
      };
    }

    const profile = await verifyRoblox.mutateAsync(username);
    return {
      username: profile.username,
      externalId: profile.userId,
      avatarUrl: profile.avatarUrl,
      // A display name identical to the handle is not a second line; it is the
      // same line twice.
      displayName:
        profile.displayName === profile.username ? null : profile.displayName,
    };
  };
}
