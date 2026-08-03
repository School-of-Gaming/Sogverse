"use client";

import { useId, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GameUsernameRow } from "./game-username-row";
import {
  GAME_PLATFORMS,
  gameAccountStatus,
  type GameAccountExternalId,
  type GameAccountStatus,
  type GamePlatform,
} from "./platforms";

interface GameUsernameEditableRowProps {
  /** Which platform this identity is on. */
  platform: GamePlatform;
  /** The saved username, or `null` when the child has never given one. */
  username: string | null;
  /**
   * The platform's account key, when one was ever confirmed. Drives the resting
   * status, so an untouched row does not have to be told what it already knows.
   */
  externalId?: GameAccountExternalId | null;
  /**
   * A status that overrides the derived one — for a lookup that really is in
   * flight, or really did just land. Everything else leaves it off.
   */
  status?: GameAccountStatus;
  /** Passed straight through to the row; the three meanings are documented there. */
  avatarUrl?: string | null;
  /** Commit. Called with the trimmed draft; the caller owns the write and the row's next value. */
  onSave: (username: string) => void;
  /**
   * Whose account this is, for the pencil's accessible name. Omitted on a
   * surface where the answer is "yours" — a settings page — and given on one
   * that lists several people, where "Edit Minecraft username" repeated eight
   * times names nobody.
   */
  personName?: string;
  className?: string;
}

/**
 * A saved game identity that can be edited **in place**: the row, plus a pencil
 * that swaps it for an input.
 *
 * This is the third of the three shapes a game identity takes. First capture is
 * the field, with its Verify button and its always-present preview. Display with
 * no edit here is the plain row or the badge. This one is display *and* edit, on
 * a surface that already holds the value — a roster a game educator is fixing a
 * typo in mid-session, a detail page.
 *
 * **Both states are `h-12`, so toggling edit mode never changes the row's
 * height.** The controls inside the editor are `h-7`, centred in it. Swapping a
 * display row for an editor is a change the user asked for, so it is allowed to
 * replace what is there — but the rows *around* it in a roster did not ask for
 * anything, and a taller editor would push every one of them down the page.
 *
 * The draft is seeded when the editor opens rather than held across closes, so
 * cancelling really discards. Enter commits, Escape cancels. Saving closes
 * optimistically: the caller owns the row, so the new username arrives back as a
 * prop, and so does whatever the check made of it.
 */
export function GameUsernameEditableRow({
  platform,
  username,
  externalId = null,
  status,
  avatarUrl,
  onSave,
  personName,
  className,
}: GameUsernameEditableRowProps) {
  const t = useTranslations("gameAccount");
  const descriptor = GAME_PLATFORMS[platform];
  const inputId = useId();
  // `null` is the closed editor — distinct from `""`, which is an open editor
  // someone has cleared. A boolean plus a string cannot tell those apart.
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const commit = () => {
      onSave(draft.trim());
      setDraft(null);
    };

    return (
      <div className={cn("flex h-12 items-center gap-1.5", className)}>
        <label className="sr-only" htmlFor={inputId}>
          {t("usernameLabel", { platform: descriptor.name })}
        </label>
        <Input
          id={inputId}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          placeholder={t("placeholder", {
            example: descriptor.usernameExample,
          })}
          className="h-7 w-40 min-w-0 flex-1 px-2 py-0 text-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={commit}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDraft(null)}
          aria-label={t("cancel")}
          className="h-7 w-7 shrink-0 p-0"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    // The row owns the h-12 — the figure fills it exactly, so the taller variant
    // renders inside the row instead of spilling into its neighbours.
    <div
      className={cn(
        "group/game flex h-12 min-w-0 items-center gap-1",
        className,
      )}
    >
      <GameUsernameRow
        platform={platform}
        username={username}
        status={status ?? gameAccountStatus(username, externalId)}
        avatarUrl={avatarUrl}
        className="min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={() => setDraft(username ?? "")}
        aria-label={
          personName === undefined
            ? t("edit", { platform: descriptor.name })
            : t("editFor", { platform: descriptor.name, name: personName })
        }
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/game:opacity-100"
      >
        <Pencil className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
