import { BRAND, DARK_THEME, GRADIENT } from "@/lib/constants/colors";
import { BRAND_LOCKUP_TAIL, SENDER_NAME } from "@/lib/constants";
import { RADIUS } from "@/lib/constants/radius";
import { sendableImageOrigin } from "./render-context";
import { pinnedFill } from "./utils";
import {
  PHOTO_CELL_CLASS,
  PHOTO_GUTTER,
  PHOTO_STACK_BREAKPOINT,
} from "./session-photos";
import type { EmailTranslator } from "./translator";

interface LayoutOptions {
  title: string;
  content: string;
  locale?: string;
  t?: EmailTranslator;
}

/** Hero gradient: vertical fade over a horizontal brand-color glow. */
const HERO_GRADIENT = `linear-gradient(to bottom, transparent 0%, ${DARK_THEME.bg} 70%), linear-gradient(to right, ${GRADIENT.primaryGlow}, ${DARK_THEME.bg} 50%, ${GRADIENT.secondaryGlow})`;

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
 * - Gradient is class-based because Gmail Android rewrites inline linear-gradient()
 *   into url(linear-gradient(...)) which breaks it.
 * - Brand text colors use background-clip:text (via "u + .body" Gmail-only selector)
 *   because Gmail Android dark mode shifts the "color" property but preserves gradients.
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
    .hero-gradient {
      background-image: ${HERO_GRADIENT} !important;
    }
    .brand-primary { color: ${BRAND.primary} !important; }
    /* Gmail-only: color text via gradient + background-clip instead of the "color" property,
       because Gmail Android dark mode shifts "color" values but preserves gradient values.
       "u + .body" only matches Gmail's rendering wrapper. Outlook doesn't support
       background-clip:text at all, so it must stay Gmail-targeted.

       Only the primary has a rule: the brand secondary was retired from inline text
       because Gmail's rewriting left it unreadable, so no builder emits a secondary
       brand class any more and a rule for one would be dead weight. */
    u + .body .brand-primary {
      background-image: linear-gradient(${BRAND.primary}, ${BRAND.primary}) !important;
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
    /* Session-report photos: two per row on a desktop-width card, one per row
       on a phone. The cells are a fixed 50/50 split — email clients do not
       reflow table columns — so stacking them is the one thing that cannot be
       said inline, and this block is the only stylesheet a mail has. That is
       why a rule emitted by a single template lives in the shell: it has no
       other home, not because a per-template technique was promoted here.

       The breakpoint is arithmetic, not a round number. The card's content
       column is the viewport less the shell's 20px gutters and the panel's
       32px padding; two cells and the 8px gutters between and around them
       split what is left. At the breakpoint below, that leaves each cell
       exactly the width one photo box is budgeted, so anything narrower has
       to stack. Where a client strips the block entirely the pairs simply
       stay pairs, which is why nothing about the mail's correctness rests
       on it.

       The class name, the breakpoint and the gutter all come from the module
       that emits the cells, so this selector cannot drift away from the
       markup it was written for. */
    @media only screen and (max-width: ${PHOTO_STACK_BREAKPOINT}px) {
      .${PHOTO_CELL_CLASS} {
        display: block !important;
        width: 100% !important;
        padding-bottom: ${PHOTO_GUTTER}px !important;
      }
    }
  </style>
</head>
<!-- "body" class is required for the "u + .body" Gmail-only selector in the style block above -->
<body class="body hero-gradient" style="margin:0;padding:0;background-color:${DARK_THEME.bg};font-family:Arial,Helvetica,sans-serif;">
  <!-- Gradient class on both body and table: body for clients that respect it, table for Gmail which strips body styles -->
  <table role="presentation" class="hero-gradient" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK_THEME.bg};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- The brand mark, above the lockup and never instead of it. Its row
               is absent entirely when no origin can be built, so this header
               has exactly two shapes: mark-over-lockup, and the lockup alone
               that every mail carried before the mark existed. See BRAND_MARK
               and brandMarkRow() for why an image here is allowed to vanish. -->
          ${brandMarkRow()}<!-- Lockup: brand first, platform second, spaced en dash between them.
               "brand-primary" is what puts the brand half through the Gmail
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
            <td align="center" style="padding-bottom:24px;">
              <span class="brand-primary" style="font-size:24px;font-weight:bold;color:${BRAND.primary};letter-spacing:0.5px;">${SENDER_NAME}</span><span style="font-size:24px;font-weight:bold;color:${DARK_THEME.foreground};letter-spacing:0.5px;">${BRAND_LOCKUP_TAIL}</span>
            </td>
          </tr>
          <!-- The message panel: the app's Card, rendered in a table cell. It
               takes the same three tokens the component does — the card fill,
               the border, and rounded-lg — because a parent meets this surface
               on the site before they meet it in their inbox. It sat at 12px
               for a while, which is a step the app uses twice and never on a
               card; that is what a literal drifting unnoticed looks like. -->
          <tr>
            <td style="${pinnedFill(DARK_THEME.card)}border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.lg};padding:32px;">
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
