"use client";

import { useTranslations } from "next-intl";
import {
  CHAT_REACTION_CODES,
  CHAT_REACTION_GLYPHS,
  type ChatReactionCode,
} from "@/lib/constants/chat";
import { cn } from "@/lib/utils";
import { tallyChatReactions } from "./chat-reactions";
import type { ChatReactionEntry } from "./types";

/**
 * The reactions standing on a message, and the row that adds one.
 *
 * Two components rather than one, because they answer to different rules: the
 * tally row is content and is on the page whenever a message has reactions; the
 * picker is an affordance and only appears while the viewer is reaching for it.
 */

/** The pills under a bubble. Renders nothing at all when there are none. */
export function ChatReactionRow({
  reactions,
  viewerId,
  canReact,
  onToggle,
  className,
}: {
  reactions: readonly ChatReactionEntry[];
  viewerId: string;
  /** A locked member reads the counts and cannot change them. */
  canReact: boolean;
  onToggle: (code: ChatReactionCode) => void;
  className?: string;
}) {
  const t = useTranslations("chat.reactions");
  const tallies = tallyChatReactions(reactions, viewerId);
  // No pills, no row: an empty strip is a slot held open for something that may
  // never come, and the bubble below would sit a gap further away for nothing.
  if (tallies.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tallies.map((tally) => (
        <button
          key={tally.code}
          type="button"
          disabled={!canReact}
          onClick={() => onToggle(tally.code)}
          aria-pressed={tally.mine}
          aria-label={t("toggle", { name: t(tally.code), count: tally.count })}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition-colors",
            "disabled:cursor-default disabled:opacity-60",
            tally.mine
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border bg-muted text-muted-foreground hover:border-border hover:bg-accent",
          )}
        >
          <span aria-hidden className="text-xl leading-none">
            {CHAT_REACTION_GLYPHS[tally.code]}
          </span>
          <span className="tabular-nums">{tally.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The approved set, as a row of buttons.
 *
 * **A row, not a picker.** The set is small and fixed by decision — that is
 * what dropped the one library purchase this feature had on the table, and a
 * bounded vocabulary is the right shape for a product full of children anyway.
 * Six faces fit on one line inside a bubble's width at the narrow floor.
 */
export function ChatReactionPicker({
  onPick,
  className,
}: {
  onPick: (code: ChatReactionCode) => void;
  className?: string;
}) {
  const t = useTranslations("chat.reactions");
  return (
    <div
      className={cn(
        "flex gap-0.5 rounded-full border border-border bg-popover p-1 shadow-lg",
        className,
      )}
    >
      {CHAT_REACTION_CODES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onPick(code)}
          aria-label={t(code)}
          title={t(code)}
          className="rounded-full px-2 py-1 text-2xl leading-none transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden>{CHAT_REACTION_GLYPHS[code]}</span>
        </button>
      ))}
    </div>
  );
}
