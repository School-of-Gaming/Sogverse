"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  GAME_FIGURE_HEIGHT,
  GAME_PLATFORMS,
  gameAccountStatus,
  type GameAccountExternalId,
  type GameAccountStatus,
  type GameFigure,
  type GamePlatform,
} from "./platforms";

/**
 * The figure's fixed box: the platform's height and width, and either the real
 * render or the drawn stand-in inside it.
 *
 * Exported to its sibling rather than to the world. The editable row swaps the
 * *name* for an input and keeps everything else, so the box has to be one piece
 * of markup both use — a second copy of it would be the first thing to drift,
 * and a row whose skin jumps size the moment you click the pencil is precisely
 * the inconsistency this directory exists to remove.
 */
export function GameAvatarBox({
  platform,
  figure,
  username,
  avatarUrl,
  verified,
}: {
  platform: GamePlatform;
  figure: GameFigure;
  /** `null` draws the stand-in. See the row's `avatarUrl` for the three meanings. */
  username: string | null;
  avatarUrl?: string | null;
  /**
   * Whether the platform has confirmed this name belongs to a real account.
   * **Gates derivation only** — an explicitly handed-in URL is always drawn,
   * because whoever resolved it knows what they resolved.
   */
  verified: boolean;
}) {
  const model = GAME_PLATFORMS[platform].avatar[figure];

  // A render that fails to load falls back to the drawn figure rather than
  // leaving an empty box. Keyed by url so a later, working src gets its own
  // attempt instead of inheriting the previous one's failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Omitted means "let the platform decide"; an explicit `null` means "draw the
  // placeholder". Distinguishing the two is what lets one prop serve a live
  // Minecraft row and a fixture on the same component.
  //
  // **Derivation additionally requires a confirmed account.** The skin host
  // resolves by *name*, and an unverified string is only a name somebody typed —
  // so deriving from it would quietly draw whichever stranger happens to own
  // that name beside a child's. A confirmed account is the evidence that the two
  // are the same person; without it the row keeps the drawn stand-in.
  const resolvedUrl =
    avatarUrl !== undefined
      ? avatarUrl
      : verified && username !== null && model.urlFromUsername !== null
        ? model.urlFromUsername(username)
        : null;

  const showImage =
    username !== null && resolvedUrl !== null && resolvedUrl !== failedUrl;

  const { Placeholder } = model;

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-sm bg-muted",
        GAME_FIGURE_HEIGHT[figure],
        model.widthClass,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a third-party skin/avatar render on an external host; next/image would proxy a 60px thumbnail for no gain, and a Roblox URL is short-lived so an optimizer cache would be working against us
        <img
          src={resolvedUrl}
          alt=""
          aria-hidden
          onError={() => setFailedUrl(resolvedUrl)}
          // `object-contain`: the box already matches the render's proportion,
          // so the figure fits it whole.
          className="h-full w-full object-contain"
        />
      ) : (
        <Placeholder />
      )}
    </div>
  );
}

interface GameUsernameRowProps {
  /** Which platform this identity is on. Everything platform-shaped is read from its descriptor. */
  platform: GamePlatform;
  /** The username, or `null` when the child has never given one. */
  username: string | null;
  /**
   * The platform's account key, when a lookup ever confirmed one. **Presence is
   * the whole of "verified"** — nothing reads the value — so most callers hand
   * over the two columns they already hold and never think about status at all.
   */
  externalId?: GameAccountExternalId | null;
  /**
   * A status that overrides the one derived from the account. For a lookup that
   * really is in flight; everything else leaves it off. A caller reaching for
   * this to *assert* verified is describing an account, and should pass the key.
   */
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
  /**
   * How much of the character to draw, and therefore how tall the row is.
   * `"full"` (default) is the whole body or bust; `"head"` is the compact face,
   * for a dense list where the full figure crowds out what the list is about.
   * A caller passing `avatarUrl` must pass the render matching this.
   */
  figure?: GameFigure;
  className?: string;
}

/**
 * A child's identity on one game platform, read-only: their figure, their
 * username, and a status slot that never changes size.
 *
 * **One row shape, and this is it.** Viewing, capturing for the first time and
 * editing are the same three boxes at the same height — figure, name, status —
 * because they are the same fact being shown, and a surface that met the
 * identity as a tall input-plus-button form and then as a compact row would be
 * showing two things. The editable sibling swaps the middle box for an input and
 * changes nothing else.
 *
 * **The geometry is the feature.** Validating a username is an async round trip,
 * and the obvious implementation — show a spinner while it runs, swap in a tick
 * or a cross when it lands — moves everything to the right of it twice per
 * check. In a roster of eight, mid-session, that is eight rows twitching while a
 * game educator is trying to click one of them. So the figure is a fixed box,
 * the status is a fixed square, and the username is the only thing between them
 * that flexes; every one of the four states renders at exactly the same size.
 *
 * **One height, and there is no other.** No size variant, on either platform, in
 * any state. Only the box's *width* is the platform's to set, and only because
 * the render's proportion is: 1:2 for a Minecraft body, 1:1 for a Roblox bust.
 *
 * **The status is announced, not only drawn.** Each icon is decorative and the
 * state travels to assistive tech through a polite live region, so a check
 * completing is heard once rather than re-read as part of the row.
 */
export function GameUsernameRow({
  platform,
  username,
  externalId = null,
  status,
  avatarUrl,
  figure = "full",
  className,
}: GameUsernameRowProps) {
  const t = useTranslations("gameAccount");

  // A missing username *is* the unknown state, so the two cannot disagree: a
  // caller that passes no name gets the unknown rendering whatever it claims in
  // `status`, rather than a row asserting a confirmed account for a name that
  // isn't there. Resolved once, here, so every slot below reads the same answer
  // — deriving it per slot is how the tick once survived a null username.
  const resolved: GameAccountStatus =
    username === null
      ? "unknown"
      : (status ?? gameAccountStatus(username, externalId));
  const unknown = resolved === "unknown";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        GAME_FIGURE_HEIGHT[figure],
        className,
      )}
    >
      {/* The figure obeys `resolved` like every other slot: an unknown row shows
          the placeholder even if a caller handed it a real URL, because a face
          beside "(Unknown)" claims an identity the row is denying. */}
      <GameAvatarBox
        platform={platform}
        figure={figure}
        username={unknown ? null : username}
        avatarUrl={avatarUrl}
        verified={resolved === "verified"}
      />

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs leading-tight",
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
          tick simply absent rather than a glyph of its own. The missing tick
          beside a name that carries one elsewhere is the signal; a second glyph
          would read as its own kind of failure. */}
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
