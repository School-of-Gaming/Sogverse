"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ManageBillingCardView,
  type BillingAccountSummary,
} from "@/components/billing/ManageBillingCard";
import { ParentDashboardPageBody } from "@/components/parent/parent-dashboard-page-body";
import {
  buildParentDashboardFixture,
  type ParentDashboardScenario,
} from "@/components/parent/mock-dashboard-fixtures";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";

/**
 * The parent dashboard as a parent meets it: a section per child, then the
 * parent's own section when they hold a seat themselves, one card per
 * enrollment, then billing and help.
 *
 * Every section is the real presentational component over fixtures, and no
 * action reaches a backend — the add-gamer affordances, the payment badge that
 * hangs off a failing card's corner and the lit Join are passed no-ops. Each
 * has to be *there*, looking like itself and clickable, or the page stops
 * reading as the real dashboard. Browsing the shop is the exception and needs
 * no handler: it is plain navigation to a public page, so the empty-state card
 * links there for real. Manage billing is the other kind of exception — inert
 * like the rest, but driving the card's own opening state from local state, so
 * the one thing a click really does is visible here (see below).
 *
 * The fixture is built once from the first `useNow()` value and then held in
 * state, the same way the gedu scene holds its own. Rebuilding it on every
 * 30-second tick would rebuild every schedule slot off a new `now`, so a live
 * card's session time would creep forward while somebody was looking at it — an
 * unasked-for change to painted text, and a lot of work per tick to produce it.
 * The cards' live states still follow the clock, because each card derives that
 * from `useNow()` itself; what is frozen is the schedule it is derived from,
 * which is the half a fixture is standing in for.
 */
export function ParentDashboardScene({
  scenario,
}: {
  scenario: ParentDashboardScenario;
}) {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const [fixture] = useState(() =>
    buildParentDashboardFixture(now, scenario, locale, timeZone),
  );

  return (
    <ParentDashboardPageBody
      gamers={fixture.gamers}
      self={fixture.self}
      billingCard={<FixtureBillingCard accounts={fixture.accounts} />}
      onAddGamer={noop}
      onOpenPortal={noop}
      // Both are inert *handlers* rather than omitted props, and the difference
      // is visible: an absent `onLeaveWaitlist` would draw no leave link at all,
      // and an absent `onJoinClick` would turn the lit Join back into a plain
      // link. The scene has to show the affordances a parent really meets, so
      // it passes something — and what it passes does nothing. The confirm
      // dialog in front of the leave is pure UI and works for real.
      onJoinClick={noop}
      onLeaveWaitlist={noop}
      // The seat-offer block's buttons are real, and answering leaves them in
      // the state a real answer leaves them in: committed, spinner running,
      // both disabled. On the live page the refetch that follows takes the card
      // off the waitlist band entirely, so there is nothing after that state to
      // show — and a scene that let the buttons spring back would be showing a
      // frame the disabled-state rule exists to prevent.
      onRespondToSeatOffer={acceptedForever}
    />
  );
}

/**
 * The billing card over fixtures.
 *
 * The "{child} · {club}" lines are composed here rather than in the fixture
 * module for the same reason the live card composes them in the component: they
 * are translated copy, and a pure fixture has no translator. Everything else —
 * how many buttons there are, whether the split explanation appears — falls out
 * of the account list, exactly as it does in production.
 *
 * The opening state is real local state rather than a hardcoded `false`, and
 * *not* clearing it is the point: on the live page the click is followed by a
 * full-page navigation to Stripe's portal, so the flag is set once and the
 * document unloads under it. Here nothing unloads, which is what makes the
 * disabled buttons and the button's own spinner reviewable at all — this scene
 * is the only place that state is rendered. Clicking reaches no backend; the
 * card is left in the state a click really leaves it in.
 */
function FixtureBillingCard({
  accounts,
}: {
  accounts: readonly {
    stripeCustomerId: string;
    covers: { participantFirstName: string; productName: string }[];
  }[];
}) {
  const t = useTranslations("parent.billing.manage");
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const summaries: BillingAccountSummary[] = accounts.map((account) => ({
    stripeCustomerId: account.stripeCustomerId,
    covers: account.covers.map((cover) =>
      t("coversItem", {
        name: cover.participantFirstName,
        product: cover.productName,
      }),
    ),
  }));

  return (
    <ManageBillingCardView
      accounts={summaries}
      onManage={(stripeCustomerId) => {
        setOpening(true);
        setOpeningAccountId(stripeCustomerId);
      }}
      isOpening={opening}
      openingAccountId={openingAccountId}
      error={null}
    />
  );
}

function noop() {}

/** Answers yes and then never changes anything — see the prop's note above. */
function acceptedForever() {
  return Promise.resolve("accepted" as const);
}
