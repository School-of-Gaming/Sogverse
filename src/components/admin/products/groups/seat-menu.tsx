"use client";

import { createContext, forwardRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { SeatMenuAction, SeatMenuItem } from "./panel-rules";

/**
 * What the panel tells every chip about its seat's menu: the rows for one
 * participation, and where a pressed row goes.
 *
 * A context rather than props, because the chips are drawn by three cards —
 * the groups, the inbox and the waitlist — none of which has any business with
 * the menu, and threading two callbacks through each of them would make all
 * three re-render on every change to either. The drag overlay's chip is handed
 * `null`, so the lifted copy of a chip is never a menu trigger.
 */
export interface SeatMenuContextValue {
  /** The seat's rows, or null for a chip the panel offers no menu on. */
  itemsFor: (participationId: string) => readonly SeatMenuItem[] | null;
  onSelect: (
    participationId: string,
    firstName: string,
    action: SeatMenuAction,
  ) => void;
}

export const SeatMenuContext = createContext<SeatMenuContextValue | null>(
  null,
);

// Action → message key, total over the union so a fourth action fails to
// compile until its row has copy.
const ACTION_KEY = {
  switchClub: "switchClub",
  move: "move",
  remove: "remove",
} as const satisfies Record<SeatMenuAction, string>;

/**
 * The panel of one seat's menu. Positioned under the chip it belongs to, and
 * absolutely, so opening it moves nothing on the board.
 *
 * **Disabled rows stay in the list and stay focusable**, with the reason under
 * the label: a row the action cannot apply to is shown with its reason rather
 * than left out, and a row the arrow keys skipped would be a reason a keyboard
 * user never hears. `aria-disabled` rather than `disabled` is what keeps it in
 * the focus order.
 *
 * Its geometry and its rows are the account menu's and the session card
 * menu's (`src/components/layout/CLAUDE.md`), to the class, so the menus in
 * this app read as one control.
 */
export const SeatMenuPanel = forwardRef<
  HTMLDivElement,
  {
    label: string;
    items: readonly SeatMenuItem[];
    onSelect: (action: SeatMenuAction) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  }
>(function SeatMenuPanel({ label, items, onSelect, onKeyDown }, ref) {
  const t = useTranslations("admin.products.groupsPanel.seatMenu");

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-card py-1 text-left shadow-lg"
    >
      {items.map((item) => {
        const disabled = item.disabledReason !== null;
        return (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            data-seat-menu-item=""
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onSelect(item.action);
            }}
            className={cn(
              "flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors focus:bg-lifted focus:text-foreground focus:outline-none",
              disabled
                ? "cursor-default text-muted-foreground"
                : "hover:bg-hover hover:text-foreground",
            )}
          >
            {t(ACTION_KEY[item.action])}
            {/* The space keeps the label and the reason two words apart in
                the row's accessible name; the column layout collapses it. */}
            {item.disabledReason !== null && " "}
            {item.disabledReason !== null && (
              <span className="mt-0.5 text-xs text-muted-foreground">
                {t(`disabled.${item.disabledReason}`)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

/** The rows the arrow keys may land on, in DOM order. */
export function seatMenuRows(panel: HTMLElement | null): HTMLElement[] {
  if (panel === null) return [];
  return [...panel.querySelectorAll<HTMLElement>("[data-seat-menu-item]")];
}
