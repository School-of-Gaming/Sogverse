"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Gamepad2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PRODUCT_TOPICS, isGameTopic } from "@/lib/products/topics";
import type { ProductTopic } from "@/types";

// "About the game" card on the product detail page. Helps a non-gamer parent
// understand the game their child will play, what (if anything) they need to
// buy, and where to get it.
//
// Renders ONLY for game topics (Minecraft editions, Fortnite); subjects like
// Webinar have no game, so the caller guards on PRODUCT_TOPICS[topic].kind.
// The brand name and PEGI rating are literals from PRODUCT_TOPICS (never
// translated); the description, "not included" note and link label come from
// the productDetail.gameInfo.games.<topic> message namespace.

export function GameInfoCard({ topic }: { topic: ProductTopic }) {
  const t = useTranslations("productDetail");

  // Subjects have no game facts — nothing to show. The caller already guards
  // on this; narrowing `topic` (not just meta) keeps the message keys below
  // off the non-existent `gameInfo.games.webinar.*` branch.
  if (!isGameTopic(topic)) return null;
  const meta = PRODUCT_TOPICS[topic];

  const g = (key: "description" | "note" | "linkLabel") =>
    t(`gameInfo.games.${topic}.${key}`);

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sections.game")}
          </h2>
          <Badge variant="secondary" className="shrink-0">
            {t("gameInfo.pegi", { age: meta.pegi })}
          </Badge>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="font-semibold">{meta.label}</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{g("description")}</p>
        </div>

        <div className="flex gap-2 rounded-md bg-info/10 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p>{g("note")}</p>
        </div>

        {"stores" in meta ? (
          // Bedrock: same game, a different store per device. List them so a
          // parent buys on the device their child will actually play on.
          // `linkLabel` reads as a heading here ("Where to get it").
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {g("linkLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {meta.stores.map((store) => (
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
          <a
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {g("linkLabel")}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
