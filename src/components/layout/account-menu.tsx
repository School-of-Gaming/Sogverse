"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LayoutDashboard, LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useClickOutside } from "@/hooks/use-click-outside";
import { trackDashboardNav } from "@/lib/analytics";
import { ROLE_DASHBOARD_PATHS, ROUTES, type UserRole } from "@/lib/constants";
import { byFirstName } from "@/lib/family-order";
import { cn } from "@/lib/utils";
import { FamilyService, useFamily, type FamilyMember } from "@/services/family";

/**
 * The header avatar's dropdown: where the viewer is, who else they can be, and
 * the two things every signed-in person needs from every page (settings, and
 * the way out).
 *
 * Roles that share a household — parents and gamers — get one row per family
 * member, so switching accounts is one click from anywhere instead of a trip
 * through the /select-profile interstitial. Admins and gedus have a single
 * profile, so their block is one row: themselves, in the same inert-active
 * shape the viewer's own row takes everywhere else.
 */

/** Roles whose menu lists a whole household rather than one profile. */
function listsFamily(role: UserRole): boolean {
  return role === "customer" || role === "gamer";
}

/**
 * Every row's shape. `text-left` because three of them are buttons, which
 * centre their text by default and would otherwise sit out of line with the
 * links.
 */
const ROW_CLASS =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors";

/** Added to the rows that do something when clicked. */
const ACTIONABLE_ROW_CLASS =
  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none";

/**
 * Focusable rows carry `data-account-menu-item` so arrow-key navigation can
 * find them without knowing what element each one happens to be (a link, a
 * button, a submit). The selector excludes the rows that cannot take focus, so
 * a disabled row is skipped rather than swallowing the keypress.
 */
const FOCUSABLE_ITEMS =
  '[data-account-menu-item]:not([disabled]):not([aria-disabled="true"])';

interface AccountMenuProps {
  /** The signed-in viewer's profile id — the avatar's identicon seed. */
  userId: string;
  role: UserRole;
  /** Shown on the viewer's own row for the roles with no family list. */
  firstName: string;
}

export function AccountMenu({ userId, role, firstName }: AccountMenuProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("header");
  const c = useTranslations("common");
  const f = useTranslations("family");
  // "My SOG" — read from `dashboardSections`, the same key the dashboard bodies
  // set as their own page title, rather than from `metadata`: that namespace is
  // stripped from the client bundle and this is a client component.
  const d = useTranslations("dashboardSections");

  const [open, setOpen] = useState(false);
  // Held locally and flipped synchronously before the switch call, so no row
  // re-enables between the click and the full-page navigation it causes. It is
  // deliberately never cleared on success — the document unloads instead.
  const [committing, setCommitting] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Fetched on mount rather than on open, so the menu opens with its family
  // rows already in hand. Held back entirely for admins and gedus:
  // /api/family/list is gated to customers and gamers and would 403 for them
  // on every navigation.
  const wantsFamily = listsFamily(role);
  const family = useFamily({ enabled: wantsFamily });

  const dashboardPath = ROLE_DASHBOARD_PATHS[role];
  const isOnDashboard =
    pathname === dashboardPath || pathname.startsWith(dashboardPath + "/");
  const isOnSettings =
    pathname === ROUTES.settings || pathname.startsWith(ROUTES.settings + "/");
  // What the dashboard is called to the person using it — "Dashboard" for the
  // admin, whose panel is genuinely an admin panel, "My SOG" for everyone else.
  const dashboardLabel = role === "admin" ? c("dashboard") : d("pageTitle");

  /**
   * The whole menu paints at once or not at all. Family rows arriving into an
   * already-open panel would push Settings and Sign out down the list on the
   * data's own schedule — a shift under the cursor of someone already reaching
   * for one of them. So a role whose menu lists a household does not paint
   * until that read has settled, one way or the other; a failed read simply
   * yields no family rows (the layout rule's third option — no held-open hole
   * for something that may never come).
   *
   * The wait is invisible in practice: the read is a small indexed lookup of a
   * bounded set, issued when the header mounted, so by the time anyone clicks
   * the avatar it has long since landed. There is deliberately no skeleton and
   * no spinner for the cold-cache frame.
   */
  const contentReady =
    !wantsFamily || family.data !== undefined || family.isError;

  const rows = buildRows();

  function buildRows(): AccountRow[] {
    if (!wantsFamily) {
      // One profile, so the block is the viewer alone — always the
      // inert-active row, which is what `target: null` means.
      return [{ id: userId, firstName, descriptor: null, target: null }];
    }
    const members = family.data ?? [];
    const ordered = [
      ...members.filter((m) => m.role === "customer").sort(byFirstName(locale)),
      ...members.filter((m) => m.role === "gamer").sort(byFirstName(locale)),
    ];
    return ordered.map((member) => ({
      id: member.id,
      firstName: member.first_name,
      // The parent is the row a household can't always tell apart by name
      // alone — a gamer looking at the list needs to know which one is the
      // adult account. Gamers carry no descriptor; they are the default.
      descriptor: member.role === "customer" ? c("roleParent") : null,
      target: member.id === userId ? null : member,
    }));
  }

  /**
   * The commit step of an account switch, kept callable on its own.
   *
   * SEAM: a follow-up piece gates a switch *initiated from a gamer session*
   * behind a parent-PIN dialog. That dialog needs exactly this function and
   * nothing else — the row hands it the target today, the dialog will hand it
   * the same target once the PIN is accepted — so keep it free of anything
   * belonging to the row's own click.
   */
  async function commitSwitch(target: FamilyMember) {
    if (committing) return;
    setSwitchError(null);
    setCommitting(true);
    try {
      await new FamilyService().switchAccount(target.id);
      // Full-page navigation so the new session cookies hydrate the root layout
      // (the browser Supabase singleton is seeded at construction time).
      window.location.href =
        target.role === "customer"
          ? ROUTES.customer.dashboard
          : ROUTES.gamer.dashboard;
      // `committing` stays set through the unload — see its declaration.
    } catch (err) {
      setCommitting(false);
      setSwitchError(err instanceof Error ? err.message : f("switchFailed"));
    }
  }

  /**
   * Arrow-key movement across the rows, which is what `role="menu"` promises a
   * screen-reader user. Lives on the wrapper rather than the panel so ArrowDown
   * from the closed trigger opens the menu, the way every other menu behaves.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    if (
      key !== "ArrowDown" &&
      key !== "ArrowUp" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    const panel = panelRef.current;
    const items = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS))
      : [];
    if (items.length === 0) return;
    event.preventDefault();
    if (key === "Home") {
      items[0].focus();
      return;
    }
    if (key === "End") {
      items[items.length - 1].focus();
      return;
    }
    const active = document.activeElement;
    const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
    const step = key === "ArrowDown" ? 1 : -1;
    // From outside the list (the trigger), ArrowDown enters at the top and
    // ArrowUp at the bottom.
    const from = current === -1 ? (step === 1 ? -1 : 0) : current;
    const next = (((from + step) % items.length) + items.length) % items.length;
    items[next].focus();
  }

  return (
    <div className="relative" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("accountMenu")}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {/* The open state takes the ring the avatar used to wear when the page
            it linked to was the current one. It links nowhere now, so "you are
            here" has nothing left to mean; "this is what is open" does. */}
        <Avatar
          className={cn(
            "h-8 w-8 transition-shadow",
            open && "ring-2 ring-primary",
          )}
        >
          <Identicon id={userId} size={32} />
        </Avatar>
      </button>

      {open && contentReady && (
        // `w-56` clears the 360px floor with room to spare — the header's own
        // gutter is 12px there, so the panel sits 224px inside a 360px viewport
        // and cannot push the document sideways. The widest label in any locale
        // ("Kirjaudu ulos", "Se déconnecter") is well inside that at 14px.
        <div
          ref={panelRef}
          role="menu"
          aria-label={t("accountMenu")}
          className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-border bg-card py-1 shadow-lg"
        >
          <MenuLinkRow
            href={dashboardPath}
            active={isOnDashboard}
            disabled={committing}
            onNavigate={() => {
              // The gedu avatar was the one avatar that linked straight to a
              // dashboard, and this row inherits that trip — so it inherits the
              // event too. No other role's avatar was ever tracked here.
              if (role === "gedu") {
                trackDashboardNav({
                  role: "gedu",
                  method: "avatar",
                  from: pathname,
                });
              }
              setOpen(false);
            }}
            icon={<LayoutDashboard className="h-4 w-4 shrink-0" />}
            label={dashboardLabel}
          />

          {rows.length > 0 && (
            <>
              <div role="separator" className="my-1 h-px bg-border" />
              {rows.map((row) => (
                <AccountRowItem
                  key={row.id}
                  row={row}
                  committing={committing}
                  onSwitch={commitSwitch}
                />
              ))}
            </>
          )}

          <div role="separator" className="my-1 h-px bg-border" />

          <MenuLinkRow
            href={ROUTES.settings}
            active={isOnSettings}
            disabled={committing}
            onNavigate={() => setOpen(false)}
            icon={<Settings className="h-4 w-4 shrink-0" />}
            label={c("settings")}
          />

          {/* The canonical sign-out: a form POST the server answers with a 303,
              which the browser follows as a full-page GET. No client fetch —
              the route changes cookies the browser Supabase singleton never
              sees, so only a document reload rebuilds it.

              `role="none"` because a menu's children have to be menu items and
              the form is a wrapper, not a row; it still submits normally. */}
          <form role="none" method="post" action="/api/auth/signout">
            <button
              type="submit"
              role="menuitem"
              data-account-menu-item=""
              disabled={committing}
              className={cn(
                ROW_CLASS,
                ACTIONABLE_ROW_CLASS,
                committing && "opacity-60",
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{c("signOut")}</span>
            </button>
          </form>

          {/* Last in the panel, so a failed switch adds a line below everything
              already painted rather than displacing a row mid-list. */}
          {switchError && (
            <p role="alert" className="px-3 pb-1 pt-2 text-xs text-destructive">
              {switchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A row that navigates. Links can't carry `disabled`, so a switch in flight
 * neutralises them with `aria-disabled` + a click guard + `pointer-events-none`
 * — the same promise the button rows get from the attribute.
 */
function MenuLinkRow({
  href,
  active,
  disabled,
  onNavigate,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  disabled: boolean;
  onNavigate: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      data-account-menu-item=""
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onNavigate();
      }}
      className={cn(
        ROW_CLASS,
        ACTIONABLE_ROW_CLASS,
        active && "text-primary",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

/** One person in the menu's account block. */
interface AccountRow {
  id: string;
  firstName: string;
  /** Rendered after the name; today only the parent's role word. */
  descriptor: string | null;
  /** The switch target, or null when this row is the viewer themselves. */
  target: FamilyMember | null;
}

function AccountRowItem({
  row,
  committing,
  onSwitch,
}: {
  row: AccountRow;
  committing: boolean;
  onSwitch: (target: FamilyMember) => void;
}) {
  const avatar = (
    // Hidden from the accessibility tree: the identicon labels itself "user
    // avatar", and the row already says whose it is, so leaving it exposed
    // makes every row announce as "user avatar Aino".
    <Avatar
      aria-hidden="true"
      className={cn("h-6 w-6", !row.target && "ring-2 ring-primary")}
    >
      <Identicon id={row.id} size={24} />
    </Avatar>
  );
  const descriptor = row.descriptor && (
    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
      {row.descriptor}
    </span>
  );

  const target = row.target;
  if (!target) {
    // "You are here" — a primary ring and primary text, not a greyed-out row.
    // It is a real entry in the list (`role="menuitem"`), it just cannot be
    // activated, which is what `aria-disabled` says and the absent hover
    // affordance shows.
    return (
      <div
        role="menuitem"
        aria-current="true"
        aria-disabled="true"
        className={cn(ROW_CLASS, "cursor-default")}
      >
        {avatar}
        <span className="min-w-0 truncate font-medium text-primary">
          {row.firstName}
        </span>
        {descriptor}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      data-account-menu-item=""
      disabled={committing}
      onClick={() => onSwitch(target)}
      className={cn(ROW_CLASS, ACTIONABLE_ROW_CLASS, committing && "opacity-60")}
    >
      {avatar}
      <span className="min-w-0 truncate">{row.firstName}</span>
      {descriptor}
    </button>
  );
}
