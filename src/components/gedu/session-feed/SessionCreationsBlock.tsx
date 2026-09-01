"use client";

import { AlertTriangle, Check, Eye, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SessionFeedGamer } from "./types";

/**
 * What the run's **final session** still owes in creations, itemized per member,
 * on the session surface where the rest of that session's work is done.
 *
 * **It exists because a session cannot flag work a gedu has no way to provide
 * from where they were flagged** *(owner)*. The final card of a flagged run goes
 * amber for a fourth reason nobody could see on it: a gedu opened the editor,
 * found the register full and the report written, and had nothing to fix. The
 * itemization was on the roster the whole time — a tone on a button in the rail
 * — which is the right place for *who*, and no place at all for a gedu working
 * the card. So the card carries the same answer, beside the register it belongs
 * next to.
 *
 * **It is a route to the one dialog, never a second editor.** Every chip opens
 * that member's per-gamer dialog, which is where a creation is authored on every
 * surface in the product — the roster's button, the voice room's row and this.
 * The one-authoring-surface rule is what forbids the obvious alternative of a
 * title-and-URL pair inline on the card.
 *
 * **Every member gets a chip, not only the ones still owing**, for the same
 * reason the roster's button is on every row: an added creation is the state a
 * gedu most often wants to *correct* (a link typed wrong is invisible from
 * here), and a list showing only the gaps would say nothing about whether the
 * rest is right. The check and the plus say which is which, and the accessible
 * name says it in words rather than leaving it to a glyph.
 *
 * **Two tones, and the neutral one is the point of the change.** Before the
 * session ends nothing is owed yet, so the block is informational: this is the
 * last session, here is what it will want. Once the session has ended and the
 * condition is unmet it takes the warning tone, which is exactly when the card's
 * own needs-attention line fires — the two are read off one derivation, so the
 * block can never be calm beside an amber header. What the neutral half buys is
 * the whole of the owner's complaint: the work is discoverable while there is
 * still time to do it, rather than only after the run is over.
 *
 * **An empty roster renders nothing at all**, which is the same exemption the
 * completeness derivation makes: there is nobody to owe, so there is nothing to
 * say and no space to hold for it.
 */
export function SessionCreationsBlock({
  roster,
  withCreations,
  owed,
  disabled = false,
  onOpenMember,
}: {
  /** The group's current roster — the tally runs over it, never over the map. */
  roster: readonly SessionFeedGamer[];
  /** Who already has at least one creation in this group. */
  withCreations: ReadonlySet<string>;
  /**
   * Whether this session is *owed* the missing creations right now — the
   * session has ended, it is owed at all, and somebody is still missing. False
   * before the session ends, which is the informational half.
   */
  owed: boolean;
  /**
   * Greyed with the rest of an editor while its save is in flight.
   *
   * The creations are **not** part of that draft — they are written through
   * their own dialog and their own RPC — so this is not the usual "what you type
   * now will not be carried" lock. It is that a modal opening over a card that
   * is mid-commit is not a state worth having, and the block comes back the
   * instant the save lands.
   */
  disabled?: boolean;
  /** Open one member's per-gamer dialog — the one authoring surface. */
  onOpenMember: (participantId: string) => void;
}) {
  const t = useTranslations("gedu.sessionFeed");

  if (roster.length === 0) return null;

  const added = roster.filter((gamer) => withCreations.has(gamer.id)).length;

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border p-2.5",
        owed ? "border-warning/40 bg-warning/5" : "border-border bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {/* The eye is the dialog's own mark for the family-visible half, so the
            two surfaces name one thing the same way; the alert replaces it only
            once the session is actually owed, which is the same glyph the card's
            header is wearing three lines above it. */}
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium leading-none",
            owed && "text-warning",
          )}
        >
          {owed ? (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden />
          )}
          {t("creationsTitle")}
        </p>
        {/* The count is what makes the state legible without the colour — and
            it is the answer to "what is this card missing", which the shared
            needs-attention label cannot give because it stands for four
            different obligations. */}
        <span
          className={cn(
            "text-xs tabular-nums",
            owed ? "text-warning" : "text-muted-foreground",
          )}
        >
          {t("creationsAddedCount", { added, total: roster.length })}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{t("creationsHint")}</p>

      <ul className="flex flex-wrap gap-1.5">
        {roster.map((gamer) => {
          const has = withCreations.has(gamer.id);
          return (
            <li key={gamer.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpenMember(gamer.id)}
                aria-label={
                  has
                    ? t("creationsMemberDone", { name: gamer.firstName })
                    : t("creationsMemberMissing", { name: gamer.firstName })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  has
                    ? "border-transparent bg-muted/40 text-muted-foreground hover:text-foreground"
                    : owed
                      ? "border-warning bg-warning/15 font-semibold text-warning"
                      : "border-border text-foreground hover:bg-muted",
                )}
              >
                {has ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : (
                  <Plus className="h-3 w-3" aria-hidden />
                )}
                {gamer.firstName}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * What a card needs in order to draw the block above — handed down whole,
 * `null` on every entry that is not a flagged run's final session.
 *
 * The callback travels *with* the data rather than beside it, because the two
 * are one decision: a surface that can derive the obligation is by construction
 * the surface that owns the per-gamer dialog, and a card given one without the
 * other could only render a signal nobody can act on.
 */
export interface SessionCreationsState {
  /** Who already has at least one creation in this group. */
  withCreations: ReadonlySet<string>;
  /** Whether the missing ones are owed *now* — see the block's own prop. */
  owed: boolean;
  /** Open one member's per-gamer dialog. */
  onOpenMember: (participantId: string) => void;
}
