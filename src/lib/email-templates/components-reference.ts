import { BRAND, DARK_THEME, STATUS } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { wrapInLayout } from "./layout";
import {
  calloutPanel,
  ctaButton,
  ctaButtonRow,
  factList,
  inlineLink,
  bulletList,
  numberedList,
  inlineBold,
  sectionLabel,
} from "./blocks";
import { renderMarkdownForEmail } from "./markdown";
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
 * **Everything shown is a live call to a real helper.** Every button and block
 * comes from `blocks.ts`, every text style from `utils.ts` or `blocks.ts`, the
 * rendered markdown from `markdown.ts`, and every colour from
 * `@/lib/constants/colors`, which derives each value from `@sog/ui` — all inside
 * the shell every mail uses. That is the property that makes the page worth
 * trusting — a guide that hand-rolls its specimens is a picture of what the
 * components used to do, and it goes stale without anyone noticing. The house
 * style sweep and the reference's own registry tests assert it rather than
 * hoping.
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
 * `/admin/testing`, whose strings are component names, hex values and sample
 * copy invented to fill a specimen.
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
        <td style="border-top:1px solid ${DARK_THEME.border};padding-top:16px;color:${BRAND.act};font-size:15px;font-weight:bold;">
          ${title}
        </td>
      </tr>
    </table>`;
}

/**
 * A palette row: the colour as a filled block, its token name, its hex.
 *
 * The swatch is a filled cell rather than a dot or a border because a block is
 * the one shape big enough to judge a colour at. For the brand fills and the
 * grounds it is also the form they take in a mail, so how a client treats a
 * *background* of that colour is exactly the thing worth checking. The inks,
 * the edge and the status colour are never fills in a mail — each appears in
 * the form a mail actually spends it in the specimens further down — and are
 * blocked in here only so the palette can be read in one place. Each is painted
 * through `pinnedFill` for the same reason every other background is.
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
   * Eight swatches, each with a label painted on top of it. Every value a mail
   * spends is here in one of those two forms: most as a swatch, and the
   * foregrounds a fill carries as the label on that fill — white, world's label,
   * among them, which a mail spends only as a label and so has no swatch.
   *
   * A fill and its foreground are one decision, never two. The brand colours are
   * mirror images — act is light and reads only under a dark label, world is
   * dark and reads only under white — so a button that swaps its
   * fill and keeps its label has not been recoloured, it has been broken. That
   * is the most tempting wrong edit in this directory and the reason `BRAND`
   * carries `actForeground` and `worldForeground` rather than leaving a
   * caller to pick. `STATUS` does the same for info: its fill carries
   * `infoForeground`, which is ink, because every status fill is light enough
   * to take a dark label and none is dark enough to take white.
   *
   * Where a colour has no foreground of its own the label is the other half of
   * a text pairing the palette already makes, turned over: the ground on the
   * two inks, since contrast is symmetric and the ink-on-ground row measures
   * both directions. The border grey is the one value nothing is ever set on —
   * it is an edge and never a ground — so its swatch borrows the ink every
   * neutral ground carries. That label and the info fill's own are painted by
   * this page alone, and `palette-contrast.test.ts` measures both.
   *
   * Not shown, deliberately: brand colour as body text. There is no correct
   * version of it to display. Purple on the panel is 2.7:1 — unreadable however
   * faithfully a client renders it — and brand colour inside a sentence is a
   * rule this directory settled against. Emphasis in a mail is weight.
   *
   * The info swatch is the value; the shape a mail spends it in is the callout
   * further down, as a border and a label on no fill at all. The other status
   * colours (destructive/success/warning) are still unmirrored; mirror one when
   * a mail needs it, and measure it then.
   */
  const palette = `
    ${section("Palette")}
    ${swatch("BRAND.act / actForeground", BRAND.act, BRAND.actForeground)}
    ${swatch("BRAND.world / worldForeground", BRAND.world, BRAND.worldForeground)}
    ${swatch("DARK_THEME.card", DARK_THEME.card, DARK_THEME.foreground)}
    ${swatch("DARK_THEME.bg", DARK_THEME.bg, DARK_THEME.foreground)}
    ${swatch("DARK_THEME.foreground", DARK_THEME.foreground, DARK_THEME.bg)}
    ${swatch("DARK_THEME.mutedFg", DARK_THEME.mutedFg, DARK_THEME.bg)}
    ${swatch("DARK_THEME.border", DARK_THEME.border, DARK_THEME.foreground)}
    ${swatch("STATUS.info / infoForeground", STATUS.info, STATUS.infoForeground)}
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
   * `secondary` is the brand purple, the world colour. Purple as a button fill
   * under white is the one shape world clears contrast in, which was not
   * obvious and cost a round of guessing to establish. Its one product use is
   * the seat offer's Accept, and whether world may be spent there at all is not
   * settled: that mail also carries the amber My SOG button, so it holds two
   * filled buttons — the arrangement the paragraph above rules out — and SOG-UI
   * forbids violet as a call to action beside an amber one. The open ruling is
   * recorded in `TODO.md`. The specimen is here because it is live mail, not
   * because the question is answered.
   *
   * The row is for two alternatives, where stacking them would imply a ranking.
   * It is shown twice because two mails ship it. Two outlined halves are equal
   * alternatives, two doors into the same place with no ask between them — the
   * welcome mail's shop-or-My-SOG pair — so neither half is the negative and
   * the order between them carries nothing. An outlined half beside a
   * `secondary` one is the shape the seat-offer mail ships for its Decline and
   * Accept, and its colour use is the open ruling above rather than a pattern to
   * copy. Where the halves do answer one question, position follows the app's
   * button-order rule: the negative in the left cell, the affirmative in the
   * right, so a reader meets the pair in the same order in an inbox as in My SOG.
   * Its halves are a hardcoded 50/50 at every width, because email clients do
   * not reflow columns, so a long label wraps by design rather than by accident.
   * Its variants exclude `primary` at the type level, so a row with two amber
   * cells cannot be built; two `secondary` halves still can, and nothing on this
   * page should be read as licensing them.
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
      "ctaButtonRow — outline + outline",
      ctaButtonRow(
        { href: "https://sogverse.sog.gg/shop", label: "Browse the shop", variant: "outline" },
        { href: "https://sogverse.sog.gg/parent", label: "Go to My SOG", variant: "outline" },
      ),
    )}
    ${entry(
      "ctaButtonRow — outline + secondary",
      ctaButtonRow(
        {
          href: "https://sogverse.sog.gg/seat-offer?answer=decline",
          label: "No, thank you",
          variant: "outline",
        },
        {
          href: "https://sogverse.sog.gg/seat-offer?answer=accept",
          label: "Accept the seat",
          variant: "secondary",
        },
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
   * it goes in. `numberedList` is the same list with the client's own `<ol>`
   * numbering, for a run whose order is part of what it says; the two are
   * styled identically, so a mail carrying both spaces them alike.
   *
   * `inlineBold` is the emphasis a sentence carries inside itself, and the
   * shape a message's own `<b>` renders to through `t.markup`. Weight, never
   * colour — a dark theme rewrites a colour and leaves a weight alone.
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
    ${entry(
      "numberedList",
      numberedList(["The first thing to do.", "And then the second."]),
    )}
    ${entry(
      "inlineBold",
      paragraph(
        `Buy it on ${inlineBold("the device you will actually play on")} — a copy does not carry over.`,
      ),
    )}
  `;

  /*
   * FACTS
   *
   * `factList` is the one label–value block every mail states its facts in: who
   * holds the seat, when and where it runs, what it costs. Reach for it whenever
   * a mail has more than a couple of facts a reader will scan for rather than
   * read through — a sentence carrying four of them is a sentence nobody finds
   * the date in. Every mail takes the same block, staff mail included; there is
   * no variant and no label-width option, because the label column sizes itself
   * to whatever the locale calls a thing.
   *
   * Its own section rather than a line under Text, because it is not a text
   * style: it is a ruled table, it carries a 24px bottom margin where the text
   * blocks carry 16px, and a reader skimming for "how do I state a date and a
   * price" should find it by name rather than between the lists.
   *
   * Labels and values go in as composed HTML and neither is escaped by the
   * block, so a value off a row is escaped by the caller — and an address is
   * defused as well. The literals below need neither.
   */
  const facts = `
    ${section("Facts")}
    ${entry(
      "factList",
      factList([
        ["Club", "Minecraft 101"],
        ["Gamer", "Aino"],
        ["When", "Mondays 16:00–17:00"],
        ["Where", "Kallion kirjasto, Viides linja 11"],
        ["Price", "€40.00 per month"],
      ]),
    )}
  `;

  /*
   * MARKDOWN
   *
   * `renderMarkdownForEmail` is how stored, user-authored markdown — a gedu's
   * session report — reaches a mail. A template never styles that text itself:
   * the renderer emits exactly the app's feed subset (paragraphs, three heading
   * levels, bold, italic, lists, line breaks) with the margins decided inline,
   * escapes every character, unwraps a link to its label and defuses anything
   * a client would linkify. Reach for it only for a field the app also renders
   * as markdown; copy a builder writes is composed from the helpers above.
   *
   * It is a string walker rather than a React render, which is what makes it
   * safe to call here: this module sits behind the registry, which a client page
   * imports. The specimen exercises every construct the subset has, so a change
   * to how any of them looks shows up on this page.
   */
  const markdown = `
    ${section("Markdown")}
    ${entry(
      "renderMarkdownForEmail",
      renderMarkdownForEmail(
        [
          "# Today's session",
          "",
          "We finished the **castle walls** and made a start on the *moat*.  ",
          "Everyone got their build saved before the end.",
          "",
          "## What we built",
          "",
          "- A gatehouse with a working drawbridge",
          "- Torches along the north wall",
          "",
          "### Next time",
          "",
          "1. Fill the moat",
          "2. Test the drawbridge with redstone",
        ].join("\n"),
      ),
    )}
  `;

  /*
   * CALLOUT
   *
   * The app's `Alert` in its `info` variant, reaching an inbox: no fill at all,
   * a 1px border in `STATUS.info` at full value, the app's `rounded-lg` corner,
   * the uppercase label in `STATUS.info` and the paragraphs in ink.
   *
   * It is for one of two things, and where it goes follows which. An aside
   * about the mail itself opens the mail: the session report's staff copy
   * saying that it is a copy and that each family's mail was its own. The one
   * fact the reader must not miss, because it stops being true, sits beside what
   * it bounds: the seat offer's deadline, under the question and above the
   * answers. A mail with nothing of either kind to say does not need one.
   *
   * The coloured edge and the coloured label are what mark the panel as an
   * aside; a tinted ground would say the same thing a second time. The info
   * blue clears the body floor as a label on the grounds a mail has, and
   * `palette-contrast.test.ts` holds that. The paragraphs are equal-weight ink
   * rather than muted, because the later sentence is usually the one answering
   * the reader's actual worry.
   */
  const callout = `
    ${section("Callout")}
    ${entry(
      "calloutPanel",
      calloutPanel({
        label: "A note about this mail",
        paragraphs: [
          "This is a copy of the report, sent to the staff on the group.",
          "Each family received their own mail, addressed to them alone.",
        ],
      }),
    )}
  `;

  return wrapInLayout({
    title: "Email components",
    content: `${heading("Email components")}${palette}${buttons}${text}${facts}${markdown}${callout}`,
    locale,
  });
}
