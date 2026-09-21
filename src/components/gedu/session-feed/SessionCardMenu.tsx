"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** One row of a session card's overflow menu. */
export interface SessionCardMenuItem {
  /** React key, and what a test names the row by. */
  key: string;
  label: string;
  onSelect: () => void;
}

/**
 * The `⋯` on a session card, and whatever the surface puts in it.
 *
 * **One menu, both roles.** A gedu's card carries a single row ("I need to
 * cancel"); an admin's carries the office's own actions on the same session.
 * They were a menu and a row of visible buttons until the owner asked for one
 * idiom *(owner, 2026-09)* — so the trigger, the panel, the keyboard and the
 * geometry live here once and the *items* are the caller's.
 *
 * **The glyph is small and the hit box is not.** 44×44 CSS px, the thumb target
 * the rest of the app is moving towards, with the extra height pulled back into
 * the row's own padding by negative margins — so the header cluster grows by
 * nothing a reader can see while the tap target is the full size.
 *
 * **There is no dropdown primitive in the kit**, so this follows the account
 * menu's idiom (`src/components/layout/CLAUDE.md`): a `relative` wrapper, an
 * absolutely-positioned `role="menu"` panel, Escape closing it with focus
 * handed back to the trigger, and arrow keys moving across the rows. The panel
 * and the rows take that menu's classes to the character, so the two cannot
 * drift apart.
 *
 * **The outside-click listener is attached only while the panel is open, and
 * that is the one place this departs from the account menu.** There is one
 * account menu per document and there are as many of these as there are cards
 * in a feed — fifty is ordinary — so the shared `useClickOutside`, which holds
 * a document listener for the whole life of its caller, would put fifty
 * always-live mousedown handlers on a page where at most one menu is ever open.
 * The behaviour is the same; what changes is that nothing listens for the
 * overwhelmingly common closed case.
 *
 * **Focus comes back from whatever a row opened.** The row that opened a dialog
 * or a sheet went with the panel, so without this the close lands focus on
 * `<body>` and the next Tab restarts at the top of the page. The caller says
 * when its flow is up, because only the caller knows — the menu is long closed
 * by then.
 *
 * **No row carries a destructive tint, and that is the account menu's rule
 * rather than an omission**: sign-out is styled like every other row there,
 * because the only thing that colour marks in a panel is the line saying
 * something went wrong. Clearing a substitute is reversible office work, not a
 * deletion.
 *
 * **A mouse open focuses nothing.** The row's focus treatment is a filled
 * ground, so auto-focusing on every open painted a permanently-selected row —
 * and doubled it the moment the pointer landed. Focus on open belongs to the
 * keyboard.
 *
 * Renders nothing at all when it is handed no items: an empty panel is a
 * promise the surface cannot keep.
 */
export function SessionCardMenu({
  label,
  items,
  flowOpen = false,
}: {
  /** The trigger's and the panel's accessible name, already translated. */
  label: string;
  items: readonly SessionCardMenuItem[];
  /**
   * Whether an overlay one of the rows opened is currently up. On its way back
   * down, focus returns to the `⋯` this menu drew.
   */
  flowOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * Which end to land focus on when the menu is opened *by an arrow key* — the
   * panel is not in the DOM until that open renders, so the intent is parked
   * here and spent by the effect below.
   */
  const focusOnOpenRef = useRef<"first" | "last" | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (
        wrapperRef.current !== null &&
        target instanceof Node &&
        wrapperRef.current.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape hands focus back to what opened the menu; without this it lands
      // on <body> and the next Tab restarts at the top of the page.
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Whether a flow this menu opened has been up since the last time focus was
   * handed back — so the effect below fires on the way *down* only, and a card
   * that simply renders with nothing open never steals focus.
   */
  const flowWasOpenRef = useRef(false);
  useEffect(() => {
    if (flowOpen) {
      flowWasOpenRef.current = true;
      return;
    }
    if (!flowWasOpenRef.current) return;
    flowWasOpenRef.current = false;
    const trigger = triggerRef.current;
    // A successful write can take the whole control off the card — a gedu who
    // has filed is no longer offered the row — and then there is nothing to
    // hand focus back to.
    if (trigger !== null && trigger.isConnected) trigger.focus();
  }, [flowOpen]);

  useEffect(() => {
    if (!open) return;
    const want = focusOnOpenRef.current;
    focusOnOpenRef.current = null;
    if (want === null) return;
    const rows = menuRows(panelRef.current);
    if (rows.length === 0) return;
    (want === "first" ? rows[0] : rows[rows.length - 1]).focus();
  }, [open]);

  if (items.length === 0) return null;

  /**
   * Arrow-key movement across the rows, which is what `role="menu"` promises a
   * screen-reader user. On the wrapper rather than the panel, so ArrowDown from
   * the closed trigger opens the menu the way every other menu behaves.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") {
      return;
    }
    event.preventDefault();
    if (!open) {
      if (key === "Home" || key === "End") return;
      focusOnOpenRef.current = key === "ArrowDown" ? "first" : "last";
      setOpen(true);
      return;
    }
    const rows = menuRows(panelRef.current);
    if (rows.length === 0) return;
    if (key === "Home") {
      rows[0].focus();
      return;
    }
    if (key === "End") {
      rows[rows.length - 1].focus();
      return;
    }
    const active = document.activeElement;
    const current = active instanceof HTMLElement ? rows.indexOf(active) : -1;
    const step = key === "ArrowDown" ? 1 : -1;
    // From outside the list (the trigger), ArrowDown enters at the top and
    // ArrowUp at the bottom.
    const from = current === -1 ? (step === 1 ? -1 : 0) : current;
    const next = (((from + step) % rows.length) + rows.length) % rows.length;
    rows[next].focus();
  }

  return (
    <div className="relative" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
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
          ref={panelRef}
          role="menu"
          aria-label={label}
          // The account menu's panel, to the class: same width, radius, border,
          // ground, shadow and 4px of vertical padding. The clip is its
          // `overflow-y-auto` in the form a short panel can take — without it a
          // row's square fill paints over the panel's own rounded corners.
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-card py-1 text-left shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-session-card-menu-item=""
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              // The account menu's row, to the class — the fill tokens, the
              // focus ground, the padding and the text size all come from
              // there, so the menus in this app cannot drift apart.
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hover hover:text-foreground focus:bg-lifted focus:text-foreground focus:outline-none"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The rows the arrow keys may land on, in DOM order. */
function menuRows(panel: HTMLElement | null): HTMLElement[] {
  if (panel === null) return [];
  return [
    ...panel.querySelectorAll<HTMLElement>("[data-session-card-menu-item]"),
  ];
}
