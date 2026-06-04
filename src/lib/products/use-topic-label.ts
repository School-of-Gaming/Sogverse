"use client";

import { useTranslations } from "next-intl";
import type { ProductTopic } from "@/types";
import { PRODUCT_TOPICS } from "./topics";

/**
 * Resolve a topic's display label. Games return their literal brand name
 * (Minecraft / Fortnite — never translated); subjects resolve through the
 * next-intl `topics` namespace (Webinar → webinaari / webbinarium / …).
 */
export function useTopicLabel(): (topic: ProductTopic) => string {
  const t = useTranslations("topics");
  return (topic: ProductTopic) => {
    const meta = PRODUCT_TOPICS[topic];
    return meta.kind === "game" ? meta.label : t(meta.labelKey);
  };
}
