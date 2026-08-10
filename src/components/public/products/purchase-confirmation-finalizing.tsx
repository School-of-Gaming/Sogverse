"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCheckoutConfirmation } from "@/services/participations";
import { CONFIRMATION_POLL_TIMEOUT_MS } from "@/lib/constants/participations";
import { PurchaseConfirmationNotice } from "./purchase-confirmation-view";

/**
 * The waiting half of the paid confirmation page: it owns the poll and the
 * clock, and hands the markup to `PurchaseConfirmationNotice`. Keeping the two
 * apart is what lets the states be rendered from fixtures in the style guide
 * without a network call, and it puts every timing decision in one small file.
 *
 * The parent has been charged and their seat has not appeared. The webhook that
 * creates it normally lands before Stripe redirects, so getting here at all
 * means the endpoint failed or ran long. Poll for the row, and the moment it
 * exists call `router.refresh()` — re-running the page's server render rather
 * than rendering the confirmation from here, so the confirmed view has exactly
 * one code path.
 *
 * **The wait is bounded, and that bound is the point.** An unbounded poll under
 * "this only takes a moment" keeps making a promise it may never keep: if the
 * webhook is never going to succeed, the page spins until the parent gives up,
 * having told them nothing. At the timeout the poll stops and the copy changes
 * to where their signup will show up and how to reach us. The row may still land
 * afterwards — nothing here creates it — so this is a change of message, not a
 * verdict on the purchase.
 */
export function PurchaseConfirmationFinalizing({
  checkoutSessionId,
}: {
  checkoutSessionId: string;
}) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), CONFIRMATION_POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // `enabled` is what actually stops the polling — the interval lives in the
  // hook, the decision to keep waiting lives here.
  const { data } = useCheckoutConfirmation(checkoutSessionId, {
    enabled: !timedOut,
  });

  useEffect(() => {
    if (data) router.refresh();
  }, [data, router]);

  return (
    <PurchaseConfirmationNotice kind={timedOut ? "timedOut" : "finalizing"} />
  );
}
