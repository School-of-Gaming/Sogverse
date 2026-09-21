"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useClickOutside } from "@/hooks/use-click-outside";
import { cn } from "@/lib/utils";
import {
  SessionSubstitutionRequestDialog,
  type SessionSubstitutionRequestDraft,
} from "./SessionSubstitutionRequestDialog";

/**
 * The card's overflow menu, and the one thing in it: "I can't make this
 * session".
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
      setOpen(true);
      // The panel is not in the DOM until this open renders, so the focus is
      // spent by the effect below rather than here.
      return;
    }
    itemRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
  }, [open]);

  const fileSubstitution = async (draft: SessionSubstitutionRequestDraft) => {
    setError(null);
    setCommitting(true);
    try {
      await onRequestSubstitution(draft);
      setRequestOpen(false);
    } catch {
      // A refusal keeps the dialog up with the reason and the note where the
      // gedu left them, and names what went wrong inside the dialog they are
      // still standing in front of.
      setError(t("substitutionRequestFailed"));
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
            className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-border bg-card py-1 shadow-lg"
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
              className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-hover hover:text-foreground focus:bg-lifted focus:text-foreground focus:outline-none"
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
