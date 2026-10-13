"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { HubTabs } from "@/components/ui/hub-tabs";
import { ADMIN_HUBS, type AdminHubId } from "./admin-hubs";

/**
 * A hub page: the hub's title, its tab strip, then the tab's own content.
 *
 * **The title and the strip are identical on every tab of a hub**, to the
 * pixel, so moving between tabs moves neither: anything one tab has and
 * another does not — a description, a create button, a month stepper — belongs
 * in `children`, below the strip. Both wait on nothing, so a route renders
 * them over its loading and failure states as well.
 *
 * The hub reserves the document scrollbar's gutter for all its tabs at once,
 * because pages a reader moves between from one strip have to agree on it.
 */
export function AdminHub({
  hub,
  children,
}: {
  hub: AdminHubId;
  children: ReactNode;
}) {
  const t = useTranslations("adminHubs");
  const title = t(`titles.${hub}`);

  return (
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <HubTabs
          label={title}
          tabs={ADMIN_HUBS[hub].tabs.map((tab) => ({
            href: tab.href,
            label: t(`tabs.${tab.id}`),
          }))}
        />
      </div>
      {children}
    </div>
  );
}
