/// <reference types="vite/client" />
// Declared here rather than in tsconfig's `types`: `import.meta.glob` is Vite's,
// and this is the only file in the repo that uses it. A project-wide types entry
// would put Vite's ambient declarations in front of every source file to serve
// one test.
import { describe, it, expect, beforeAll } from "vitest";
import { templateRegistry } from "@/lib/email-templates/registry";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { buildPinResetEmail } from "@/lib/email-templates/pin-reset";
import { BRAND, DARK_THEME, GRADIENT } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";

/**
 * The house style, enforced mechanically over the rendered output of every mail
 * this codebase can send.
 *
 * **Why the output and not the source.** Every rule here was already written
 * down, and prose did not hold: the two mails whose buttons were missing both
 * Gmail workarounds were missing them for months, in a directory whose own doc
 * described both fixes as done. A source-level check would not have caught it
 * either, because those buttons were built from the correct constants — they
 * simply never called the helper. What is wrong with a mail is a property of
 * what leaves the building, so that is what gets asserted.
 *
 * **Why it discovers rather than lists.** A check naming the mails it covers is
 * a check that silently stops covering the next one. The completeness test below
 * walks the directory's modules and fails when one builds a mail nothing here
 * renders — and fails the other way too, so a deleted builder cannot leave a
 * stale entry behind. That pairing is the idiom the API route posture registry
 * and the db authorization spine already use, and it is here because the
 * unregistered builder is precisely where the bug lived.
 */

/** Every colour a mail is allowed to emit. */
const PALETTE = new Set(
  [...Object.values(BRAND), ...Object.values(DARK_THEME), ...Object.values(GRADIENT)].map((hex) =>
    hex.toLowerCase(),
  ),
);

const RADII = new Set(Object.values(RADIUS));

/**
 * A brand fill and the only foreground allowed on it. The pairing is the single
 * most tempting wrong edit in the email directory — copy a working button,
 * change its fill, keep its label — and the two brand colours are mirror images,
 * so the result is unreadable rather than merely off-brand.
 */
const LEGAL_ON_FILL: Record<string, string> = {
  [BRAND.primary.toLowerCase()]: BRAND.primaryForeground.toLowerCase(),
  [BRAND.secondary.toLowerCase()]: BRAND.secondaryForeground.toLowerCase(),
};

/** Fixture params for the registry-backed renders. */
const PARAMS: Record<string, Record<string, string | boolean | null>> = {
  componentsReference: {},
  passwordReset: { resetLink: "https://sogverse.sog.gg/reset-password?code=abc123" },
  feedback: {
    userName: "Marja Virtanen",
    userRole: "customer",
    userEmail: "marja@example.com",
    message: "Great product!",
  },
  welcomeParent: {
    firstName: "Marja",
    verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
    dashboardUrl: "https://sogverse.sog.gg/parent",
    shopUrl: "https://sogverse.sog.gg/shop",
    settingsUrl: "https://sogverse.sog.gg/settings",
  },
  welcomeGedu: {
    firstName: "Alice",
    verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
    dashboardUrl: "https://sogverse.sog.gg/gedu",
    settingsUrl: "https://sogverse.sog.gg/settings",
  },
  productConfirmation: {
    participantName: "Aino",
    isSelfSeat: false,
    productName: "Minecraft 101",
    productType: "camp",
    mode: "upfront",
    priceAmount: "€40.00",
    dashboardUrl: "https://sogverse.sog.gg/parent",
  },
  verifyEmail: {
    firstName: "Marja",
    verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
  },
  sessionReport: {
    gamerName: "Aino",
    geduName: "Marianne",
    productName: "Minecraft: Cozy Adventures",
    groupName: "Usvalaakso: Kettukallio",
    sample: "en",
    viewerTimezone: "Europe/Helsinki",
    reportMarkdown: "",
    productUrl: "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
  },
};

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

function fromRegistry(key: string): [string, string][] {
  return [[key, templateRegistry[key].render(PARAMS[key], t, "en").html]];
}

/**
 * Every mail this codebase can send, keyed by the module that builds it.
 *
 * Keyed by module rather than by template because that is the key the
 * completeness check above can verify against the directory — a template name
 * only exists once someone has registered it, and the mail that was broken
 * longest was the one nobody registered. Most entries delegate to the registry,
 * which already owns validated params; a builder with no registry entry renders
 * here directly and says why.
 */
const MAILS: Record<string, () => [string, string][]> = {
  "components-reference": () => fromRegistry("componentsReference"),
  "password-reset": () => fromRegistry("passwordReset"),
  feedback: () => fromRegistry("feedback"),
  "product-confirmation": () => fromRegistry("productConfirmation"),
  "session-report": () => fromRegistry("sessionReport"),
  "verify-email": () => fromRegistry("verifyEmail"),
  welcome: () => [...fromRegistry("welcomeParent"), ...fromRegistry("welcomeGedu")],

  // Not registered, deliberately: a test send from the admin UI would mint a
  // real PIN-reset link for whoever pressed the button. It is swept here so
  // that staying out of the testing UI does not also mean staying unchecked —
  // which is exactly what it used to mean.
  "pin-reset": () => [
    ["pinReset", buildPinResetEmail(t, "https://sogverse.sog.gg/reset-pin?token=abc123", "en")],
  ],
};

/** Every mail this codebase can send, as `[name, html]`. */
function allMails(): [string, string][] {
  return Object.values(MAILS).flatMap((render) => render());
}

/** Every `style="…"` value in a document, with the tag it sits on. */
function styleAttributes(html: string): { tag: string; style: string }[] {
  return [...html.matchAll(/<(\w+)\b[^>]*?\sstyle="([^"]*)"/g)].map((m) => ({
    tag: m[1],
    style: m[2],
  }));
}

describe("completeness", () => {
  /**
   * Discovery, so that adding a mail is not also a decision to test it.
   *
   * The gap this closes is not hypothetical: the two worst-broken buttons in the
   * directory lived in the one builder no test rendered, and it was invisible
   * precisely because nothing enumerated it. `import.meta.glob` walks the
   * directory at build time — no filesystem access, and no list of names for
   * someone to forget to append to.
   */
  it("renders every builder in the directory", () => {
    const modules: Record<string, unknown> = import.meta.glob(
      "../../../src/lib/email-templates/*.ts",
      { eager: true },
    );

    const discovered = Object.entries(modules).flatMap(([path, mod]) => {
      const exported = mod !== null && typeof mod === "object" ? Object.keys(mod) : [];
      return exported.some((name) => /^build\w*Email$/.test(name))
        ? [path.replace(/^.*\//, "").replace(/\.ts$/, "")]
        : [];
    });

    const swept = new Set(Object.keys(MAILS));
    const missing = [...new Set(discovered)].filter((name) => !swept.has(name));
    expect(
      missing,
      "These builders are reached by no house-style check. Add each to MAILS with " +
        "params — a mail nothing renders is a mail nothing can vouch for.",
    ).toEqual([]);

    // The reverse, so a deleted builder's entry cannot linger as a stale excuse.
    const stale = [...swept].filter((name) => !discovered.includes(name));
    expect(stale, "MAILS names a builder that no longer exists").toEqual([]);
  });
});

describe("house style, over every mail we can send", () => {
  /**
   * Anchor provenance. Every link in a mail comes from `ctaButton`,
   * `ctaButtonRow` or `inlineLink`, so the set of styles an anchor can carry is
   * small and closed. A hand-rolled anchor is what bypassed every colour rule
   * we had; this is the assertion that makes bypassing visible.
   */
  it("emits no anchor a helper did not build", () => {
    for (const [name, html] of allMails()) {
      // A mail with no link is fine — the feedback mail is written to us about
      // a person and asks the reader for nothing.
      const anchors = styleAttributes(html).filter((s) => s.tag === "a");
      for (const { style } of anchors) {
        const isButton = /^display:(inline-)?block;padding:12px (8|32)px;font-size:14px;font-weight:bold;color:#[0-9a-fA-F]{6};text-decoration:none;$/.test(
          style,
        );
        const isInlineLink = style === `color:${BRAND.primary};text-decoration:underline;`;
        expect(
          isButton || isInlineLink,
          `${name}: hand-rolled anchor — use ctaButton/ctaButtonRow/inlineLink.\n  ${style}`,
        ).toBe(true);
      }
    }
  });

  /**
   * A link has to go somewhere and be worth pressing.
   *
   * Styling work touches the attribute next to the one that carries the
   * destination, and a mail is the worst place to find out you dropped it:
   * there is no console, no retry, and for a password reset the button *is* the
   * recovery path. So the destination and the label are asserted separately
   * from anything about how either looks — a token lives in the query string,
   * which is exactly what a careless rewrite of an href drops while leaving it
   * looking correct.
   */
  it("gives every link a real destination and something to press", () => {
    for (const [name, html] of allMails()) {
      for (const link of html.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)) {
        const href = /href="([^"]*)"/.exec(link[1])?.[1] ?? "";
        expect(href, `${name}: an anchor with no href`).toMatch(/^https?:\/\/\S+$/);
        expect(href, `${name}: href lost its query string`).not.toMatch(/[?&]$/);
        expect(link[2].trim(), `${name}: an anchor with no label to press`).not.toBe("");
      }
    }
  });

  /**
   * A client will invent a link we did not write: every major one linkifies
   * anything shaped like an address in running text, in its own blue, pointing
   * somewhere we did not choose. Displayed addresses are defused with a word
   * joiner, and this is what notices when a new one arrives undefended.
   */
  it("leaves no address for a client to linkify", () => {
    for (const [name, html] of allMails()) {
      const visible = html
        .replace(/<style>[\s\S]*?<\/style>/g, "")
        .replace(/<[^>]+>/g, " ");
      const bare = [...visible.matchAll(/\S+@\S+\.[A-Za-z]{2,}/g)].filter(
        (m) => !m[0].includes("&#8288;"),
      );
      expect(
        bare.map((m) => m[0]),
        `${name}: an address a client will turn into its own link — defuseAutolinks() it`,
      ).toEqual([]);
    }
  });

  /**
   * Any background a mail depends on is declared twice — as a colour and as a
   * flat gradient of it — because a dark theme rewrites `background-color` and
   * leaves gradients alone. The exception is the hero, whose gradient is a real
   * one applied by class.
   */
  it("declares every background twice", () => {
    for (const [name, html] of allMails()) {
      // The hero's gradient is applied by class, deliberately: Gmail rewrites an
      // inline linear-gradient() into url(linear-gradient(...)) and breaks it,
      // so those elements carry their background-image in the style block.
      const heroTags = [...html.matchAll(/<(\w+)\b[^>]*class="[^"]*hero-gradient/g)].map(
        (m) => m[1],
      );
      for (const { tag, style } of styleAttributes(html)) {
        const fill = /background-color:(#[0-9a-fA-F]{3,8})/.exec(style);
        if (!fill || heroTags.includes(tag)) continue;
        const hex = fill[1];
        expect(
          style.includes(`background-image:linear-gradient(${hex},${hex})`),
          `${name}: background-color:${hex} with no flat-gradient twin — use pinnedFill().\n  ${style}`,
        ).toBe(true);
      }
    }
  });

  /**
   * A brand fill carries its own foreground and no other. The two brand colours
   * are mirror images, so this is the difference between a readable button and
   * one at 2.9:1.
   */
  it("pairs every brand fill with its own foreground", () => {
    for (const [name, html] of allMails()) {
      for (const cell of [...html.matchAll(/<td[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)]) {
        const fill = /background-color:(#[0-9a-fA-F]{6})/.exec(cell[1])?.[1]?.toLowerCase();
        const legal = fill && LEGAL_ON_FILL[fill];
        if (!legal) continue;
        const label = /<a\b[^>]*style="[^"]*color:(#[0-9a-fA-F]{6})/.exec(cell[2])?.[1];
        if (!label) continue;
        expect(
          label.toLowerCase(),
          `${name}: a ${fill} fill must carry ${legal}, not ${label}`,
        ).toBe(legal);
      }
    }
  });

  it("emits no colour outside the palette", () => {
    for (const [name, html] of allMails()) {
      for (const hex of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        expect(PALETTE, `${name}: ${hex[0]} is not in the shared palette`).toContain(
          hex[0].toLowerCase(),
        );
      }
    }
  });

  it("emits no corner outside the app's radius scale", () => {
    for (const [name, html] of allMails()) {
      for (const radius of html.matchAll(/border-radius:(\d+px)/g)) {
        expect(RADII, `${name}: border-radius ${radius[1]} is not in RADIUS`).toContain(radius[1]);
      }
    }
  });
});

/**
 * The rule this directory paid the most to learn, guarded by the only thing
 * that actually justifies it: evidence.
 *
 * A flat luminance threshold looked like the right model and is not. Brand
 * orange sits at 0.487 — lighter than half the scale — and survives the pin;
 * `#ededed` at 0.847 is destroyed by it. The boundary between those is
 * somewhere nobody has measured, and picking a number in the gap would be a
 * guess wearing a rule's clothes.
 *
 * So the check is an allow-list of pins that have actually been seen to work,
 * plus a ceiling at the lightest of them: a new pin must either be no lighter
 * than something already verified, or be verified itself and recorded here.
 * That makes the screenshot step unmissable at exactly the moment it matters,
 * which is the only place a manual check belongs.
 */
describe("every pinned colour has been verified, not reasoned about", () => {
  /** Pinned colours seen to survive, and where that was seen. */
  const VERIFIED_PINS: Record<string, { hex: string; evidence: string }> = {
    "brand-primary": {
      hex: BRAND.primary,
      evidence: "Gmail Android, dark system theme, 2026-08-22 — components reference, header lockup and V7.",
    },
    "cta-on-brand": {
      hex: BRAND.primaryForeground,
      evidence: "Gmail Android, dark system theme, 2026-08-22 — C1. Fixed a real white/black flip.",
    },
  };

  function luminance(hex: string): number {
    const channels = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  it("pins only colours on the verified list, and none lighter", () => {
    const [, html] = allMails()[0];
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const pinned = [
      ...style.matchAll(
        /\.([\w-]+)\s*\{[^}]*?linear-gradient\((#[0-9a-fA-F]{6})[^)]*\)[^}]*?background-clip:\s*text/g,
      ),
    ];
    expect(pinned.length, "no pinned classes found — has the style block moved?").toBeGreaterThan(0);

    const ceiling = Math.max(
      ...Object.values(VERIFIED_PINS).map((entry) => luminance(entry.hex)),
    );

    for (const [, className, hex] of pinned) {
      const verified = VERIFIED_PINS[className];
      expect(
        verified,
        `.${className} pins ${hex} and is not on the verified list. Send the components ` +
          "reference to the client, look at it, and record the result here — a pin " +
          "destroys a colour the client would darken as a background, so this cannot " +
          "be settled by argument.",
      ).toBeDefined();
      expect(hex.toLowerCase(), `.${className} pins a different colour than was verified`).toBe(
        verified.hex.toLowerCase(),
      );
      expect(
        luminance(hex),
        `.${className} pins ${hex}, lighter than anything verified to survive a pin`,
      ).toBeLessThanOrEqual(ceiling);
    }
  });

  it("keeps the verified list honest", () => {
    for (const [className, { evidence }] of Object.entries(VERIFIED_PINS)) {
      expect(evidence, `${className} needs a real evidence note`).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});
