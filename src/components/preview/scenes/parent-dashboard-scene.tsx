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
 * The parent dashboard as a parent meets it: a section per child, one card per
 * enrollment, then billing and help.
 *
 * Every section is the real presentational component over fixtures. The billing
 * card renders its idle state with the portal action inert — the section has to
 * be *there*, looking like itself, or the page stops reading as the real
 * dashboard; what it must not do is open a Stripe session.
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
      billingCard={<FixtureBillingCard accounts={fixture.accounts} />}
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
 */
function FixtureBillingCard({
  accounts,
}: {
  accounts: readonly {
    stripeCustomerId: string;
    covers: { gamerFirstName: string; productName: string }[];
  }[];
}) {
  const t = useTranslations("parent.billing.manage");

  const summaries: BillingAccountSummary[] = accounts.map((account) => ({
    stripeCustomerId: account.stripeCustomerId,
    covers: account.covers.map((cover) =>
      t("coversItem", {
        name: cover.gamerFirstName,
        product: cover.productName,
      }),
    ),
  }));

  return (
    <ManageBillingCardView
      accounts={summaries}
      onManage={noop}
      isOpening={false}
      openingAccountId={null}
      error={null}
    />
  );
}

function noop() {}
