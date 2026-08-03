"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  GAME_PLATFORMS,
  GAME_ROW_HEIGHT,
  type GameAccountStatus,
  type GamePlatform,
} from "./platforms";

interface GameUsernameRowProps {
  /** Which platform this identity is on. Everything platform-shaped is read from its descriptor. */
  platform: GamePlatform;
  /** The username, or `null` when the child has never given one. */
  username: string | null;
  /** What we hold about this identity. Defaults to `unknown`. */
  status?: GameAccountStatus;
  /**
   * The render's URL, and it has **three** meanings, not two:
   *
   * - a string — draw this. What a Roblox caller passes, because a Roblox avatar
   *   can only be resolved server-side and has to be handed in.
   * - `null` — draw the bundled placeholder, and do not go looking. What every
   *   fixture-driven surface passes: a preview scene must not reach a
   *   third-party host on load.
   * - omitted — let the platform decide. On a platform whose image host is
   *   addressable by username (Minecraft) that derives a URL and draws the real
   *   skin; on one that is not (Roblox) it is the placeholder.
   *
   * The omitted case is the one worth reading twice: leaving the prop off a
   * Minecraft row **is** a network request. That is the right default for a live
   * surface and the wrong one for a fixture, so a fixture passes `null`.
   */
  avatarUrl?: string | null;
  className?: string;
}

/**
 * A child's identity on one game platform as one row: their figure, their
 * username, and a status slot that never changes size.
 *
 * **The geometry is the feature.** Validating a username is an async round trip,
 * and the obvious implementation — show a spinner while it runs, swap in a tick
 * or a cross when it lands — moves everything to the right of it twice per
 * check. In a roster of eight, mid-session, that is eight rows twitching while a
 * game educator is trying to click one of them. So the figure is a fixed box,
 * the status is a fixed square, and the username is the only thing between them
 * that flexes; every one of the four states renders at exactly the same size,
 * and the row is the same height before, during and after a check.
 *
 * **One height, and there is no other.** The row has no size variant, on either
 * platform, in any state — a game identity is one thing that renders one way,
 * and the moment it can be two heights a surface has to choose, two surfaces
 * choose differently, and the component that exists to stop rows twitching
 * starts contributing its own inconsistency. Only the box's *width* is the
 * platform's to set, and only because the render's proportion is: 1:2 for a
 * Minecraft body, 1:1 for a Roblox bust. `object-contain` then fits the whole
 * image inside it, so a source that ever came back at a different ratio
 * letterboxes rather than silently losing a child's feet or face.
 *
 * **The status is announced, not only drawn.** Each icon is decorative and the
 * state travels to assistive tech through a polite live region, so a check
 * completing is heard once rather than re-read as part of the row.
 */
export function GameUsernameRow({
  platform,
  username,
  status = "unknown",
  avatarUrl,
  className,
}: GameUsernameRowProps) {
  const t = useTranslations("gameAccount");
  const descriptor = GAME_PLATFORMS[platform];

  // A missing username *is* the unknown state, so the two cannot disagree: a
  // caller that passes no name gets the unknown rendering whatever it claims in
  // `status`, rather than a row asserting a confirmed account for a name that
  // isn't there. Resolved once, here, so every slot below reads the same answer
  // — deriving it per slot is how the tick once survived a null username.
  const resolved: GameAccountStatus = username === null ? "unknown" : status;
  const unknown = resolved === "unknown";

  // A render that fails to load falls back to the drawn figure rather than
  // leaving an empty box. Keyed by url so a later, working src gets its own
  // attempt instead of inheriting the previous one's failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Omitted means "let the platform decide"; an explicit `null` means "draw the
  // placeholder". Distinguishing the two is what lets one prop serve a live
  // Minecraft row and a fixture on the same component.
  const resolvedUrl =
    avatarUrl !== undefined
      ? avatarUrl
      : username !== null && descriptor.avatar.urlFromUsername !== null
        ? descriptor.avatar.urlFromUsername(username)
        : null;

  // The figure obeys `resolved` like every other slot: an unknown row shows the
  // placeholder even if a caller handed it a real URL, because a face beside
  // "(Unknown)" claims an identity the row is simultaneously denying.
  const showImage = !unknown && resolvedUrl !== null && resolvedUrl !== failedUrl;

  const { Placeholder } = descriptor.avatar;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        GAME_ROW_HEIGHT,
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-sm bg-muted",
          GAME_ROW_HEIGHT,
          descriptor.avatar.widthClass,
        )}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a third-party skin/avatar render on an external host; next/image would proxy a 48px thumbnail for no gain, and a Roblox URL is short-lived so an optimizer cache would be working against us
          <img
            src={resolvedUrl}
            alt=""
            aria-hidden
            onError={() => setFailedUrl(resolvedUrl)}
            // `object-contain`: the box already matches the render's
            // proportion, so the figure fits it whole.
            className="h-full w-full object-contain"
          />
        ) : (
          <Placeholder />
        )}
      </div>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px] leading-tight",
          unknown && "text-muted-foreground",
          resolved === "unverified" && "text-warning",
          resolved === "verified" && "text-success",
        )}
      >
        {unknown ? t("none") : username}
      </span>

      {/* The fixed slot. It occupies its square in every state, including the
          one that draws nothing, so a check landing cannot move the row.

          `unverified` deliberately draws nothing here. It takes the house
          treatment for a saved-but-unconfirmed game account — amber, with the
          tick simply absent rather than a glyph of its own — which is also what
          the badge form renders, so the two agree about one account. The missing
          tick beside a name that carries one elsewhere is the signal; a second
          glyph would read as its own kind of failure. */}
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center"
      >
        {resolved === "checking" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {resolved === "verified" && <Check className="h-3.5 w-3.5 text-success" />}
      </span>

      {/* The state travels to assistive tech as words, once, rather than being
          re-read as part of the row every time the icon changes. Empty until
          there is something to say, so eight resting rows announce nothing.

          Narrowed on `username` itself rather than on `unknown`: the two say the
          same thing, but only this form proves it to the compiler, and the
          announcement is the one place that interpolates the name. */}
      <span aria-live="polite" className="sr-only">
        {username === null || resolved === "unknown"
          ? ""
          : resolved === "checking"
            ? t("verifying")
            : resolved === "verified"
              ? t("verifiedUser", { username })
              : t("unverified", { username })}
      </span>
    </div>
  );
}
