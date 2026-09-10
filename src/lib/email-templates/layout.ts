import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { BRAND_LOCKUP_TAIL, SENDER_NAME } from "@/lib/constants";
import { RADIUS } from "@/lib/constants/radius";
import {
  MAIL_FONT_STACK,
  MAIL_WORD_ENGINE_FONT_STACK,
} from "@/lib/constants/typography";
import { sendableImageOrigin } from "./render-context";
import { pinnedFill } from "./utils";
import { PHOTO_WELL_CLASS } from "./session-photos";
import type { EmailTranslator } from "./translator";

interface LayoutOptions {
  title: string;
  content: string;
  locale?: string;
  t?: EmailTranslator;
}

/**
 * The world rule under the lockup — the header's one piece of colour besides
 * the brand half of the lockup itself.
 *
 * **Why a mail spends a second colour at all.** A mail is a parent-tier
 * surface, and that tier's budget gives it act as its one accent, with a
 * second colour arriving only where an intent is stated beside the site that
 * spends it. This is that statement: act and world together are the
 * signature pair — the brand's own lockup — and the header is where a mail
 * says who it is from. The rule is the pair, not decoration, and nothing below
 * the header spends a second colour.
 *
 * It is the construct the home hero and both social cards use, so a page, a
 * shared link and a mail say one thing. It replaces a two-tone wash across the
 * whole shell: act and world pre-blended against the ground, because a mail
 * client cannot be relied on for alpha — which is exactly what made it the
 * brand pair at an alpha step wearing a solid's clothes, two colours neither of
 * which was ours.
 *
 * **A filled table cell is the most robust construct email has.** No gradient,
 * no image, no border trick: a `td` with a height and a background, pinned
 * through `pinnedFill` like every other background here so a client's dark
 * theme cannot rewrite it. The cell is fed a non-breaking space, which is what
 * stops Outlook collapsing an empty cell to nothing, and the space is then made
 * to take no room: `font-size` goes to zero and `line-height` to the rule's own
 * height, so the line box is exactly the six pixels the rule is and cannot
 * force the cell taller.
 */
const HEADER_RULE_HEIGHT = 6;

/**
 * The shell's two shapes, and the class names that switch between them.
 *
 * **The base layout is the phone, and the card is what a wide viewport adds.**
 * A parent reads this mail on a phone, and the shell used to spend a 20px
 * gutter plus a 32px card padding on each side of it — 104px of the 360px
 * design floor, leaving a 254px content column for a paragraph, a button and a
 * photograph. So the inline layout carries no card at all: the content sits
 * directly on the ground behind a single 16px gutter, which is a 328px column
 * at 360px, and the card is drawn back by the one media query below.
 *
 * **Base-is-phone rather than base-is-desktop is the whole reason this is
 * allowed to be a media query.** The shell's own rule for the one stylesheet a
 * mail has is that the layout must be correct with the block stripped out —
 * paid for by correctness without it, not by having been tried elsewhere first.
 * A client that ignores `<style>` (Outlook on Windows, the Gmail app signed in
 * to a non-Google account) therefore reads a plain 560px column on the dark
 * ground: no card, no border, full-width content, every colour and every rule
 * intact. That is an acceptable mail, which a query-less *desktop* base would
 * not have been — it would have handed the phone the 254px column this change
 * exists to delete.
 *
 * The breakpoint is arithmetic rather than a round number: the column is 560px
 * and the wide gutter is 20px a side, so 600px is the narrowest viewport that
 * fits the card at its full width. Below it, nothing to gain by drawing one.
 */
const SHELL_WIDE_BREAKPOINT = 600;

/**
 * Every class name the shell emits, in one place — the block below and the
 * markup at the bottom of this file are the only two readers, and a name typed
 * twice is a selector that can drift away from the cell it was written for.
 *
 * The one class the query names that is *not* here is the photo well's, and it
 * follows the same rule from the other end: it belongs to the module that emits
 * those cells, and is imported rather than typed.
 */
const SHELL_CLASS = {
  /** The outer cell holding the side gutter: 16px on a phone, 20px wide. */
  gutter: "shell-gutter",
  /** The content cell. Bare on a phone; the app's Card on a wide viewport. */
  panel: "shell-panel",
  /** The breathing room between the header rule and the content. */
  rhythm: "shell-rhythm",
} as const;

/**
 * A `pinnedFill` for a rule inside the `<style>` block.
 *
 * Same two declarations for the same reason — a dark theme rewrites
 * `background-color` and leaves a gradient alone — with `!important` on both,
 * because a class rule has to beat the inline styles it is overriding. It is
 * spelled here rather than taken from `pinnedFill` with a suffix so the
 * `!important` lands on each declaration rather than on the pair.
 */
function pinnedFillRule(color: string): string {
  return `background-color:${color} !important; background-image:linear-gradient(${color},${color}) !important;`;
}

/**
 * The brand mark above the lockup — the one image in any mail this codebase
 * sends, and it is built so that a reader who never sees it loses nothing.
 *
 * **It supplements the text header; it does not replace it.** The lockup below
 * it still names both the brand and the platform, so the mail that arrives with
 * images blocked — the default in a good share of inboxes, and the one a reader
 * has already chosen when it happens — is exactly the mail we sent before this
 * existed: complete, headed, branded, with no hole where something was supposed
 * to be. That ordering is the whole design. An image carrying the header on its
 * own would make every blocked-image render a broken one, which is the failure
 * mode that made every company mail with a red X in the corner look cheap.
 *
 * **A hosted PNG, and none of the three alternatives.** Clients do not render
 * SVG; Gmail strips `data:` URIs out of `src`; a CID attachment turns every mail
 * into a multipart one with a paperclip on it and costs deliverability. A URL to
 * a file this app already serves is the only form that reaches all of them.
 *
 * The file is **2× the size it is displayed at** (248×136 for a 124×68 box), so
 * a retina reader gets a sharp mark and everyone else gets a downscale. It is
 * regenerated from the brand SVG — no hand-editing the PNG — with:
 *
 *     node -e "require('sharp')('src/assets/brand/sog-logo-simple.svg',{density:600})\
 *       .resize({width:248}).png({compressionLevel:9})\
 *       .toFile('public/email/sog-logo-simple.png')"
 *
 * `sog-logo-simple` rather than the full lockup mark because this is small: the
 * badge holds its shape at 124px wide where a wordmark would turn to mush. The
 * PNG keeps its alpha, so the transparent ground around the badge shows the
 * hero gradient rather than a rectangle cut out of it — and the badge itself is
 * opaque, so the mark still reads if a client drops our background entirely.
 */
export const BRAND_MARK = {
  path: "/email/sog-logo-simple.png",
  /** Display size. The file is twice this in each dimension. */
  width: 124,
  height: 68,
} as const;

/**
 * The mark's absolute URL, or `null` when we cannot build one.
 *
 * **The origin is the canonical `NEXT_PUBLIC_SITE_URL` rather than a per-request
 * one**, and that is a deliberate departure from how a *link* in a mail gets its
 * origin. A link is resolved from the incoming request through `getOrigin()`
 * because it has to land the reader back where they came from, and because the
 * `Host` it is derived from is attacker-controllable — which is why that helper
 * exists and why it falls back to this same value the moment the header is not
 * one it trusts. An image src needs neither half of that: it carries no token,
 * it is not somewhere a reader is being sent, and a builder here never sees a
 * request in the first place (they take composed URLs as params, by rule). What
 * is left is the requirement that staging mail point at staging and production
 * mail at production, and the canonical per-environment URL is precisely that
 * value — the one `getOrigin` itself treats as the safe answer.
 *
 * **No origin, no image, no broken `src`.** An unset or malformed env yields the
 * text-only header rather than an `undefined/email/…` that resolves to nothing
 * and paints the exact broken box this feature exists to avoid. It is the same
 * degradation as a blocked image, one level up, and it is why unit tests that do
 * not stub the env still render — and still assert — the header as it has always
 * been.
 *
 * **A loopback origin counts as no origin.** A mail sent from a dev machine
 * (the admin testing tool runs locally too) would otherwise carry a
 * `localhost` src that no recipient's client can ever fetch — and a *failed*
 * fetch is worse than a blocked one: Gmail's proxy draws its broken-image
 * glyph inside the reserved box, which is exactly the nasty render the whole
 * design exists to avoid, and it was observed doing so in a real inbox. An
 * unreachable-by-construction src is morally a malformed one, so it takes the
 * same branch.
 *
 * Both halves of that are `sendableImageOrigin()`, shared with the testing
 * tool's demo photographs — the only other images this directory emits, and the
 * only other place the same question is asked. The shell never renders in the
 * preview context, so the mark keeps one shape here: a mail previewed from a dev
 * machine shows the header the same send would arrive with, which is the honest
 * render and costs nothing, because the lockup underneath already says
 * everything the badge said.
 */
function brandMarkSrc(): string | null {
  const origin = sendableImageOrigin();
  return origin ? new URL(BRAND_MARK.path, origin).toString() : null;
}

/**
 * The mark's row, or nothing at all.
 *
 * Everything on the `<img>` is there for the render where the file does not
 * arrive. `width`/`height` as attributes *and* in the inline style hold the box
 * open, so nothing below it shifts when the image loads or fails to. `alt` is
 * **empty on purpose**: the real text lockup sits directly beneath this image,
 * so the mark is decorative — a blocked render shows exactly the pre-mark
 * header with no stray repeated name, and a screen reader is not told
 * "School of Gaming" twice in a row. `border:0` and
 * `text-decoration:none` kill the frame and underline Outlook and Gmail
 * respectively draw around a missing image, and `display:block` kills the
 * baseline gap under it that would otherwise show as a seam.
 */
function brandMarkRow(): string {
  const src = brandMarkSrc();
  if (!src) return "";
  const style = [
    "display:block",
    "margin:0 auto",
    `width:${BRAND_MARK.width}px`,
    `height:${BRAND_MARK.height}px`,
    "border:0",
    "outline:none",
    "text-decoration:none",
  ].join(";");
  return `<tr>
            <td align="center" style="padding-bottom:12px;">
              <img src="${src}" width="${BRAND_MARK.width}" height="${BRAND_MARK.height}" alt="" style="${style};" />
            </td>
          </tr>
          `;
}

/**
 * Wraps email content in a branded dark-theme layout.
 * Table-based with all inline CSS for email client compatibility.
 *
 * Gmail Android quirks addressed in the <style> block:
 * - Brand text colors use background-clip:text (via "u + .body" Gmail-only selector)
 *   because Gmail Android dark mode shifts the "color" property but preserves gradients.
 *   That flat act-to-act gradient is a delivery mechanism for a text colour, not a
 *   blend, which is why it survives a sweep that removed every real gradient here.
 *
 * The shell used to carry a class-based hero gradient, on the body and on the
 * outer table, because Gmail Android rewrites an inline linear-gradient() into
 * url(linear-gradient(...)) and breaks it. There is no gradient left to place,
 * so both elements simply carry the ground, pinned like every other background.
 */
export function wrapInLayout({ title, content, locale = "en", t }: LayoutOptions): string {
  // The copyright line names the company that holds the copyright, so it is the
  // brand alone \u2014 same string the site footer renders, and `SENDER_NAME` rather
  // than a typed literal, because no name in this directory's markup is typed.
  const footerText = t
    ? t("footer", { year: String(new Date().getFullYear()) })
    : `\u00a9 ${new Date().getFullYear()} ${SENDER_NAME}. All rights reserved.`;
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Tell email clients this is already dark-themed so they skip dark mode color adjustments -->
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${title}</title>
  <style>
    .brand-act { color: ${BRAND.act} !important; }
    /* Gmail-only: color text via gradient + background-clip instead of the "color" property,
       because Gmail Android dark mode shifts "color" values but preserves gradient values.
       "u + .body" only matches Gmail's rendering wrapper. Outlook doesn't support
       background-clip:text at all, so it must stay Gmail-targeted.

       Only act has a rule: the brand's world colour was retired from inline text
       because Gmail's rewriting left it unreadable, so no builder emits a world
       brand class any more and a rule for one would be dead weight. */
    u + .body .brand-act {
      background-image: linear-gradient(${BRAND.act}, ${BRAND.act}) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      color: transparent !important;
    }
    /* Button labels, same mechanism. Gmail flips a label's "color" by luminance
       and by the reader's theme, so the dark label on the brand fill came back
       white in some inboxes and black in others. Pinning it through a gradient
       gives one answer everywhere Gmail renders. The class names are emitted by
       blocks.ts — keep them in step.

       Only the dark label is pinned, and only because it is dark. There was a
       matching rule for the outlined button's near-white label; it was the
       cause of that button's bug, not its cure. background-clip:text restates a
       text colour as a background colour, and a dark theme darkens light
       backgrounds — so pinning the body foreground fed it to the exact pass
       that darkens near-white. Measured against a client, not reasoned. Never
       add a rule here for a colour a dark theme would lighten or darken as a
       background; those colours are already safe inline, and the pinned ones
       are listed with their evidence in the house-style test. */
    u + .body .cta-on-brand {
      background-image: linear-gradient(${DARK_THEME.bg}, ${DARK_THEME.bg}) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      color: transparent !important;
    }
    /* The card, and the one media query a mail carries.

       The layout above this rule is the phone's, and it is the whole layout:
       a 560px column on the dark ground behind a 16px gutter, with the content
       sitting straight on that ground. This block is what a viewport wide
       enough to afford it adds back — the panel's fill, its border, its corner
       and its 32px padding, plus the wider outer gutter and a little more air
       under the header.

       That direction is why a media query is allowed here at all. A rule in
       this block has to be an improvement on a layout that is already correct
       without it, because the block is the first thing a client is entitled to
       drop, and two of the clients our readers actually use do drop it. Strip
       everything between these braces and the mail is a plain column on the
       ground: no card, every colour, every rule, every word intact. A card in
       the base with a query that removed it would have failed that test in the
       one place it matters, on the phone most of these are read on.

       The fill is declared twice like every other background here, and both
       declarations carry !important because a class rule is overriding cells
       that state their own inline styles. */
    @media only screen and (min-width: ${SHELL_WIDE_BREAKPOINT}px) {
      .${SHELL_CLASS.gutter} {
        padding: 40px 20px !important;
      }
      .${SHELL_CLASS.rhythm} {
        height: 24px !important;
        line-height: 24px !important;
      }
      .${SHELL_CLASS.panel} {
        ${pinnedFillRule(DARK_THEME.card)}
        border: 1px solid ${DARK_THEME.border} !important;
        border-radius: ${RADIUS.lg} !important;
        padding: 32px !important;
      }
      /* A session photo's reserved well is a tone one step off the ground it
         sits on, and this block is where the ground changes. Inline it is the
         card's tone, because the phone's content sits on the bare ground; the
         moment the card is drawn the same well is inside it, where that tone
         would vanish, so it takes the darker ground instead. Nothing about the
         layout depends on this rule — a card-toned well on the dark ground is
         the correct phone render, which is the only one a client that drops
         this block will draw. The class comes from the module that emits the
         cells, so the selector cannot drift away from the markup. */
      .${PHOTO_WELL_CLASS} {
        ${pinnedFillRule(DARK_THEME.bg)}
      }
    }
  </style>
  <!-- Desktop Outlook only, and the one thing the inherited stack cannot say to
       it. Outlook on Windows renders through Word, which does not walk a
       font-family list: it takes the first family and answers one it cannot
       resolve with Times New Roman rather than with the next entry, and the
       stack's first two names exist only on Apple platforms. So the same face
       is restated here in its Windows-resolvable form, on every element the
       templates set text in, behind a conditional comment no other client
       reads. Same face, same ruling — the reader's own system sans, and still
       no webfont anywhere. -->
  <!--[if mso]><style>
    body, table, td, div, p, a, span, strong, em, ul, ol, li, h1, h2, h3 { font-family:${MAIL_WORD_ENGINE_FONT_STACK} !important; }
  </style><![endif]-->
</head>
<!-- "body" class is required for the "u + .body" Gmail-only selector in the style block above -->
<body class="body" style="margin:0;padding:0;${pinnedFill(DARK_THEME.bg)}font-family:${MAIL_FONT_STACK};">
  <!-- The ground on both body and table: body for clients that respect it, table for Gmail which strips body styles -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${pinnedFill(DARK_THEME.bg)}">
    <tr>
      <!-- The side gutter, and the only one the phone spends. 16px a side
           leaves a 328px content column at the 360px mobile design floor, which
           is what the card-less base buys back. The wide viewport's 40px/20px
           is restored by the media query above, on this cell's class. -->
      <td class="${SHELL_CLASS.gutter}" align="center" style="padding:24px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- The brand mark, above the lockup and never instead of it. Its row
               is absent entirely when no origin can be built, so this header
               has exactly two shapes: mark-over-lockup, and the lockup alone
               that every mail carried before the mark existed. See BRAND_MARK
               and brandMarkRow() for why an image here is allowed to vanish. -->
          ${brandMarkRow()}<!-- Lockup: brand first, platform second, spaced en dash between them.
               "brand-act" is what puts the brand half through the Gmail
               background-clip rule above — this header is one of the two places
               brand color still survives Gmail's dark-theme rewriting (the other
               is a button fill), so it is the one place the full lockup is set.

               The two halves are two spans because they are two colours, which
               is why this is the one site that builds the lockup up from its
               parts instead of emitting BRAND_LOCKUP whole. Both halves still
               come from the constants module — no character of the lockup, and
               above all not the en dash, is typed here — and a unit test
               asserts the two spans still read as BRAND_LOCKUP exactly. -->
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <span class="brand-act" style="font-size:24px;font-weight:bold;color:${BRAND.act};letter-spacing:0.5px;">${SENDER_NAME}</span><span style="font-size:24px;font-weight:bold;color:${DARK_THEME.foreground};letter-spacing:0.5px;">${BRAND_LOCKUP_TAIL}</span>
            </td>
          </tr>
          <!-- The world rule under the lockup. See HEADER_RULE_HEIGHT. -->
          <tr>
            <td height="${HEADER_RULE_HEIGHT}" style="${pinnedFill(BRAND.world)}height:${HEADER_RULE_HEIGHT}px;line-height:${HEADER_RULE_HEIGHT}px;font-size:0;">&nbsp;</td>
          </tr>
          <!-- The air between the header and the content. Tighter on a phone
               than on a desktop, where the media query grows it back: vertical
               rhythm that reads as generous on a 560px card reads as wasted
               screen on a 360px one. -->
          <tr>
            <td class="${SHELL_CLASS.rhythm}" style="height:16px;line-height:16px;font-size:0;">&nbsp;</td>
          </tr>
          <!-- The message panel. On a phone it is not a panel at all: no
               fill, no border, no corner and no padding, so the content sits
               straight on the shell's ground and spends none of a 360px
               viewport on chrome. The media query above gives it the app's Card
               back — the same three tokens the component takes, the card fill,
               the border and rounded-lg, plus the 32px padding — the moment
               there is width to afford them.

               Which way round that is stated is the load-bearing part. The card
               is the addition, so a client that drops the stylesheet keeps the
               phone layout rather than losing the phone layout; see
               SHELL_WIDE_BREAKPOINT for why that is the only shape a media
               query is allowed to take in this shell. -->
          <tr>
            <td class="${SHELL_CLASS.panel}">
              <div style="color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
                ${content}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;color:${DARK_THEME.mutedFg};font-size:12px;">
              ${footerText}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
