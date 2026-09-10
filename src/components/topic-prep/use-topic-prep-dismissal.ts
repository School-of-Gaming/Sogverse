"use client";

import { useCallback, useState } from "react";
import { getCookie, setCookie } from "@/lib/cookies";
import { useAuth } from "@/providers";
import {
  TOPIC_PREP_COOKIE_MAX_AGE_SECONDS,
  TOPIC_PREP_COOKIE_NAME,
  parseTopicPrepReadyCookie,
  serialiseTopicPrepReady,
  topicPrepReadyKey,
} from "./topic-prep-cookie";

/**
 * Whether this viewer has finished with this enrolment's prep guide, and the
 * one act that says so.
 *
 * **The guide is offered once and then it is gone.** A family six weeks into a
 * club has a working setup, and a card still pointing them at "create the
 * account, install the software" is spending the only affordance slot that card
 * has on something they did months ago. So the dismissal is permanent from the
 * reader's side: there is no reopen link, and nothing brings the affordance
 * back.
 *
 * **The answer arrives as a prop, not from this hook.** It is parsed out of the
 * cookie on the server, where the page is rendered, and handed down to the card
 * — so the server's HTML and the first client render agree about every footer
 * and nothing swaps after hydration. What the hook adds is the other half of
 * the round trip: the write, plus the local state that makes the card change
 * under the reader's own click without waiting for a navigation.
 *
 * It is a cookie rather than a profile column for the same reason it was once
 * `localStorage`: no migration, no route, no write path from a child's session,
 * and the whole feature stays a rendering decision. What that costs is that a
 * second device is offered the guide again, which is a click.
 */
export interface TopicPrepDismissal {
  /** True once this viewer has said they are ready — stored, or just said. */
  ready: boolean;
  /**
   * Record it and never offer this guide to this viewer again. Called only by
   * the affirmative button inside the dialog — closing the dialog any other way
   * leaves the affordance exactly where it was.
   */
  markReady: () => void;
}

/**
 * Append one key to the stored value, merging with whatever is there now.
 *
 * **Read-modify-write against `document.cookie` on every call, deliberately.**
 * A dashboard draws many cards over one cookie, and a value captured at render
 * time would let the second answer of a visit overwrite the first. Reading at
 * write time makes two dismissals a second apart independent.
 *
 * Wrapped, and a throw means nothing was stored: a browser can refuse cookies
 * outright, and the honest fallback is the state that shows the guide again
 * next time. The reader's own click has already put the affordance away for
 * this visit through the local state below, so nothing lands back under their
 * cursor.
 */
function rememberReady(key: string): void {
  try {
    const keys = parseTopicPrepReadyCookie(
      getCookie(TOPIC_PREP_COOKIE_NAME),
    );
    if (keys.includes(key)) return;
    setCookie(
      TOPIC_PREP_COOKIE_NAME,
      serialiseTopicPrepReady([...keys, key]),
      { maxAge: TOPIC_PREP_COOKIE_MAX_AGE_SECONDS },
    );
  } catch {
    // Nothing to do and nothing to say — see above.
  }
}

/**
 * @param participationId the enrolment this card is about
 * @param readyFromCookie the server's parse of the cookie, already scoped to
 *   this viewer: `true` when this enrolment is in it
 */
export function useTopicPrepDismissal(
  participationId: string,
  readyFromCookie: boolean,
): TopicPrepDismissal {
  const { user } = useAuth();
  // Answered *here*, this visit. Kept separate from the seeded value rather
  // than initialising state from it, so a refetch that re-renders the card with
  // a fresh seed cannot un-answer a dialog the reader has just answered — and
  // so the two facts stay legible: what the browser remembers, and what just
  // happened. Every list keys its cards by participation id, so this state
  // cannot outlive the enrolment it belongs to.
  const [saidReady, setSaidReady] = useState(false);

  const markReady = useCallback(() => {
    setSaidReady(true);
    rememberReady(topicPrepReadyKey(user?.id ?? null, participationId));
  }, [user?.id, participationId]);

  return { ready: readyFromCookie || saidReady, markReady };
}
