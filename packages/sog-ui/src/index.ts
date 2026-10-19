/**
 * `@sog/ui` — School of Gaming's UI language.
 *
 * The foundations tier — the colour and type tokens, the contrast measurements
 * that decide how they may be spent, and the tone grammar that says which fact
 * takes which family — and the primitives built on it, the only tier that
 * writes a colour, type, border or state class. Patterns and chrome come next;
 * nothing above the primitives exists yet, so there is nothing above them to
 * export.
 *
 * The generated stylesheet is a separate entry point (`@sog/ui/theme.css`) so a
 * consumer imports it from CSS and never from TypeScript.
 */

export * from "./tokens/brand";
export * from "./tokens/class-merge";
export * from "./tokens/contrast";
export * from "./tokens/grammar";
export * from "./tokens/identicon";
export * from "./tokens/picks";
export * from "./tokens/surfaces";
export * from "./tokens/typography";

export * from "./components/heading";
