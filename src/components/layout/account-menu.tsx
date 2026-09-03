"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  switchGateFor,
  useFamily,
  useSessionProvenance,
  type FamilyMember,
  type SwitchAccountCredentials,
  type SwitchGate,
} from "@/services/family";
// The module, not the family barrel: the header mounts on every page for every
// role, and the barrel would drag the profile selector and the add-gamer form
// into that bundle for the sake of one dialog most viewers never open.
import {
  SwitchGateDialog,
  type SwitchGateMode,
} from "@/components/family/SwitchGateDialog";

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

/**
 * One row of the household, with what reaching that person costs.
 *
 * The gate travels *with* the row because both are snapshotted together when
 * the menu opens — see `openedWith`. A gate that arrived into an open panel
 * would change a row's height (an unreachable sibling grows a second line) and
 * push everything below it down on the data's own schedule.
 */
interface SwitchRow {
  member: FamilyMember;
  gate: SwitchGate;
}

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
  const [openedWith, setOpenedWith] = useState<SwitchRow[]>([]);
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
  /**
   * The switch a gate is standing in front of — the target, and which
   * credential it costs. Non-null exactly while the gate dialog is open.
   *
   * The menu closes when this is set: the gate is a modal over the page, and a
   * panel left painted behind it is a second set of rows the reader can no
   * longer reach. Coming back from a cancelled gate means opening the menu
   * again, which is also what re-snapshots the household.
   */
  const [gated, setGated] = useState<{
    member: FamilyMember;
    mode: SwitchGateMode;
  } | null>(null);
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
  /**
   * The row a failed switch has to hand focus back to. Parked here rather than
   * focused on the spot, because at the moment the failure lands that row is
   * still disabled — see the effect that spends it.
   */
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  /** The failure line, for the scroll-into-view effect below. */
  const errorRef = useRef<HTMLParagraphElement>(null);
  /**
   * `open` and `busy` as of the last *committed* render, for one reader: the
   * focus-out guard. See `handleFocusOut` for why that guard cannot read them
   * from its own closure. A layout effect rather than `useEffect` because the
   * guard's decision is made in a microtask, and passive effects are flushed
   * on a later task than that.
   */
  const openRef = useRef(open);
  const busyRef = useRef(busy);
  useLayoutEffect(() => {
    openRef.current = open;
    busyRef.current = busy;
  });

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

  /**
   * Focus the commit took away, handed back. Disabling the clicked row blurs
   * it to `<body>`, and a failure that merely re-enables the row leaves the
   * keyboard outside the panel: arrow keys would re-enter at the top, and a
   * screen-reader user has no way back to the line that just explained what
   * went wrong.
   *
   * Keyed on `committing` rather than on the error text: two identical
   * failures in a row set the same string, React bails out of that update, and
   * an effect watching the message would never run the second time.
   */
  useEffect(() => {
    if (committing) return;
    const row = restoreFocusRef.current;
    if (!row) return;
    restoreFocusRef.current = null;
    // The panel is rebuilt from a fresh snapshot on every open, so the row can
    // be gone by the time this runs. The trigger always exists.
    if (row.isConnected) row.focus();
    else triggerRef.current?.focus();
  }, [committing]);

  /**
   * The failure line is appended last inside a card that caps its height and
   * scrolls, so on a full household already scrolled down it can land below
   * the fold — a failed switch would then produce no visible change at all.
   * Appending at the end and scrolling *down* to it is what keeps this inside
   * the layout rules: nothing already painted moves, and `block: "nearest"`
   * scrolls the panel only as far as it takes.
   *
   * **Declared after the focus-restore effect on purpose**: both run in the
   * same commit, so whichever scrolls last decides where the panel rests, and
   * the message is the thing the reader has to see. Reordering these two
   * silently scrolls back to the row instead.
   */
  useEffect(() => {
    if (!switchError) return;
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [switchError]);

  // Fetched on mount rather than on open, so the menu opens with its family
  // rows already in hand. Held back entirely for admins and gedus:
  // /api/family/list is gated to customers and gamers and would 403 for them
  // on every navigation.
  const wantsFamily = listsFamily(role);
  const family = useFamily({ enabled: wantsFamily });
  /**
   * Where this session came from, out of the same cache entry as the list above
   * — one request answers both. `null` until it lands, and the gate helper
   * reads that as "wait", never as "no gate": a gamer's rows stay out of service
   * until the answer is in, because guessing either way prompts for a credential
   * the route will not accept.
   */
  const provenance = useSessionProvenance({ enabled: wantsFamily });

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
  const switchRows: SwitchRow[] = [
    ...members.filter((m) => m.role === "customer").sort(byFirstName(locale)),
    ...members.filter((m) => m.role === "gamer").sort(byFirstName(locale)),
  ]
    .filter((m) => m.id !== userId)
    // One helper decides the gate for all three switch surfaces, so the rule
    // lives once and this row only has to render the answer.
    .map((member) => ({
      member,
      gate: switchGateFor(role, provenance.data, member),
    }));

  function focusableItems(): HTMLElement[] {
    const panel = panelRef.current;
    return panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS))
      : [];
  }

  /** Opening is also when the row set is snapshotted — see `openedWith`. */
  function openMenu() {
    // A failure belongs to the switch that produced it, not to the panel. The
    // panel unmounts on close but this state does not, so without clearing it
    // an open minutes later would be greeted by an alert about something the
    // reader has long since moved on from.
    setSwitchError(null);
    setOpenedWith(switchRows);
    setOpen(true);
  }

  /**
   * A row was activated. Where the switch costs nothing it commits on the spot,
   * exactly as it always has; where it costs a credential the menu hands over
   * to the gate dialog and closes behind it. A row the gate says is unreachable
   * (or not yet decidable) never gets here — it is announced unavailable and
   * its click is guarded.
   */
  function handleActivate(row: SwitchRow, clickedRow: HTMLElement) {
    if (busy) return;
    const { kind } = row.gate;
    if (kind === "pin" || kind === "password") {
      setSwitchError(null);
      setGated({ member: row.member, mode: kind });
      setOpen(false);
      return;
    }
    if (kind !== "none") return;
    void handleSwitch(row.member, clickedRow);
  }

  async function handleSwitch(target: FamilyMember, clickedRow: HTMLElement) {
    if (busy) return;
    setSwitchError(null);
    setCommitting(true);
    setSwitchingId(target.id);
    try {
      await commitAccountSwitch(target);
      // Both flags stay set through the unload — see their declarations.
    } catch (err) {
      // Parked, not focused: the row is still disabled at this instant, and
      // focusing a disabled element does nothing. The effect above spends it
      // once the re-render has made the row a focusable element again.
      restoreFocusRef.current = clickedRow;
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
   * **The decision is deferred to a microtask and made from refs, never from
   * this render's `open`/`busy`.** Clicking a member row flips `committing`
   * synchronously, so React commits `disabled` onto the very button that has
   * focus — and the browser answers that *inside the mutation phase* with a
   * synchronous `focusout` carrying no `relatedTarget` at all. React dispatches
   * it into the handler belonging to the render before the commit, where
   * `busy` is still false, so a guard reading the closure closes the panel at
   * the exact moment of the commit: the failure line is never seen on one path
   * and the sign-out spinner never appears on the other. A layout effect is no
   * better a source, because it too runs after the mutation phase this event
   * fires inside. A microtask runs once the whole commit is behind us, so by
   * then the refs say what is actually true.
   *
   * `relatedTarget` is read synchronously because it is only valid on the
   * event; where the browser supplies none, the landing spot is taken from
   * `document.activeElement`, which in the disabled-row case above is `<body>`
   * — which is precisely why the `busy` guard is the half doing the work.
   * Focus genuinely leaving the component still closes the panel.
   */
  function handleFocusOut(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    queueMicrotask(() => {
      if (!openRef.current || busyRef.current) return;
      const landed = next ?? document.activeElement;
      if (landed && wrapperRef.current?.contains(landed)) return;
      setOpen(false);
    });
  }

  return (
    // The gate dialog is a *sibling* of the menu wrapper, never a child of it.
    // A portal still bubbles its events through the React tree it was rendered
    // in, so a dialog mounted inside the wrapper would hand every arrow key
    // typed at the PIN pad to the menu's own key handler — which, with the menu
    // closed, answers ArrowDown by opening the panel behind the dialog.
    <>
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
                  // The event answers: who (role), from where, and which of the
                  // two chrome affordances — the logo or this row. Every role
                  // emits; the gedu-only "avatar" series ended when the avatar
                  // became the menu trigger (see DashboardNavMethod).
                  trackDashboardNav({
                    role,
                    method: "account_menu",
                    from: pathname,
                  });
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
                    {openedWith.map((row) => (
                      <AccountRowItem
                        key={row.member.id}
                        member={row.member}
                        gate={row.gate}
                        // The parent is the row a household can't always tell
                        // apart by name alone — a gamer looking at the list needs
                        // to know which one is the adult account. Gamers carry no
                        // descriptor; they are the default.
                        descriptor={
                          row.member.role === "customer" ? c("roleParent") : null
                        }
                        // Why a sibling cannot be reached, under their name.
                        // Long enough that it cannot ride in the trailing
                        // cluster without squeezing the name out of the row.
                        unreachableNote={f("switchGate.unreachable")}
                        blocked={busy}
                        switching={switchingId === row.member.id}
                        onActivate={handleActivate}
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
              <p
                ref={errorRef}
                role="alert"
                className="px-3 pb-1 pt-2 text-xs text-destructive"
              >
                {switchError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Mounted only while a gate is standing, so its state — the digits
          typed, the wrong-password line — is discarded when it closes rather
          than waiting to greet the next switch. */}
      {gated && (
        <SwitchGateDialog
          open
          onOpenChange={(next) => {
            if (!next) setGated(null);
          }}
          target={gated.member}
          mode={gated.mode}
          onCommit={(credentials: SwitchAccountCredentials) =>
            commitAccountSwitch(gated.member, credentials)
          }
        />
      )}
    </>
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
  gate,
  descriptor,
  unreachableNote,
  blocked,
  switching,
  onActivate,
}: {
  member: FamilyMember;
  /** What reaching this person costs, decided once by `switchGateFor`. */
  gate: SwitchGate;
  /** Rendered after the name; today only the parent's role word. */
  descriptor: string | null;
  /** Why an unreachable sibling cannot be switched into. */
  unreachableNote: string;
  /** Some commit is in flight — a switch or the sign-out — so no row acts. */
  blocked: boolean;
  /** This is the row that was clicked — it wears the spinner. */
  switching: boolean;
  /**
   * Handed the row element as well as the row: a failed switch has to give
   * focus back to the button that was pressed, and only the click knows which
   * one that was.
   */
  onActivate: (row: SwitchRow, element: HTMLElement) => void;
}) {
  /**
   * The sibling holds no password of their own, so an own session has nothing
   * it could type. Still listed — the family is the family — and announced
   * unavailable through `aria-disabled` rather than the `disabled` attribute,
   * which is what keeps it reachable by keyboard: a row nobody can focus is a
   * row whose explanation nobody hears. The arrow-key traversal deliberately
   * keys its skip on the in-flight marker and not on `aria-disabled`, so this
   * row stays in the run.
   */
  const unreachable = gate.kind === "unreachable";
  /** The gate is not decidable yet. Transient, and out of service until it is. */
  const pending = gate.kind === "unknown";
  const inert = blocked || pending;
  return (
    // `group` is what the chevron's nudge keys on. Nothing else in this row
    // uses one, so the unnamed group is unambiguous.
    <button
      type="button"
      role="menuitem"
      data-account-menu-item=""
      data-account-menu-blocked={inert ? "" : undefined}
      disabled={inert}
      aria-disabled={unreachable || undefined}
      onClick={(event) => {
        if (unreachable) return;
        onActivate({ member, gate }, event.currentTarget);
      }}
      className={cn(
        ROW_CLASS,
        unreachable ? "cursor-default" : ACTIONABLE_ROW_CLASS,
        "group",
        // The whole row dims, spinner and chevron with it — a mark left at
        // full strength inside a dimmed row reads as still-live.
        (inert || unreachable) && "opacity-60",
      )}
    >
      {/* Hidden from the accessibility tree: the identicon labels itself "user
          avatar", and the row already says whose it is, so leaving it exposed
          makes every row announce as "user avatar Aino". */}
      <Avatar aria-hidden="true" className="h-6 w-6">
        <Identicon id={member.id} size={24} />
      </Avatar>
      {/* The name, and under it the reason this row cannot be taken. The note
          lives here rather than in the trailing cluster because that cluster
          never shrinks: a sentence there would squeeze the name it explains
          out of the row entirely. */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{member.first_name}</span>
        {unreachable && (
          <span className="truncate text-xs text-muted-foreground">
            {unreachableNote}
          </span>
        )}
      </span>
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
          // The chevron marks a switch. An unreachable row is not one, so it
          // carries none — and the note below the name takes the space back.
          !unreachable && <NavChevron size="sm" />
        )}
      </span>
    </button>
  );
}
