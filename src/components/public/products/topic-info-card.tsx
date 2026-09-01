"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_TOPICS, topicHasInfoCard } from "@/lib/products/topics";
import type { TopicMetaWithInfoCard } from "@/lib/products/topics";
import type { ProductTopic } from "@/types";

// "About {name}" card on the product detail page. Helps a non-gamer parent
// understand what their child will be playing or building in, what (if
// anything) they need to buy or install, and where to get it.
//
// The render condition is `topicHasInfoCard` — the topic's `info` block:
// present ⇒ the card renders, absent ⇒ null. That presence, not any
// game/subject category, is the whole contract. It is asked through the shared
// predicate rather than off the map directly, because the product page decides
// the same question one level up (whether to render this card's grid wrapper at
// all, since an empty wrapper still costs a gap in the reading column) and the
// two must not drift. The predicate narrows the topic as well as answering,
// which is what lets the message keys below resolve: only card-bearing topics
// have prose under productDetail.topicInfo.topics.
//
// The heading interpolates the brand label ("About Minecraft Java", "About
// Roblox Studio"); the PEGI badge only renders for topics that carry a rating
// (Roblox Studio is a creation tool and has none). The label and the info facts
// are literals from PRODUCT_TOPICS (never translated); the description,
// needs/costs note and link label come from the message catalog.

export function TopicInfoCard({ topic }: { topic: ProductTopic }) {
  const t = useTranslations("productDetail");

  if (!topicHasInfoCard(topic)) return null;

  // Widened from the const map's literal entry: `info` is known present now,
  // but which of `url` / `stores` a given topic carries is not the card's
  // business — it renders whichever is there.
  const meta: TopicMetaWithInfoCard = PRODUCT_TOPICS[topic];
  const { info } = meta;

  const p = (key: "description" | "note" | "linkLabel") =>
    t(`topicInfo.topics.${topic}.${key}`);

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          {/* Never `uppercase` here, whatever the neighbouring labels do: the
              heading interpolates a brand literal, and CSS `uppercase` would
              mangle the casing the brand rule protects ("Pokémon GO" → "POKÉMON
              GO"). A card heading is the page speaking, so it is sentence case
              anyway and matches the overview card beside it — but the reason it
              can never go back stands on its own. */}
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("topicInfo.heading", { name: meta.label })}
          </h2>
          {info.pegi !== undefined && (
            <Badge variant="secondary" className="shrink-0">
              {t("topicInfo.pegi", { age: info.pegi })}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{p("description")}</p>

        <div className="flex gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-yty-wit-soft" />
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
