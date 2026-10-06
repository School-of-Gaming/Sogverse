import type { Json } from "@/types/database.types";

/**
 * Cases for a landing section's button target, whose shape is checked twice —
 * by the registry's `buttonTarget` and by SQL's `landing_button_is_valid`. The
 * unit test holds the TypeScript half to each case's verdict, and the DB test
 * holds the SQL half to the same verdict on what the TypeScript half would
 * store (its trimmed output where it accepts, the raw target where it
 * refuses), so the two halves cannot drift without one of them failing.
 */
export interface ButtonTargetCase {
  name: string;
  target: Json;
  valid: boolean;
}

export const BUTTON_TARGET_CASES: readonly ButtonTargetCase[] = [
  { name: "a site path", target: { kind: "internal", path: "/shop/123" }, valid: true },
  { name: "a site path, trimmed", target: { kind: "internal", path: " /shop " }, valid: true },
  { name: "a protocol-relative path", target: { kind: "internal", path: "//evil.example" }, valid: false },
  { name: "a path without its slash", target: { kind: "internal", path: "shop" }, valid: false },
  { name: "a path with a url beside it", target: { kind: "internal", path: "/x", url: "https://e.com" }, valid: false },
  { name: "an https address", target: { kind: "external", url: "https://example.com/x" }, valid: true },
  { name: "an http address", target: { kind: "external", url: "http://example.com" }, valid: true },
  { name: "a mailto: address as a web address", target: { kind: "external", url: "mailto:hi@example.com" }, valid: false },
  { name: "a script", target: { kind: "external", url: "javascript:alert(1)" }, valid: false },
  { name: "an ftp address", target: { kind: "external", url: "ftp://example.com" }, valid: false },
  { name: "an email address", target: { kind: "email", to: "hello@sog.gg" }, valid: true },
  { name: "an email address, trimmed", target: { kind: "email", to: " First.Last+club@mail.example.co.uk " }, valid: true },
  { name: "an email without a domain", target: { kind: "email", to: "hello" }, valid: false },
  { name: "an email without a dot in its domain", target: { kind: "email", to: "hello@sog" }, valid: false },
  { name: "an email with a space", target: { kind: "email", to: "a b@sog.gg" }, valid: false },
  { name: "an email carrying its own subject", target: { kind: "email", to: "hi@sog.gg?subject=x" }, valid: false },
  { name: "an email with a subject field", target: { kind: "email", to: "hi@sog.gg", subject: "x" }, valid: false },
  { name: "an email that is not a string", target: { kind: "email", to: 3 }, valid: false },
  { name: "a kind there is none of", target: { kind: "phone", to: "+358401234567" }, valid: false },
  { name: "no kind", target: { path: "/shop" }, valid: false },
  { name: "a bare address", target: "https://example.com", valid: false },
];
