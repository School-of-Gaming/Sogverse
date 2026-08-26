"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LayoutDashboard, Loader2, LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useClickOutside } from "@/hooks/use-click-outside";
import { trackDashboardNav } from "@/lib/analytics";
import { ROLE_DASHBOARD_PATHS, ROUTES, type UserRole } from "@/lib/constants";
import { byFirstName } from "@/lib/family-order";
import { cn } from "@/lib/utils";
import {
  commitAccountSwitch,
  useFamily,
  type FamilyMember,
} from "@/services/family";

/**
 * The header avatar's dropdown: who else the viewer can be, and the two things
 * every signed-in person needs from every page (settings, and the way out).
 *
 * **The trigger avatar is the identity; the list is destinations only.** The
 * viewer's own row is deliberately absent — the masthead pattern, where the
 * face you are wearing sits on the button and the menu holds only the faces you
 * can put on instead. A row for the account you are already in is a row that
 * can never be clicked, and the question it answered ("who am I?") is answered
 * better by the avatar the reader just pressed. What that costs is an
 * accessible name: the trigger's `aria-label` carries the first name, because a
 * screen-reader user cannot see an identicon.
 *
 * Roles that share a household — parents and gamers — get one row per *other*
 * family member, so switching accounts is one click from anywhere instead of a
 * trip through the /select-profile interstitial. Admins and gedus have a single
 * profile and nobody to switch to, so their menu is the fixed rows alone.
 */

/** Roles whose menu lists a household rather than nobody. */
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

/** Added to the rows that do something when clicked — which is all of them. */
const ACTIONABLE_ROW_CLASS =
  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none";

/**
 * Every row carries `data-account-menu-item` so arrow-key navigation can find
 * it without knowing what element it happens to be (a link, a button, a
 * submit).
 *
 * The skip is deliberately narrow: only a row a *switch in flight* has taken
 * out of service is passed over, marked by `data-account-menu-blocked` (plus
 * `disabled` on the rows that are real buttons and can carry it). Keying it on
 * `aria-disabled` instead would be a selector that quietly swallows any future
 * row that is announced as unavailable for some other reason.
 */
const FOCUSABLE_ITEMS =
  "[data-account-menu-item]:not([disabled]):not([data-account-menu-blocked])";

interface AccountMenuProps {
  /** The signed-in viewer's profile id — the avatar's identicon seed. */
  userId: string;
  role: UserRole;
  /**
   * The viewer's own name. It never appears as a row; it names the trigger,
   * which is where identity lives now.
   */
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
  /**
   * The switch targets as they stood the moment the menu was opened.
   *
   * Deliberately a snapshot rather than a live read. The family list is fetched
   * on mount, so it can land while the panel is already on screen — and rows
   * inserted into an open panel would push Settings and Sign out down the list
   * on the data's own schedule, under a cursor already reaching for one. That
   * is the shift the root layout rule forbids. So an open panel keeps the row
   * set it opened with; the next open shows the fuller list.
   */
  const [openedWith, setOpenedWith] = useState<FamilyMember[]>([]);
  // Held locally and flipped synchronously before the switch call, so no row
  // re-enables between the click and the full-page navigation it causes. It is
  // deliberately never cleared on success — the document unloads instead.
  const [committing, setCommitting] = useState(false);
  /**
   * Which row was clicked, which `committing` on its own cannot say — the
   * spinner has to land on that row and no other. Set and cleared in lockstep
   * with `committing`, and for the same reason: on the success path it stays
   * set right through the unload.
   */
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  /**
   * Sign-out is a native form POST, so there is no promise to hang a flag off
   * and no error path in JS: the document either navigates or it does not. Set
   * in `onSubmit` while the submit proceeds, it renders immediately and stands
   * until the 303 unloads the page.
   */
  const [signingOut, setSigningOut] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switchToId = useId();

  /**
   * Either commit in flight takes the whole menu out of service — a second
   * click anywhere must not race the first. Both halves are set synchronously
   * and neither is cleared on success, because success is a document unload.
   */
  const busy = committing || signingOut;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * Set when the menu is opened *by an arrow key*, which has to land focus on a
   * row — but the panel is not in the DOM until the open renders, so the
   * intent is parked here and spent by the effect below.
   */
  const focusOnOpenRef = useRef<"first" | "last" | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const want = focusOnOpenRef.current;
    focusOnOpenRef.current = null;
    if (!want) return;
    // Queried inline rather than through the helper below: a function redefined
    // every render would make this effect's dependencies change every render.
    const panel = panelRef.current;
    const items = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS))
      : [];
    if (items.length === 0) return;
    (want === "first" ? items[0] : items[items.length - 1]).focus();
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
  const menuLabel = t("accountMenu", { name: firstName });

  // Who the viewer can become, in the order the menu lists them: parents first,
  // then gamers, each by first name in the viewer's locale — and never the
  // viewer themselves, who is the trigger rather than a row.
  //
  // Empty for the frames before the read lands, and empty for admins and gedus
  // whatever `family.data` says: a disabled query still reads whatever is
  // already in the cache under that key, and no household of theirs is ever
  // listed here.
  const members = wantsFamily ? (family.data ?? []) : [];
  const switchTargets = [
    ...members.filter((m) => m.role === "customer").sort(byFirstName(locale)),
    ...members.filter((m) => m.role === "gamer").sort(byFirstName(locale)),
  ].filter((m) => m.id !== userId);

  function focusableItems(): HTMLElement[] {
    const panel = panelRef.current;
    return panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS))
      : [];
  }

  /** Opening is also when the row set is snapshotted — see `openedWith`. */
  function openMenu() {
    setOpenedWith(switchTargets);
    setOpen(true);
  }

  async function handleSwitch(target: FamilyMember) {
    if (busy) return;
    setSwitchError(null);
    setCommitting(true);
    setSwitchingId(target.id);
    try {
      await commitAccountSwitch(target);
      // Both flags stay set through the unload — see their declarations.
    } catch (err) {
      setCommitting(false);
      setSwitchingId(null);
      // The reader gets the translated line; the server's own words (always
      // English, and often an HTTP status) go to the console for whoever is
      // debugging it.
      console.error("[account-menu] account switch failed:", err);
      setSwitchError(f("switchFailed"));
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
        // From outside the list, ArrowDown enters at the top and ArrowUp at
        // the bottom — spent once the panel exists.
        focusOnOpenRef.current = key === "ArrowDown" ? "first" : "last";
        openMenu();
      }
      return;
    }
    const items = focusableItems();
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

  /**
   * Tabbing past the last row leaves the component, and a panel left painted
   * over the page after focus has moved on is a menu the keyboard has no way
   * back into. React's `onBlur` is the bubbling `focusout`, so this catches
   * focus leaving any row.
   *
   * Held off while a commit is in flight: it disables the row that was just
   * clicked, which blurs it with no `relatedTarget` at all — closing there
   * would take the failure message down with the panel.
   */
  function handleFocusOut(event: React.FocusEvent<HTMLDivElement>) {
    if (!open || busy) return;
    const next = event.relatedTarget;
    if (next instanceof Node && wrapperRef.current?.contains(next)) return;
    setOpen(false);
  }

  return (
    <div
      className="relative"
      ref={wrapperRef}
      onKeyDown={handleKeyDown}
      onBlur={handleFocusOut}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // The identicon is the identity, and it says nothing to a screen
        // reader — so the name the menu no longer carries as a row is carried
        // here instead.
        aria-label={menuLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
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

      {open && (
        // `w-56` clears the 360px floor with room to spare — the header's own
        // gutter is 12px there, so the panel sits 224px inside a 360px viewport
        // and cannot push the document sideways. The widest label in any locale
        // ("Kirjaudu ulos", "Se déconnecter") is well inside that at 14px.
        //
        // The card, not the `menu` element, is what is capped and scrolled: a
        // full household is up to eight rows plus three fixed ones, which on a
        // short phone (an SE-class 667px viewport in landscape, say) would push
        // Sign out past the bottom edge — and the panel is absolutely
        // positioned inside a sticky header, so the document scroll cannot
        // reach it.
        <div className="absolute right-0 z-50 mt-1 max-h-[calc(100vh-var(--header-height)-1rem)] w-56 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
          <div ref={panelRef} role="menu" aria-label={menuLabel}>
            <MenuLinkRow
              href={dashboardPath}
              active={isOnDashboard}
              disabled={busy}
              onNavigate={() => {
                // The gedu avatar was the one avatar that linked straight to a
                // dashboard, and this row inherits that trip — so it inherits
                // the event too. No other role's avatar was ever tracked here.
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

            {/* No household in hand — a read still in flight, a read that
                failed, or a role with nobody to switch to — simply means no
                member block, heading and all. The panel still opens complete
                and at once: a trigger claiming `aria-expanded="true"` over
                nothing, for as long as a retry backs off, would leave Settings
                and the way out unreachable, and they live nowhere else on the
                page. The heading is part of this block rather than a fixed row
                precisely so it can never stand orphaned over no names. */}
            {openedWith.length > 0 && (
              <>
                <div role="separator" className="my-1 h-px bg-border" />
                {/* `group` is a valid child of `menu`; a heading element is
                    not, which is why the visible label is an `aria-hidden`
                    div and the group takes its accessible name from it by
                    reference. One string, rendered once, announced once —
                    the same move the error line makes by sitting outside the
                    menu rather than pretending to be a row. */}
                <div role="group" aria-labelledby={switchToId}>
                  {/* A parent whose household holds one child sees exactly one
                      name here, and without this heading that name reads as
                      "who I am" rather than "where I can go" — the question
                      the viewer's own row used to answer badly. */}
                  <div
                    id={switchToId}
                    aria-hidden="true"
                    className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground"
                  >
                    {t("switchTo")}
                  </div>
                  {openedWith.map((member) => (
                    <AccountRowItem
                      key={member.id}
                      member={member}
                      // The parent is the row a household can't always tell
                      // apart by name alone — a gamer looking at the list needs
                      // to know which one is the adult account. Gamers carry no
                      // descriptor; they are the default.
                      descriptor={
                        member.role === "customer" ? c("roleParent") : null
                      }
                      blocked={busy}
                      switching={switchingId === member.id}
                      onSwitch={handleSwitch}
                    />
                  ))}
                </div>
              </>
            )}

            <div role="separator" className="my-1 h-px bg-border" />

            <MenuLinkRow
              href={ROUTES.settings}
              active={isOnSettings}
              disabled={busy}
              onNavigate={() => setOpen(false)}
              icon={<Settings className="h-4 w-4 shrink-0" />}
              label={c("settings")}
            />

            {/* The canonical sign-out: a form POST the server answers with a
                303, which the browser follows as a full-page GET. No client
                fetch — the route changes cookies the browser Supabase
                singleton never sees, so only a document reload rebuilds it.

                `role="none"` because a menu's children have to be menu items
                and the form is a wrapper, not a row; it still submits
                normally.

                The row is styled exactly like My SOG and Settings — no
                destructive tint. Signing out is reversible and routine, not a
                deletion, and every menu that offers it treats it as an
                ordinary row; `destructive` in this panel is reserved for the
                one thing that actually went wrong, the failure line below.

                `onSubmit` records the commit and lets the native submit
                proceed — no `preventDefault`, no fetch. The browser stays on
                this document until the 303 comes back, so the spinner is on
                screen for the whole round trip, and there is no JS error path
                to clear it from: the page either navigates or it does not. */}
            <form
              role="none"
              method="post"
              action="/api/auth/signout"
              onSubmit={() => setSigningOut(true)}
            >
              <button
                type="submit"
                role="menuitem"
                data-account-menu-item=""
                data-account-menu-blocked={busy ? "" : undefined}
                disabled={busy}
                className={cn(ROW_CLASS, ACTIONABLE_ROW_CLASS, busy && "opacity-60")}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{c("signOut")}</span>
                {/* The spinner lands in the trailing slot, the same one the
                    member rows keep a chevron in — but this row starts with
                    that slot empty, so the mark *arrives* at the end of the
                    run rather than swapping for another. That is the placement
                    the layout rule allows: it grows leftward into the row's own
                    slack, and the icon and label already painted hold their
                    positions to the pixel. Nothing is reserved for it. It
                    inherits the row's colour, whatever that ends up being. */}
                {signingOut && (
                  <Loader2
                    aria-hidden
                    className="ml-auto h-4 w-4 shrink-0 animate-spin"
                  />
                )}
              </button>
            </form>
          </div>

          {/* A sibling of the `menu` element, not a child of it: a menu's
              children have to be menu items, and this is a message. It still
              sits last in the card, so a failed switch adds a line below
              everything already painted rather than displacing a row
              mid-list. */}
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
      data-account-menu-blocked={disabled ? "" : undefined}
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
        // Primary here means what it means everywhere else in the chrome: you
        // are on this page.
        active && "text-primary",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

/** One other member of the household — always a switch target, never the viewer. */
function AccountRowItem({
  member,
  descriptor,
  blocked,
  switching,
  onSwitch,
}: {
  member: FamilyMember;
  /** Rendered after the name; today only the parent's role word. */
  descriptor: string | null;
  /** Some commit is in flight — a switch or the sign-out — so no row acts. */
  blocked: boolean;
  /** This is the row that was clicked — it wears the spinner. */
  switching: boolean;
  onSwitch: (target: FamilyMember) => void;
}) {
  return (
    // `group` is what the chevron's nudge keys on. Nothing else in this row
    // uses one, so the unnamed group is unambiguous.
    <button
      type="button"
      role="menuitem"
      data-account-menu-item=""
      data-account-menu-blocked={blocked ? "" : undefined}
      disabled={blocked}
      onClick={() => onSwitch(member)}
      className={cn(
        ROW_CLASS,
        ACTIONABLE_ROW_CLASS,
        "group",
        // The whole row dims, spinner and chevron with it — a mark left at
        // full strength inside a dimmed row reads as still-live.
        blocked && "opacity-60",
      )}
    >
      {/* Hidden from the accessibility tree: the identicon labels itself "user
          avatar", and the row already says whose it is, so leaving it exposed
          makes every row announce as "user avatar Aino". */}
      <Avatar aria-hidden="true" className="h-6 w-6">
        <Identicon id={member.id} size={24} />
      </Avatar>
      <span className="min-w-0 truncate">{member.first_name}</span>
      {/* One right-packed trailing cluster, descriptor then chevron. Keeping
          them as a group is what lets the descriptor appear on some rows and
          not others without the chevron shifting off the right edge — and it
          is the same slot the spinner takes over, so the mark swaps in place
          and nothing in the row moves. */}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {descriptor && (
          <span className="text-xs text-muted-foreground">{descriptor}</span>
        )}
        {switching ? (
          <Loader2
            aria-hidden
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
          />
        ) : (
          <NavChevron size="sm" />
        )}
      </span>
    </button>
  );
}
