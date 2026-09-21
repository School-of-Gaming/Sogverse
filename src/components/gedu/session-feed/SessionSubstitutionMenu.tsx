"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useClickOutside } from "@/hooks/use-click-outside";
import { substitutionRequestFailureKey } from "@/services/session-substitution";
import { cn } from "@/lib/utils";
import {
  SessionSubstitutionRequestDialog,
  type SessionSubstitutionRequestDraft,
} from "./SessionSubstitutionRequestDialog";

/**
 * The card's overflow menu, and the one thing in it: **"I need to cancel"**.
 *
 * **The row and the dialog it opens say different things on purpose.** The row
 * is the gedu's own words for what they are doing — cancelling *their*
 * attendance — and it is short because it sits in a menu. The dialog is titled
 * "I can't make this session" and its first sentence says the session still
 * runs and the office looks for a substitute, which is what stops the shorter
 * row being read as cancelling the session itself *(owner, 2026-09)*.
 *
 * **Filing an absence is deliberately quiet.** It is rare — most gedus will
 * never press it — and a full-width control repeating that offer on every
 * future card of a fifty-week feed spent a band of every card on the least
 * likely thing anybody would do with it. So the offer is folded into a `⋯`
 * button in the header's trailing cluster, where a reader looking for
 * "what else can I do with this session" already is, and the card is shorter
 * than it was rather than taller *(owner, 2026-09)*.
 *
 * **The glyph is small and the hit box is not.** The button is 44×44 CSS px —
 * the thumb target the rest of the app is moving towards — and absorbs the
 * extra height into the row's own padding with a negative margin, so the header
 * cluster grows by nothing a reader can see while the tap target is the full
 * size. Growing the glyph instead would make the quietest control on the card
 * the loudest thing in the row.
 *
 * **There is no dropdown primitive in the kit**, so this follows the account
 * menu's idiom exactly (`src/components/layout/CLAUDE.md`): a `relative`
 * wrapper, `useClickOutside`, an absolutely-positioned `role="menu"` panel,
 * Escape closing it with focus handed back to the trigger, and arrow keys
 * moving across the rows. Two call sites shared nothing but `useClickOutside`
 * before this one, and a third is not yet a primitive — extracting one is a
 * decision about the menu's *shape*, which nobody has made.
 */
export function SessionSubstitutionMenu({
  onRequestSubstitution,
}: {
  /**
   * File "I can't make this session". **Awaited**: the dialog holds its own
   * committing flag from the click until this settles, and closes only when it
   * resolves — so a refused write leaves the reason and the note where the gedu
   * can try again.
   */
  onRequestSubstitution: (
    draft: SessionSubstitutionRequestDraft,
  ) => void | Promise<void>;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const [open, setOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  /**
   * Live from the click that starts the filing write until the document the
   * write changes comes back.
   *
   * It belongs to the request dialog, which carries a form and therefore holds
   * its committing state out here where the draft's own fields can read it.
   * Set synchronously before the mutation runs, so there is no render between
   * the click and the disabled control in which a second press could land, and
   * cleared on settle whichever way it settles — this menu survives its own
   * write only long enough to be replaced by the status block the write puts on
   * the card, and a flag left set would disable the dialog on the way out.
   */
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  /**
   * Set when the menu is opened *by an arrow key*, which has to land focus on
   * the row — but the panel is not in the DOM until the open renders, so the
   * intent is parked here and spent by the effect below.
   *
   * **A mouse open focuses nothing**, which is the account menu's convention
   * and the fix for a panel that looked permanently selected: the row's focus
   * treatment is a filled ground, and auto-focusing the only row on every open
   * painted that fill the instant the panel appeared — then doubled it the
   * moment the pointer landed on the row it was already sitting on.
   */
  const focusOnOpenRef = useRef(false);

  useClickOutside(wrapperRef, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape hands focus back to what opened the menu; without this it lands
      // on <body> and the next Tab restarts at the top of the page.
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Arrow-key movement across the rows, which is what `role="menu"` promises a
   * screen-reader user. On the wrapper rather than the panel, so ArrowDown from
   * the closed trigger opens the menu the way every other menu behaves — and
   * with one row, every one of these keys lands on the same place.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") {
      return;
    }
    event.preventDefault();
    if (!open) {
      if (key === "Home" || key === "End") return;
      // The panel is not in the DOM until this open renders, so the intent is
      // parked and spent by the effect below.
      focusOnOpenRef.current = true;
      setOpen(true);
      return;
    }
    itemRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    if (!focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    itemRef.current?.focus();
  }, [open]);

  const fileSubstitution = async (draft: SessionSubstitutionRequestDraft) => {
    setError(null);
    setCommitting(true);
    try {
      await onRequestSubstitution(draft);
      setRequestOpen(false);
    } catch (refusal) {
      // A refusal keeps the dialog up with the reason and the note where the
      // gedu left them, and names what went wrong inside the dialog they are
      // still standing in front of — through the same mapper the page's picker
      // reads, so one write cannot be explained two ways.
      setError(t(substitutionRequestFailureKey(refusal)));
    } finally {
      setCommitting(false);
    }
  };

  return (
    // The dialog is a **sibling** of the menu wrapper, never a child of it: a
    // portal still bubbles its events through the React tree it was rendered
    // into, so a dialog mounted inside would hand every arrow key typed at the
    // form to this menu's own key handler.
    <>
      <div className="relative" ref={wrapperRef} onKeyDown={handleKeyDown}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("substitutionMenuLabel")}
          onClick={() => setOpen((was) => !was)}
          className={cn(
            // 44×44, the thumb target — pulled back into the row's padding by
            // the negative margins so the cluster's visual height is the
            // glyph's, not the hit box's.
            "-my-1.5 -mr-2.5 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
            open && "bg-hover text-foreground",
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>

        {open && (
          <div
            role="menu"
            aria-label={t("substitutionMenuLabel")}
            // The account menu's panel, to the class: same width, radius,
            // border, ground, shadow and 4px of vertical padding. The clip is
            // its `overflow-y-auto` in the one form a single-row panel can take
            // — without it a row's square fill paints over the panel's own
            // rounded corners, which is the second half of what looked wrong.
            className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg"
          >
            <button
              ref={itemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setError(null);
                setRequestOpen(true);
              }}
              // The account menu's row, to the class — the fill tokens, the
              // focus ground, the padding and the text size all come from
              // there, so the two menus in this app cannot drift apart.
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hover hover:text-foreground focus:bg-lifted focus:text-foreground focus:outline-none"
            >
              {t("substitutionRequestAction")}
            </button>
          </div>
        )}
      </div>

      <SessionSubstitutionRequestDialog
        open={requestOpen}
        onOpenChange={(next) => {
          if (committing) return;
          setRequestOpen(next);
          // The row that opened the dialog went with the panel, so closing it
          // would otherwise land focus on `<body>` and restart the next Tab at
          // the top of the page. The trigger is where the reader was two clicks
          // ago — unless the write landed, which takes this whole control off
          // the card and leaves nothing to hand focus back to.
          if (!next && triggerRef.current?.isConnected === true) {
            triggerRef.current.focus();
          }
        }}
        committing={committing}
        error={error}
        onConfirm={(draft) => void fileSubstitution(draft)}
      />
    </>
  );
}
