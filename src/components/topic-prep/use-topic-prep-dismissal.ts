"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
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

function storageKey(viewerId: string, participationId: string): string {
  return `${STORAGE_PREFIX}:${viewerId}:${participationId}`;
}

/**
 * **Every read and write is wrapped, and a throw means "not dismissed".** A
 * browser can refuse storage outright (Safari's private mode has thrown on
 * write, an embedded webview can have site data blocked, a quota can be full),
 * and the honest fallback is the state that shows the guide: offering a family
 * a guide they have already read costs one click, and swallowing it costs them
 * the setup instructions.
 */
function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Nothing to do and nothing to say: the dialog still closes and the
    // affordance still goes away for this render. The family meets it again on
    // their next visit, which is the same outcome a cleared browser gives.
  }
}

/**
 * **The store is `localStorage`, so the hook reads it the way React reads an
 * external store**, rather than seeding state and syncing it in an effect. The
 * server snapshot is `null` — the honest answer for a machine with no browser
 * storage — so the server's HTML and the first client paint agree by
 * construction, and React re-reads for real immediately after hydrating.
 *
 * Subscribing to `storage` is what the other half of the contract buys: a
 * second tab showing the same card stops offering the guide the moment this one
 * finishes with it. (That event fires only in *other* tabs, which is why the
 * tab doing the dismissing does not lean on it — see below.)
 */
function subscribeToStorage(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function useTopicPrepDismissal(
  participationId: string,
): TopicPrepDismissal {
  const { user } = useAuth();
  const key = storageKey(user?.id ?? ANONYMOUS_VIEWER, participationId);

  const stored = useSyncExternalStore(
    subscribeToStorage,
    useCallback(() => readDismissed(key), [key]),
    // No storage on the server, and no pretending otherwise: `null` is the
    // third state, and it is what stops the first paint from claiming an
    // answer the machine that drew it could not have had.
    () => null,
  );

  /**
   * **This render's own answer, held so the affordance can never survive the
   * click that dismissed it.** A browser may refuse the write — private mode,
   * blocked site data, a full quota — and reading the store back would then say
   * "still pending" and put the button straight back under the reader's cursor.
   * Held per hook rather than in a module cache, so a fresh visit genuinely
   * re-reads storage and a refused write costs exactly what it should: the
   * offer comes back next time, not this time.
   */
  const [dismissedHere, setDismissedHere] = useState(false);

  const state: TopicPrepDismissalState =
    dismissedHere || stored === true
      ? "dismissed"
      : stored === null
        ? "unresolved"
        : "pending";

  const dismiss = useCallback(() => {
    setDismissedHere(true);
    writeDismissed(key);
  }, [key]);

  return { state, dismiss };
}
