"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_TOPICS } from "@/lib/products/topics";
import type { TopicMeta } from "@/lib/products/topics";
import type { ProductTopic } from "@/types";

// "About {name}" card on the product detail page. Helps a non-gamer parent
// understand what their child will be playing or building in, what (if
// anything) they need to buy or install, and where to get it.
//
// The render condition is the topic's `info` block: present ⇒ the card
// renders, absent ⇒ null. That presence — not any game/subject category — is
// the whole contract, which is why the lookup is typed through `TopicMeta`
// (the declared shape with `info` optional) rather than the const map's
// literal entries. The heading interpolates the brand label ("About Minecraft
// Java", "About Roblox Studio"); the PEGI badge only renders for topics that
// carry a rating (Roblox Studio is a creation tool and has none). The label
// and the info facts are literals from PRODUCT_TOPICS (never translated); the
// description, needs/costs note and link label come from the
// productDetail.topicInfo.topics.<topic> namespace.

export function TopicInfoCard({ topic }: { topic: ProductTopic }) {
  const t = useTranslations("productDetail");
  const meta: TopicMeta = PRODUCT_TOPICS[topic];
  const { info } = meta;

  if (!info) return null;

  const p = (key: "description" | "note" | "linkLabel") =>
    t(`topicInfo.topics.${topic}.${key}`);

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("topicInfo.heading", { name: meta.label })}
          </h2>
          {info.pegi !== undefined && (
            <Badge variant="secondary" className="shrink-0">
              {t("topicInfo.pegi", { age: info.pegi })}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{p("description")}</p>

        <div className="flex gap-2 rounded-md bg-info/10 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p>{p("note")}</p>
        </div>

        {info.stores ? (
          // Bedrock, Pokémon GO: the same software installed from a different
          // store per device. List them so a parent buys on the device their
          // child will actually use. `linkLabel` reads as a heading here
          // ("Where to get it").
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {p("linkLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {info.stores.map((store) => (
                <a
                  key={store.name}
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium text-primary hover:bg-muted"
                >
                  {store.name}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        ) : (
          info.url !== undefined && (
            <a
              href={info.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {p("linkLabel")}
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          )
        )}
      </CardContent>
    </Card>
  );
}
