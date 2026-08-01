"use client";

import { Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Where a username is in its journey through Mojang's lookup.
 *
 * `idle` is not "unknown" — it is the resting state of a name nobody has asked
 * about since the page loaded, which is most names most of the time.
 */
export type MinecraftCheckStatus = "idle" | "checking" | "valid" | "invalid";

interface MinecraftUsernameRowProps {
  /** The username, or `null` when the child has never given one. */
  username: string | null;
  /** Where the lookup has got to. Defaults to `idle`. */
  status?: MinecraftCheckStatus;
  /**
   * The skin render's URL. `null` (the default) draws the bundled placeholder
   * figure instead, which is what every fixture-driven surface uses — a preview
   * scene must not reach a third-party host on load.
   *
   * **Promotion wires two things here**, and they are separate jobs: this prop
   * takes the live skin source (the app already renders skins from
   * `mc-heads.net`, which the CSP's `img-src` already allows — the *body* path,
   * which is what the crop below assumes), and the caller drives `status` from
   * the real Mojang check behind `GET /api/minecraft/verify`, which already
   * exists, is already public, and already returns the canonical casing plus the
   * account UUID.
   */
  skinUrl?: string | null;
  /**
   * `"bust"` (default) crops the figure to a small fixed square — head and
   * shoulders, the size a roster row can afford. `"full"` renders the whole
   * body, for a surface with room to spend on it.
   */
  size?: "bust" | "full";
  className?: string;
}

/**
 * A child's Minecraft identity as one row: their skin, their username, and a
 * status slot that never changes size.
 *
 * **The geometry is the feature.** Validating a username is an async round trip
 * to Mojang, and the obvious implementation — show a spinner while it runs, swap
 * in a tick or a cross when it lands — moves everything to the right of it twice
 * per check. In a roster of eight, mid-session, that is eight rows twitching
 * while a gedu is trying to click one of them. So the skin is a fixed square, the
 * status is a fixed square, and the username is the only thing between them that
 * flexes; every one of the four states renders at exactly the same size, and the
 * row is the same height before, during and after a check.
 *
 * **The skin is cropped, not re-rendered.** The existing skin source hands back a
 * full-body figure, which is a tall portrait and far too much vertical space for
 * a list row. Rather than introduce a second asset pipeline for heads, the same
 * image is cropped to its top by the box around it — `object-cover` on a square
 * with the position pinned to the top edge. One asset, two presentations, and the
 * `full` variant is the very same image with the crop taken off.
 *
 * **The status is announced, not only drawn.** Each icon is decorative and the
 * state travels to assistive tech through a polite live region, so a check
 * completing is heard once rather than re-read as part of the row.
 */
export function MinecraftUsernameRow({
  username,
  status = "idle",
  skinUrl = null,
  size = "bust",
  className,
}: MinecraftUsernameRowProps) {
  const t = useTranslations("minecraft");
  const full = size === "full";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        full && "items-start",
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-sm bg-muted",
          full ? "h-16 w-8" : "h-7 w-7",
        )}
      >
        {skinUrl === null ? (
          <PlaceholderSkin />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a third-party skin render on an external host; next/image would proxy it for no gain on a 32px avatar, and the crop below needs the raw element
          <img
            src={skinUrl}
            alt=""
            aria-hidden
            // `object-top` is what turns a full-body render into a bust: the
            // square box crops everything below the shoulders.
            className={cn(
              "h-full w-full",
              full ? "object-contain" : "object-cover object-top",
            )}
          />
        )}
      </div>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px] leading-tight",
          username === null && "text-muted-foreground",
          status === "valid" && "text-success",
          status === "invalid" && "text-destructive",
        )}
      >
        {username ?? t("none")}
      </span>

      {/* The fixed slot. It occupies its square in every state, including the
          one that draws nothing, so a check landing cannot move the row. */}
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center"
      >
        {status === "checking" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {status === "valid" && <Check className="h-3.5 w-3.5 text-success" />}
        {status === "invalid" && <X className="h-3.5 w-3.5 text-destructive" />}
      </span>

      {/* The state travels to assistive tech as words, once, rather than being
          re-read as part of the row every time the icon changes. Empty until
          there is something to say, so eight resting rows announce nothing. */}
      <span aria-live="polite" className="sr-only">
        {username === null || status === "idle"
          ? ""
          : status === "checking"
            ? t("verifying")
            : status === "valid"
              ? t("verifiedUser", { username })
              : t("notFound")}
      </span>
    </div>
  );
}

/**
 * The bundled stand-in figure, drawn rather than fetched.
 *
 * A preview scene must not make a network call on load, and a data-URI PNG of
 * somebody's skin would be both a fixed size and a fixed palette. An inline SVG
 * costs nothing, scales to either variant, and is drawn in the current text
 * colour so it themes with everything around it. Its 16×32 grid is the same
 * proportion the real full-body render comes back at, which is what lets the
 * crop above behave identically against a placeholder and against a real skin.
 */
function PlaceholderSkin() {
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
