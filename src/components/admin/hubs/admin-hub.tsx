"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { HubTabs } from "@/components/ui/hub-tabs";
import { ADMIN_HUBS, type AdminHubId } from "./admin-hubs";

/**
 * A hub page: the hub's title, its tab strip, the tab's one-line description,
 * then the tab's own content.
 *
 * **The title and the strip are identical on every tab of a hub**, to the
 * pixel, so moving between tabs moves neither: anything one tab has and
 * another does not — a create button, a month stepper — belongs in `action` or
 * `children`, below the strip. Both wait on nothing, so a route renders them
 * over its loading and failure states as well.
 *
 * **Every tab states what it is in one line, and the hub draws that line**, so
 * no tab can set its description in a style of its own. A tab's create control
 * is its `action`, ending on the line's right edge.
 *
 * The hub reserves the document scrollbar's gutter for all its tabs at once,
 * because pages a reader moves between from one strip have to agree on it.
 */
export function AdminHub({
  hub,
  description,
  action,
  children,
}: {
  hub: AdminHubId;
  /** The tab's one-line description, translated. */
  description: string;
  /** The tab's create control, beside its description. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("adminHubs");
  const title = t(`titles.${hub}`);

  return (
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="space-y-4">
        <Heading level={1} step="section">
          {title}
        </Heading>
        <HubTabs
          label={title}
          tabs={ADMIN_HUBS[hub].tabs.map((tab) => ({
            href: tab.href,
            label: t(`tabs.${tab.id}`),
          }))}
        />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-muted-foreground">{description}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
