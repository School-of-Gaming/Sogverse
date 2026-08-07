import type { ProductTopic } from "@/types";
import { PRODUCT_TOPICS } from "./topics";

/**
 * Resolve a topic's display label. Every topic is a brand proper noun, so this
 * is a literal lookup — identical in every locale, no i18n involved. It stays
 * hook-shaped on purpose: if a common-noun topic ever lands (the `labelKey`
 * variant described in topics.ts), resolution becomes locale-dependent again
 * and only this body changes, not its seven call sites.
 */
export function useTopicLabel(): (topic: ProductTopic) => string {
  return (topic: ProductTopic) => PRODUCT_TOPICS[topic].label;
}
