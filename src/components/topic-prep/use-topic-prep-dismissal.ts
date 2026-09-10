"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/providers";

/**
 * Whether this viewer has finished with this enrollment's prep guide.
 *
 * **The guide is offered once and then it is gone.** A family six weeks into a
 * club has a working setup, and a card still pointing them at "create the
 * account, install the software" is spending the only affordance slot that card
 * has on something they did months ago. So the dismissal is permanent from the
 * reader's side: there is no reopen link, and nothing brings the affordance
 * back.
 *
 * **It is remembered in `localStorage` rather than on the profile**, and that is
 * a deliberate ceiling on what this feature costs: no column, no migration, no
 * route, no write path from a child's session. What is paid for it is that the
 * dismissal is per browser — the same parent on a second device is offered the
 * guide again, which is the failure mode a family barely notices and never has
 * to act on.
 *
 * **The key carries the viewer *and* the participation**, because a parent and
 * a gamer routinely share one computer and one browser profile: a parent
 * clicking "I'm ready" on the family PC must not take the guide away from the
 * child who has not read it yet. And per participation rather than per product,
 * because a second child joining the same club is a second family setup — a
 * second account, on a second machine.
 *
 * **One key per enrollment, not one blob for all of them.** Two tabs dismissing
 * two cards would have to read-modify-write the same blob, and the second write
 * would silently drop the first. Independent keys cannot race.
 */

/**
 * What this viewer's browser has told us, and what a surface may draw from it.
 *
 * `unresolved` is the state the **server** is in, and the first client paint
 * with it: a server has no `localStorage` to read, so a surface must render
 * something that is right for both answers until the browser has spoken. Once
 * an effect has run the answer is `pending` (offer the guide) or `dismissed`
 * (never mention it again).
 */
export type TopicPrepDismissalState = "unresolved" | "pending" | "dismissed";

export interface TopicPrepDismissal {
  state: TopicPrepDismissalState;
  /**
   * Record the dismissal and never offer this guide to this viewer again.
   * Called only by the affirmative button inside the dialog — closing the
   * dialog any other way leaves the affordance where it was.
   */
  dismiss: () => void;
}

/** Namespaced so the key says what it is when somebody opens dev tools. */
const STORAGE_PREFIX = "sog:topic-prep-dismissed";

/**
 * The viewer half of the key when nobody is signed in — a preview scene with no
 * fixture user, and nothing else, since every surface that draws an enrollment
 * card is behind a role gate. Stable rather than random, so a preview's own
 * dismissal survives a reload and the affordance can be judged in both states.
 */
const ANONYMOUS_VIEWER = "anonymous";

/**
 * The key one viewer's dismissal of one enrollment is stored under.
 *
 * Exported because a fixture surface seeds keys it has no hook to ask for them
 * — see `seedTopicPrepDismissals` — and because a key spelled twice is a key
 * that can be spelled differently twice.
 */
export function topicPrepDismissalKey(
  viewerId: string | null,
  participationId: string,
): string {
  return `${STORAGE_PREFIX}:${viewerId ?? ANONYMOUS_VIEWER}:${participationId}`;
}

/**
 * **Every read and write is wrapped, and a throw means "not dismissed".** A
 * browser can refuse storage outright (Safari's private mode has thrown on
 * write, an embedded webview can have site data blocked, a quota can be full),
 * and the honest fallback is the state that shows the guide: offering a family
 * a guide they have already read costs one click, and swallowing it costs them
 * the setup instructions.
 */
function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeStored(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Nothing to do and nothing to say: the tab's own memory below has already
    // recorded it, so the affordance goes away for this visit. The family meets
    // it again next time, which is the same outcome a cleared browser gives.
  }
}

/**
 * **The keys this tab knows are dismissed, layered over `localStorage`.**
 *
 * It exists for two things storage alone cannot do. First, a refused write —
 * private mode, blocked site data, a full quota — must still put the affordance
 * away for the reader who just answered the dialog, or the button lands back
 * under their cursor. Second, `storage` events fire only in *other* tabs, so
 * the tab that dismissed has nothing to hear; this set's own listeners are what
 * tell every hook instance on the page, which matters because a parent's
 * dashboard can show the same guide under two cards' worth of state at once.
 *
 * A module-level store rather than per-hook state, which is the other half of
 * why: state held inside one hook could not outlive its own key, so a hook
 * whose viewer or participation changed carried the previous card's answer over
 * to the next one.
 */
const dismissedHere = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function isDismissed(key: string): boolean {
  return dismissedHere.has(key) || readStored(key);
}

/**
 * **The store is `localStorage` plus this tab's own memory, so the hook reads
 * it the way React reads any external store**, rather than seeding state and
 * syncing it in an effect. The server snapshot is `null` — the honest answer
 * for a machine with no browser storage — so the server's HTML and the first
 * client paint agree by construction, and React re-reads for real immediately
 * after hydrating.
 *
 * Both sources are subscribed to: the store's own listeners for this tab (a
 * dismissal here, or a fixture seeding one), and `storage` for the others, so a
 * second tab showing the same card stops offering the guide the moment this one
 * finishes with it.
 */
function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * Mark these keys dismissed for this tab, without writing anything down.
 *
 * For fixture surfaces: the style guide draws several enrollment cards whose
 * point is a state other than "there is a guide to read", and an undismissed
 * guide would take the locked Join's slot on every one of them and show a demo
 * of the wrong thing. Seeding replaces the whole set, so a fixture states what
 * this tab remembers rather than adding to whatever a previous one left.
 *
 * Memory only, so a demo never touches a real family's storage — and a no-op on
 * the server, because a module-level set on a server is shared by every request
 * that touches it.
 */
export function seedTopicPrepDismissals(keys: readonly string[]): void {
  if (typeof window === "undefined") return;
  dismissedHere.clear();
  for (const key of keys) dismissedHere.add(key);
  notify();
}

/**
 * Forget one key outright — this tab's memory *and* what the browser wrote.
 *
 * The other half of a fixture surface's needs: a demo whose whole subject is
 * the affordance has to draw it on every visit, and an admin who answered its
 * dialog once would otherwise have dismissed that demo for good.
 */
export function forgetTopicPrepDismissal(key: string): void {
  if (typeof window === "undefined") return;
  dismissedHere.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same wrapping as every other access, and the same fallback: a browser
    // that will not let us remove it is a browser we cannot have written to.
  }
  notify();
}

export function useTopicPrepDismissal(
  participationId: string,
): TopicPrepDismissal {
  const { user } = useAuth();
  const key = topicPrepDismissalKey(user?.id ?? null, participationId);

  const stored = useSyncExternalStore(
    subscribe,
    useCallback(() => isDismissed(key), [key]),
    // No storage on the server, and no pretending otherwise: `null` is the
    // third state, and it is what stops the first paint from claiming an
    // answer the machine that drew it could not have had.
    () => null,
  );

  const state: TopicPrepDismissalState =
    stored === null ? "unresolved" : stored ? "dismissed" : "pending";

  const dismiss = useCallback(() => {
    dismissedHere.add(key);
    writeStored(key);
    notify();
  }, [key]);

  return { state, dismiss };
}
