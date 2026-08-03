"use client";

import { useId, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GameAvatarBox, GameUsernameRow } from "./game-username-row";
import {
  GAME_PLATFORMS,
  GAME_ROW_HEIGHT,
  gameAccountStatus,
  useVerifyGameAccount,
  type GameAccountExternalId,
  type GameAccountStatus,
  type GamePlatform,
  type VerifiedGameAccount,
} from "./platforms";

/**
 * What a commit settled on, handed to the caller to store.
 *
 * One call per commit, at the end, carrying the *outcome* rather than the
 * keystrokes: the canonical username if the lookup confirmed one, the typed name
 * if it did not, and `null` if the field was cleared. `externalId` is present
 * only when the platform confirmed the account, which is the whole of what
 * "verified" means anywhere in this directory.
 */
export interface CommittedGameAccount {
  username: string | null;
  externalId: GameAccountExternalId | null;
  /** Short-lived where a platform returns one; never a value to persist. */
  avatarUrl: string | null;
  /**
   * The in-game display name where the platform has one. Not rendered here — the
   * row has one line and the handle is the identifying one — but reported, so a
   * caller with room of its own can use it.
   */
  displayName: string | null;
}

interface GameUsernameEditableRowProps {
  /** Which platform this identity is on. */
  platform: GamePlatform;
  /** The saved username, or `null` when there is none yet. **Controlled** — see `onCommit`. */
  username: string | null;
  /** The stored account key, when a lookup ever confirmed one. Drives the resting status. */
  externalId?: GameAccountExternalId | null;
  /** Passed through to the figure; the three meanings are documented on the row. */
  avatarUrl?: string | null;
  /**
   * Called once per commit with what the commit settled on. The caller stores it
   * and hands `username`/`externalId` back as props — this component renders the
   * in-flight name itself but does **not** own the committed one.
   */
  onCommit: (account: CommittedGameAccount) => void;
  /**
   * Open in edit mode on mount. What a register-style surface passes, where
   * there is nothing to view yet and the only thing to do is type. A roster
   * leaves it off: eight rows that all open themselves is not a roster.
   */
  autoEdit?: boolean;
  /** Whose account this is, for the pencil's accessible name. Omitted where the answer is "yours". */
  personName?: string;
  className?: string;
}

/**
 * A game identity you can set or change **in the row itself** — the same figure,
 * the same height, the same status square, with the name swapped for an input
 * while you type.
 *
 * This is both first capture and later editing, and that is the point. They used
 * to be two components: a register form got a labelled input, a Verify button
 * beside it and a preview row underneath, while a roster got a compact row with
 * a pencil. Two shapes for one job, and the taller one cost a register form
 * 134px per platform. Now a surface with nothing saved passes `autoEdit` and
 * gets the same row, already open.
 *
 * **Committing is verifying.** There is no Verify button, because a second
 * control asking "is that real?" is a question the commit already asks. Enter
 * (or the tick) closes the editor, the typed name appears in the row
 * immediately, and the lookup runs with the spinner in the status square the
 * tick will later occupy — a slot that already exists at a fixed size, so
 * nothing moves. On success the canonical casing is adopted and the figure lands
 * in the box that was already holding its space. On failure the name is still
 * saved, as `unverified`, with the reason underneath: **a failed lookup is not a
 * row state**, it is an unverified account plus a sentence.
 *
 * **Both states are the one game-account height**, so toggling edit mode never
 * changes the row's height. Opening an editor is a change the person asked for
 * and may replace what is under their cursor — but the rows around it in a
 * roster did not ask for anything, and a taller editor would push every one of
 * them down the page.
 *
 * The draft is seeded when the editor opens rather than held across closes, so
 * cancelling really discards. Enter commits, Escape cancels.
 */
export function GameUsernameEditableRow({
  platform,
  username,
  externalId = null,
  avatarUrl,
  onCommit,
  autoEdit = false,
  personName,
  className,
}: GameUsernameEditableRowProps) {
  const t = useTranslations("gameAccount");
  const descriptor = GAME_PLATFORMS[platform];
  const verify = useVerifyGameAccount(platform);
  const inputId = useId();

  // `null` is the closed editor — distinct from `""`, which is an open editor
  // someone has cleared. A boolean plus a string cannot tell those apart.
  const [draft, setDraft] = useState<string | null>(
    autoEdit ? (username ?? "") : null,
  );
  /**
   * The committed name while its lookup is in flight.
   *
   * The row is controlled on `username`, and the caller does not learn the new
   * name until the lookup settles — so without this the row would go on showing
   * the *old* name while checking the new one. Non-null only during a flight.
   */
  const [pending, setPending] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<VerifiedGameAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = pending ?? username;

  /**
   * The name this row currently owns, readable from an async continuation.
   *
   * Set synchronously at commit, before anything awaits. A result whose name
   * this no longer holds is **discarded, not applied** — a second commit already
   * owns the row, and applying the first would either overwrite the newer name
   * or pin an old failure on it. The newer flight owns the spinner too, which is
   * why the stale path returns without touching `checking`.
   */
  const owned = useRef<string | null>(username);

  // Derived, not stored: a lookup's result only stands while the row still shows
  // the name that was checked.
  const isVerified = verified !== null && shown === verified.username;

  const status: GameAccountStatus = checking
    ? "checking"
    : isVerified
      ? "verified"
      : gameAccountStatus(shown, externalId);

  const settle = (account: CommittedGameAccount) => {
    setChecking(false);
    setPending(null);
    onCommit(account);
  };

  const commit = async () => {
    if (draft === null) return;
    const next = draft.trim();

    // Closed synchronously, before anything awaits: the tick unmounts with the
    // editor, so it cannot re-enable itself between the click and the outcome.
    setDraft(null);
    setError(null);
    setVerified(null);
    owned.current = next === "" ? null : next;

    if (next === "") {
      onCommit({
        username: null,
        externalId: null,
        avatarUrl: null,
        displayName: null,
      });
      return;
    }

    const unverifiedResult: CommittedGameAccount = {
      username: next,
      externalId: null,
      avatarUrl: null,
      displayName: null,
    };

    // Nothing shaped like this can exist on the platform, so there is nothing to
    // look up. Saved anyway — an unverified name is still the child's answer —
    // and the reason is said out loud rather than swallowed.
    if (!descriptor.isValidUsername(next)) {
      setError(t("notFound", { platform: descriptor.name }));
      onCommit(unverifiedResult);
      return;
    }

    setPending(next);
    setChecking(true);

    try {
      const account = await verify(next);
      if (owned.current !== next) return;
      setVerified(account);
      owned.current = account.username;
      settle({
        username: account.username,
        externalId: account.externalId,
        avatarUrl: account.avatarUrl,
        displayName: account.displayName,
      });
    } catch (err) {
      if (owned.current !== next) return;
      setError(
        err instanceof Error
          ? err.message
          : t("notFound", { platform: descriptor.name }),
      );
      settle(unverifiedResult);
    }
  };

  if (draft !== null) {
    return (
      <div className={cn("min-w-0", className)}>
        {/* Same height, same figure, same gap — only the middle box changes. */}
        <div className={cn("flex min-w-0 items-center gap-2", GAME_ROW_HEIGHT)}>
          <GameAvatarBox
            platform={platform}
            username={shown}
            avatarUrl={avatarUrl}
          />
          <label className="sr-only" htmlFor={inputId}>
            {t("usernameLabel", { platform: descriptor.name })}
          </label>
          <Input
            id={inputId}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setDraft(null);
            }}
            placeholder={t("placeholder", {
              example: descriptor.usernameExample,
            })}
            className="h-8 min-w-0 flex-1 px-2 py-0 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void commit()}
            aria-label={t("save")}
            className="h-8 w-8 shrink-0 p-0"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDraft(null)}
            aria-label={t("cancel")}
            className="h-8 w-8 shrink-0 p-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      {/* The height is restated here rather than left to the row inside, so both
          modes declare it at the same node and neither can drift. */}
      <div
        className={cn(
          "group/game flex min-w-0 items-center gap-1",
          GAME_ROW_HEIGHT,
        )}
      >
        <GameUsernameRow
          platform={platform}
          username={shown}
          status={status}
          avatarUrl={isVerified ? verified.avatarUrl : avatarUrl}
          className="min-w-0 flex-1"
        />
        {/* Deliberately **not** disabled while a lookup is out. Someone who
            mistypes a name should be able to start fixing it the moment they see
            it, not wait on a round trip they have already given up on — which is
            precisely why the stale guard above exists rather than being designed
            away by locking the row. */}
        <button
          type="button"
          onClick={() => setDraft(shown ?? "")}
          aria-label={
            personName === undefined
              ? t("edit", { platform: descriptor.name })
              : t("editFor", { platform: descriptor.name, name: personName })
          }
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/game:opacity-100"
        >
          {/* Always the pencil: the row's status square already owns the loading
              affordance, and a second spinner beside it says the same thing
              twice. */}
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {/* The surface's own error copy. Appears only after a commit the person
          just made, so it is a change they asked for — and it is a sentence
          about a lookup, never a fifth row state. */}
      {error !== null && (
        <p className="pt-1 text-xs text-muted-foreground">{error}</p>
      )}
    </div>
  );
}
