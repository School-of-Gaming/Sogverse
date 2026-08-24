import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { wrapInLayout } from "./layout";
import { ctaButton, ctaButtonRow, inlineLink, bulletList, sectionLabel } from "./blocks";
import { heading, paragraph, pinnedFill, styledName, styledProductName } from "./utils";

/**
 * The email components reference — what `/admin/ui-components` is for the app,
 * this is for mail.
 *
 * **The rendered mail is the work; this file is the placard.** A style guide
 * shows the thing and names it, and everything else — what it is for, when to
 * reach for it, what it costs, what was rejected and why — is written here,
 * beside the code, where the person who needs it is already standing. Usage
 * prose rendered into the mail is a caption pasted onto a painting: it competes
 * with what it describes, it is read by nobody at the moment they need it, and
 * it is the half that rots, because the specimen is regenerated on every send
 * and the sentence about it is not.
 *
 * The practical test for anything added below: *would this belong on the wall,
 * or on the card beside it?* A swatch and its token name go on the wall. A
 * sentence explaining that the two brand colours are mirror images goes here.
 *
 * **Everything shown is a live call to a real helper.** Every button comes from
 * `blocks.ts`, every text style from `utils.ts`, every colour from the constants
 * that mirror `globals.css`, inside the shell every mail uses. That is the
 * property that makes the page worth trusting — a guide that hand-rolls its
 * specimens is a picture of what the components used to do, and it goes stale
 * without anyone noticing. `house-style.test.ts` asserts it rather than hoping.
 *
 * **It shows only what is correct.** No gallery of broken examples: a reference
 * that displays a wrong thing teaches the wrong thing to whoever skims it, and
 * skimming is what a reference is for. The rejected pairings are held by
 * `palette-contrast.test.ts`, which fails if one of them ever becomes legal.
 *
 * **How it is checked.** Open it in the client you care about and compare
 * against the same mail on desktop web; everything is supposed to look identical
 * in both. A difference is a finding about a component, not a preference between
 * renderings.
 *
 * **Its copy is literal English and is not translated**, the same call
 * `fixtures/` makes: developer-facing instrumentation that only renders inside
 * `/admin/testing`, whose strings are component names and hex values.
 */

/**
 * A specimen and its name. The name is the identifying label a gallery gives a
 * work — enough to say which component you are looking at, and no more.
 */
function entry(name: string, specimen: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
      <tr>
        <td style="padding:0 0 8px;color:${DARK_THEME.mutedFg};font-size:12px;font-weight:bold;letter-spacing:0.5px;">
          ${name}
        </td>
      </tr>
      <tr><td>${specimen}</td></tr>
    </table>`;
}

/** A section rule and its title. */
function section(title: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 20px;">
      <tr>
        <td style="border-top:1px solid ${DARK_THEME.border};padding-top:16px;color:${BRAND.primary};font-size:15px;font-weight:bold;">
          ${title}
        </td>
      </tr>
    </table>`;
}

/**
 * A palette row: the colour as a filled block, its token name, its hex.
 *
 * The swatch is a filled cell rather than a dot or a border because the thing
 * worth checking is how a client treats a *background* of that colour, which is
 * the form these colours actually take in a mail. Each is painted through
 * `pinnedFill` for the same reason every other background is.
 *
 * The label sits on the colour, so the pairing is visible rather than asserted:
 * a foreground that does not read on its own fill is the one palette fault you
 * can see without measuring. The measurements themselves live in
 * `palette-contrast.test.ts`, which is why no ratio is printed here — a number
 * in the mail would be a claim nobody can check from the mail, while the same
 * number in a test fails the build when it stops being true.
 */
function swatch(token: string, hex: string, on: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
      <tr>
        <td width="150" style="${pinnedFill(hex)}border-radius:${RADIUS.sm};padding:14px 10px;color:${on};font-size:12px;font-weight:bold;text-align:center;">
          ${hex}
        </td>
        <td style="padding-left:12px;color:${DARK_THEME.foreground};font-size:12px;">
          ${token}
        </td>
      </tr>
    </table>`;
}

export function buildComponentsReferenceEmail(locale: string): string {
  /*
   * PALETTE
   *
   * Five colours, and the foreground each carries painted on top of it.
   *
   * A fill and its foreground are one decision, never two. The brand colours are
   * mirror images — the primary is light and reads only under a dark label, the
   * secondary is dark and reads only under white — so a button that swaps its
   * fill and keeps its label has not been recoloured, it has been broken. That
   * is the most tempting wrong edit in this directory and the reason `BRAND`
   * carries `primaryForeground` and `secondaryForeground` rather than leaving a
   * caller to pick.
   *
   * Not shown, deliberately: brand colour as body text. There is no correct
   * version of it to display. Purple on the panel is 2.7:1 — unreadable however
   * faithfully a client renders it — and brand colour inside a sentence is a
   * rule this directory settled against. Emphasis in a mail is weight.
   *
   * Also not shown: the status colours. `globals.css` has destructive/success/
   * warning/info; `colors.ts` mirrors none of them, because no mail has needed
   * one and an unverified colour on this page would be an invitation rather than
   * a reference. Mirror them when a mail actually needs one, and verify then.
   */
  const palette = `
    ${section("Palette")}
    ${swatch("BRAND.primary / primaryForeground", BRAND.primary, BRAND.primaryForeground)}
    ${swatch("BRAND.secondary / secondaryForeground", BRAND.secondary, BRAND.secondaryForeground)}
    ${swatch("DARK_THEME.card", DARK_THEME.card, DARK_THEME.foreground)}
    ${swatch("DARK_THEME.bg", DARK_THEME.bg, DARK_THEME.foreground)}
    ${swatch("DARK_THEME.mutedFg", DARK_THEME.mutedFg, DARK_THEME.bg)}
  `;

  /*
   * BUTTONS
   *
   * Three variants, named as the app's `Button` names them.
   *
   * A mail has exactly one action it is really asking for: that one is filled,
   * and a second filled button says the opposite whichever brand colour fills
   * it. `outline` is for a destination worth offering that is not what the mail
   * is for.
   *
   * `secondary` is the brand purple. No product mail uses it yet — it is here
   * because the vocabulary should be complete and because purple as a button
   * fill is the one shape the secondary colour works in, which was not obvious
   * and cost a round of guessing to establish.
   *
   * The row is for two alternatives — two doors into the same place, where
   * stacking them would imply a ranking. Its halves are a hardcoded 50/50 at
   * every width, because email clients do not reflow columns, so a long label
   * wraps by design rather than by accident. Its variants exclude `primary` at
   * the type level, so the forbidden two-filled-buttons row cannot be built.
   */
  const buttons = `
    ${section("Buttons")}
    ${entry(
      "primary",
      ctaButton({ href: "https://sogverse.sog.gg/verify", label: "Verify your email address" }),
    )}
    ${entry(
      "secondary",
      ctaButton({
        href: "https://sogverse.sog.gg/shop",
        label: "Browse the shop",
        variant: "secondary",
      }),
    )}
    ${entry(
      "outline",
      ctaButton({
        href: "https://sogverse.sog.gg/parent",
        label: "Go to My SOG",
        variant: "outline",
      }),
    )}
    ${entry(
      "ctaButtonRow",
      ctaButtonRow(
        { href: "https://sogverse.sog.gg/shop", label: "Browse the shop", variant: "outline" },
        { href: "https://sogverse.sog.gg/parent", label: "Go to My SOG", variant: "outline" },
      ),
    )}
  `;

  /*
   * TEXT
   *
   * Every block below carries its own bottom margin — 16px, except
   * `sectionLabel`'s 8px, which sits tight to whatever it labels. Compose them
   * adjacently and add nothing: a spacer between two blocks double-spaces them,
   * and inventing a third gap is how a mail ends up with a rhythm of its own.
   *
   * `styledName` and `styledProductName` escape what they are given. Never
   * interpolate a person's or a product's name into markup by hand — those are
   * the two values in a mail that come from the database.
   *
   * `inlineLink` is for a destination worth naming but not worth a button, and
   * it rides inside a sentence already being read. Which word carries it is the
   * translation's decision, so the message file supplies the label rather than
   * the builder slicing one out of the sentence.
   *
   * `bulletList` takes composed HTML, so anything from a user is escaped before
   * it goes in.
   */
  const text = `
    ${section("Text")}
    ${entry("heading + paragraph", `${heading("A heading")}${paragraph("Body copy, which is what most of a mail is.")}`)}
    ${entry("sectionLabel", `${sectionLabel("A section label")}${paragraph("The block it labels.")}`)}
    ${entry(
      "styledName + styledProductName",
      paragraph(
        `Hello ${styledName("Marja")}, your seat on ${styledProductName("Minecraft 101")} is confirmed.`,
      ),
    )}
    ${entry(
      "inlineLink",
      paragraph(
        `You can do this later in ${inlineLink("https://sogverse.sog.gg/settings", "your settings")}.`,
      ),
    )}
    ${entry(
      "bulletList",
      bulletList(["One item, already composed and escaped.", "And a second, so it is a list."]),
    )}
  `;

  return wrapInLayout({
    title: "Email components",
    content: `${heading("Email components")}${palette}${buttons}${text}`,
    locale,
  });
}
