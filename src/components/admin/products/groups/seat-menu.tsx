"use client";

import { createContext, forwardRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/lib/constants/routes";
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
 * **The first row is a link to the seat holder's admin user page, drawn here
 * rather than decided by `seatMenuItems`.** It is not an action on the seat and
 * nothing about the seat decides it — every seat has a holder with a page — so
 * it never depends on the rules the action rows are read off, and it is a real
 * anchor (Ctrl- or middle-click opens a new tab) rather than a press the panel
 * routes through `onSelect`. A separator sets it apart from the actions below,
 * the account menu's divider.
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
    /** The seat holder's profile id — the person in the seat, not the parent. */
    participantId: string;
    firstName: string;
    items: readonly SeatMenuItem[];
    onSelect: (action: SeatMenuAction) => void;
    /** The user page link was followed; the menu closes behind it. */
    onNavigate: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  }
>(function SeatMenuPanel(
  { participantId, firstName, items, onSelect, onNavigate, onKeyDown },
  ref,
) {
  const t = useTranslations("admin.products.groupsPanel.seatMenu");

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("label", { name: firstName })}
      onKeyDown={onKeyDown}
      className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-card py-1 text-left shadow-lg"
    >
      <Link
        href={ROUTES.admin.user(participantId)}
        role="menuitem"
        data-seat-menu-item=""
        onClick={onNavigate}
        className="flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-hover hover:text-foreground focus:bg-lifted focus:text-foreground focus:outline-none"
      >
        {t("goToUser", { name: firstName })}
      </Link>
      <div role="separator" className="my-1 h-px bg-border" />
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
