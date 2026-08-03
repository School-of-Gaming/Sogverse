"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * What we hold about a child's Roblox identity. **Four states, and they are a
 * total function of the account** — whether a username is saved, and whether a
 * lookup ever returned an account id for it — plus the moment a lookup is in
 * flight.
 *
 * Every one of the four survives a reload, because each is a fact about the
 * account rather than about this render. That is the property an earlier shape
 * of this type lacked: it carried an `idle` ("nobody has asked yet") and an
 * `invalid` ("Roblox said no such account"), and neither is a state an account
 * can be *in*. `idle` described the component's own lifecycle and evaporated on
 * refresh; `invalid` described the outcome of one lookup. A name that failed a
 * lookup and a name nobody ever looked up are the same thing to anyone reading a
 * roster — **not verified** — and the surface that ran the lookup is the one
 * that should say why, in its own error copy, rather than encoding a transient
 * verdict here.
 */
export type RobloxCheckStatus =
  /** No username saved — we don't know. */
  | "unknown"
  /** A username, but no account id was ever obtained. */
  | "unverified"
  /** A username and a confirmed account id. */
  | "verified"
  /** A lookup is in flight. */
  | "checking";

interface RobloxUsernameRowProps {
  /** The username, or `null` when the child has never given one. */
  username: string | null;
  /** What we hold about this identity. Defaults to `unknown`. */
  status?: RobloxCheckStatus;
  /**
   * The avatar render's URL. `null` (the default) draws the bundled placeholder
   * figure instead, which is what every fixture-driven surface uses — a preview
   * scene must not reach a third-party host on load.
   *
   * The URL comes from `GET /api/roblox/verify`, which resolves it server-side
   * alongside the account. It is **short-lived-resolvable, never a value to
   * persist**: the thumbnail JSON is `no-cache` upstream even though the CDN URL
   * it names is immutable, and Roblox has no username-addressable image endpoint
   * to fall back on if a stored one goes stale.
   */
  avatarUrl?: string | null;
  /**
   * How much room the figure gets. Both show the same bust render, so this is a
   * scale, not a crop: `"row"` (default) is 48px square, sized to sit in a list
   * row beside a name, and `"full"` is a third bigger for a surface with room to
   * spend on it.
   */
  size?: "row" | "full";
  className?: string;
}

/**
 * A child's Roblox identity as one row: their avatar, their username, and a
 * status slot that never changes size.
 *
 * **The geometry is the feature.** Validating a username is an async round trip,
 * and the obvious implementation — show a spinner while it runs, swap in a tick
 * or a cross when it lands — moves everything to the right of it twice per
 * check. In a roster of eight, mid-session, that is eight rows twitching while a
 * game educator is trying to click one of them. So the avatar is a fixed square,
 * the status is a fixed square, and the username is the only thing between them
 * that flexes; every one of the four states renders at exactly the same size,
 * and the row is the same height before, during and after a check.
 *
 * **The box is square, and the render is the bust.** This is where the Roblox
 * row parts company with its Minecraft sibling, which draws a full body at 1:2
 * and argues that a skin is a costume whose chosen half is below the shoulders.
 * That argument cannot survive a square frame: Roblox thumbnails are 1:1 and the
 * API refuses any non-square size, and inside that frame the full-body variant
 * puts the figure at ~27% of the frame and ~40% of its width — a small person
 * adrift in transparent padding. The bust fills 88% of the frame and 98% of its
 * width, so the same box shows a face instead of a speck. The nice property of
 * the Minecraft pattern survives intact: `full` is the very same asset drawn
 * larger, not a second picture from a second pipeline.
 *
 * **The status is announced, not only drawn.** Each icon is decorative and the
 * state travels to assistive tech through a polite live region, so a check
 * completing is heard once rather than re-read as part of the row.
 */
export function RobloxUsernameRow({
  username,
  status = "unknown",
  avatarUrl = null,
  size = "row",
  className,
}: RobloxUsernameRowProps) {
  const t = useTranslations("roblox.account");
  const full = size === "full";

  // A missing username *is* the unknown state, so the two cannot disagree: a
  // caller that passes no name gets the unknown rendering whatever it claims in
  // `status`, rather than a row asserting a confirmed account for a name that
  // isn't there. Resolved once, here, so every slot below reads the same answer
  // — deriving it per slot is how the tick once survived a null username.
  const resolved: RobloxCheckStatus = username === null ? "unknown" : status;
  const unknown = resolved === "unknown";

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
          // Square in both sizes, because the render is: the taller box simply
          // shows the same bust larger.
          full ? "h-16 w-16" : "h-12 w-12",
        )}
      >
        {avatarUrl === null ? (
          <PlaceholderAvatar />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a third-party avatar render on Roblox's CDN; next/image would proxy a 48px thumbnail for no gain, and the URL is short-lived so an optimizer cache would be working against us
          <img
            src={avatarUrl}
            alt=""
            aria-hidden
            // `object-contain` in both sizes: the box already matches the
            // render's 1:1 proportion, so the bust fits it whole and a source
            // that ever came back at a different ratio letterboxes rather than
            // silently cropping a child's face.
            className="h-full w-full object-contain"
          />
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

          `unverified` deliberately draws nothing here. It is the same treatment
          the standalone badge gives the state on the voice room and the admin
          product page — amber, and the check simply absent — so the two
          components say the same thing about the same account. The missing tick
          beside a name that carries one everywhere else is the signal. */}
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
          there is something to say, so eight resting rows announce nothing. */}
      {/* Narrowed on `username` itself rather than on `unknown`: the two say the
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

/**
 * The bundled stand-in figure, drawn rather than fetched.
 *
 * A preview scene must not make a network call on load, and a data-URI PNG of
 * somebody's avatar would be both a fixed size and a fixed palette. An inline
 * SVG costs nothing, scales to either variant, and is drawn in the current text
 * colour so it themes with everything around it. Its 1:1 grid, and the bust
 * framing on it, are the same shape the real render comes back at — which is
 * what lets the box above behave identically against a placeholder and against
 * a real avatar.
 */
function PlaceholderAvatar() {
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
