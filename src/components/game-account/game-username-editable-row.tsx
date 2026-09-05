"use client";

import { useId, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";
import { cn } from "@/lib/utils";
import { GameAvatarBox, GameUsernameRow } from "./game-username-row";
import {
  GAME_PLATFORMS,
  gameFigureHeight,
  gameAccountStatus,
  useVerifyGameAccount,
  type GameAccountExternalId,
  type GameAccountStatus,
  type GameFigure,
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
  /**
   * One render per figure, so a caller can draw whichever it needs. Short-lived
   * where a platform returns one; never a value to persist.
   */
  figureUrls: Readonly<Record<GameFigure, string | null>>;
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
  /** How much of the character to draw. Defaults to the whole figure. */
  figure?: GameFigure;
  /**
   * Called once per commit with what the commit settled on. The caller stores it
   * and hands `username`/`externalId` back as props — this component renders the
   * in-flight name itself but does **not** own the committed one.
   */
  onCommit: (account: CommittedGameAccount) => void | Promise<void>;
  /**
   * Open in edit mode on mount. What a register-style surface passes, where
   * there is nothing to view yet and the only thing to do is type. A roster
   * leaves it off: eight rows that all open themselves is not a roster.
   */
  autoEdit?: boolean;
  /** Whose account this is, for the pencil's accessible name. Omitted where the answer is "yours". */
  personName?: string;
  /**
   * The id to give the editor's input, when the surface already renders a
   * **visible** label for it and wants that label to point here.
   *
   * Supplying it also suppresses the row's own screen-reader-only label: two
   * labels for one input is one too many, and the visible one is the better of
   * the two because clicking it focuses the field. A surface with no visible
   * label (a roster cell) leaves this off and gets the sr-only label instead.
   */
  inputId?: string;
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
  figure = "full",
  onCommit,
  autoEdit = false,
  personName,
  inputId: labelledInputId,
  className,
}: GameUsernameEditableRowProps) {
  const t = useTranslations("gameAccount");
  const descriptor = GAME_PLATFORMS[platform];
  const verify = useVerifyGameAccount(platform);
  const generatedId = useId();
  const inputId = labelledInputId ?? generatedId;

  /**
   * Whether the editor was opened by the person rather than by `autoEdit`.
   *
   * Focus follows the action: opening the editor with the pencil is a request to
   * type, so the caret belongs in the field. `autoEdit` is not — it opens before
   * anyone has done anything, and autofocusing there drags a register page's
   * focus (and its scroll) down to the sixth field on load, past five the person
   * has not filled in yet.
   */
  const [openedByPerson, setOpenedByPerson] = useState(false);

  // `null` is the closed editor — distinct from `""`, which is an open editor
  // someone has cleared. A boolean plus a string cannot tell those apart.
  const [draft, setDraft] = useState<string | null>(
    autoEdit ? (username ?? "") : null,
  );
  /**
   * What this row committed, held until the caller's props catch up.
   *
   * The row is controlled on `username`, but a caller's write is a mutation, an
   * invalidation and a refetch away from handing the new name back — so without
   * this the row would show the *old* name for the whole round trip: type
   * "NewName", watch the spinner, watch "OldName" return, then finally
   * "NewName". Held from the moment of commit until the prop agrees with it.
   *
   * A **box** rather than a bare string, because clearing a username commits
   * `null` and that has to be distinguishable from "nothing is pending".
   */
  const [pending, setPending] = useState<{ username: string | null } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<VerifiedGameAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The props have caught up, so the local copy retires. Adjusting state during
  // render is React's own escape hatch for deriving from props, and it avoids
  // the frame of stale text an effect would leave behind. Self-limiting: once
  // cleared the condition cannot hold again until the next commit.
  if (pending !== null && username === pending.username) setPending(null);

  const shown = pending !== null ? pending.username : username;

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

  const EMPTY_FIGURES = { full: null, head: null } as const;

  /**
   * Hand the outcome to the caller and wait for it to be stored.
   *
   * A caller that **rejects** has refused the write, so the row stops claiming a
   * value nobody kept and falls back to whatever is actually stored. It does not
   * add an error of its own: the surface that refused owns that explanation, and
   * two messages for one failure is one too many.
   */
  const report = async (account: CommittedGameAccount) => {
    try {
      await onCommit(account);
    } catch {
      setPending(null);
    }
  };

  const commit = async () => {
    if (draft === null) return;
    const typed = draft.trim();
    const committed = typed === "" ? null : typed;

    // Closed synchronously, before anything awaits: the tick unmounts with the
    // editor, so it cannot re-enable itself between the click and the outcome.
    setDraft(null);
    setError(null);
    setVerified(null);
    owned.current = committed;
    // On screen from this instant, on every path — a name that is about to be
    // looked up, a name that cannot be, and a clear alike.
    setPending({ username: committed });

    if (committed === null) {
      await report({
        username: null,
        externalId: null,
        figureUrls: EMPTY_FIGURES,
        displayName: null,
      });
      return;
    }

    const unverifiedResult: CommittedGameAccount = {
      username: committed,
      externalId: null,
      figureUrls: EMPTY_FIGURES,
      displayName: null,
    };

    // **Every committed name goes to the platform.** There was a branch here
    // that answered for it — a format check that skipped the lookup for anything
    // it called impossible — and it was wrong about real accounts, so a child
    // holding one was told their own handle did not exist without anyone ever
    // asking. The platform is the only authority on its own names, and a miss it
    // reports lands in exactly the same place: saved, unverified, with the
    // "couldn't find" sentence underneath.
    setChecking(true);

    try {
      const account = await verify(committed);
      if (owned.current !== committed) return;
      setChecking(false);
      setVerified(account);
      owned.current = account.username;
      // The canonical casing is what was committed, so it is what the row holds
      // and what the prop will eventually equal.
      setPending({ username: account.username });
      await report({
        username: account.username,
        externalId: account.externalId,
        figureUrls: account.figureUrls,
        displayName: account.displayName,
      });
      // Bound to nothing on purpose: there is no longer anything in the
      // rejection this component is allowed to read.
    } catch {
      if (owned.current !== committed) return;
      setChecking(false);
      // **The rejection's message is never rendered.** It carries the verify
      // route's `{ error }` body, which is English written for a log — so
      // preferring it, as this did, put English on screen in every locale, and
      // the translated line below it was unreachable because a service always
      // rejects with an `Error`.
      setError(t("notFound", { platform: descriptor.name }));
      await report(unverifiedResult);
    }
  };

  if (draft !== null) {
    return (
      <div className={cn("min-w-0", className)}>
        {/* Same height, same figure, same gap — only the middle box changes. */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            gameFigureHeight(figure),
          )}
        >
          <GameAvatarBox
            platform={platform}
            figure={figure}
            username={shown}
            avatarUrl={avatarUrl}
            verified={status === "verified"}
          />
          {labelledInputId === undefined && (
            <label className="sr-only" htmlFor={inputId}>
              {t("usernameLabel", { platform: descriptor.name })}
            </label>
          )}
          <Input
            id={inputId}
            autoFocus={openedByPerson}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // Both gestures are **consumed**, not merely handled. This input
            // lives inside a `<form>` on the register page, where a bare Enter
            // is also HTML implicit submission — so committing a username would
            // submit the whole registration, with the username not yet stored.
            // Escape is stopped for the mirror reason: a dialog would take it as
            // "close me" and throw away the edit the key was meant to cancel.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(null);
              }
            }}
            // The transport bound, enforced where it is cheapest: the field
            // simply stops taking characters rather than letting a name be
            // typed, committed, and refused by a schema. It is the only rule
            // this input has — nothing here judges the shape of a handle.
            maxLength={GAME_USERNAME_MAX_LENGTH}
            placeholder={t("placeholder", {
              example: descriptor.usernameExample,
            })}
            className="h-8 min-w-0 flex-1 px-2 py-0 text-xs"
          />
          {/* Cancel then Save — the app-wide button order (root `CLAUDE.md`,
              "Button Order") puts the affirmative last, so it reads rightmost.
              This row never stacks, so it needs no `flex-col-reverse`. */}
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
          <Button
            type="button"
            size="sm"
            onClick={() => void commit()}
            aria-label={t("save")}
            className="h-8 w-8 shrink-0 p-0"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
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
          gameFigureHeight(figure),
        )}
      >
        <GameUsernameRow
          platform={platform}
          username={shown}
          status={status}
          figure={figure}
          avatarUrl={isVerified ? verified.figureUrls[figure] : avatarUrl}
          className="min-w-0 flex-1"
        />
        {/* Deliberately **not** disabled while a lookup is out. Someone who
            mistypes a name should be able to start fixing it the moment they see
            it, not wait on a round trip they have already given up on — which is
            precisely why the stale guard above exists rather than being designed
            away by locking the row. */}
        <button
          type="button"
          onClick={() => {
            setOpenedByPerson(true);
            setDraft(shown ?? "");
          }}
          aria-label={
            personName === undefined
              ? t("edit", { platform: descriptor.name })
              : t("editFor", { platform: descriptor.name, name: personName })
          }
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover/game:opacity-100"
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
