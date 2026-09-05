/**
 * `@sog/ui` — School of Gaming's UI language.
 *
 * Phase 1 and 2 ship the foundations tier only: the colour and type tokens, and
 * the contrast measurements that decide how they may be spent. Primitives,
 * patterns and chrome come next; nothing above the foundations exists yet, so
 * there is nothing above the foundations to export.
 *
 * The generated stylesheet is a separate entry point (`@sog/ui/theme.css`) so a
 * consumer imports it from CSS and never from TypeScript.
 */

export * from "./tokens/brand";
export * from "./tokens/composite";
export * from "./tokens/contrast";
export * from "./tokens/typography";
