import { BRAND, DARK_THEME } from "@/lib/constants/colors";

/** Escape HTML special characters to prevent XSS in email content. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The body's text style, for any block that carries body copy — a paragraph,
 * a list, a rendered markdown block. One string, so the three agree.
 */
export const BODY_TEXT_STYLE = `color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;`;

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;${BODY_TEXT_STYLE}">${text}</p>`;
}

export function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:18px;font-weight:bold;color:${DARK_THEME.foreground};">${text}</h2>`;
}

export function styledName(name: string): string {
  // Class targets the Gmail-specific background-clip:text rule in layout.ts <style> block.
  // Inline style is the default for all other email clients.
  return `<span class="brand-act" style="color:${BRAND.act};">${escapeHtml(name)}</span>`;
}

/**
 * Bold, in the body's own text color — deliberately *not* the brand's world
 * colour it used to carry. Gmail's dark-theme color rewriting left that purple
 * unreadable against the card, and the background-clip workaround that saves act
 * is a Gmail-only patch on a problem world hits in more clients than one.
 * Weight is the emphasis every client renders the same way, so the product name
 * still stands out of the sentence without depending on a color surviving.
 * Brand color now lives only where it does survive: the header and button fills.
 */
export function styledProductName(name: string): string {
  return `<strong style="color:${DARK_THEME.foreground};">${escapeHtml(name)}</strong>`;
}

/**
 * A fill declared twice: once as a colour, once as a flat gradient of the same
 * colour.
 *
 * Gmail's dark theme rewrites `background-color` and leaves `linear-gradient`
 * alone, so the gradient is what actually survives and the colour is the
 * fallback for the clients that ignore `background-image` on a table cell
 * (Outlook's Word engine above all).
 *
 * It lives here rather than beside the buttons because the rule is about any
 * background a mail depends on, and the largest of those is the message panel
 * in the shell. A panel whose fill the client is free to rewrite takes every
 * surface designed to sit flush against it — the outline button above all —
 * out of alignment with it.
 */
export function pinnedFill(color: string): string {
  return `background-color:${color};background-image:linear-gradient(${color},${color});`;
}

/**
 * A mail client will manufacture a link we did not write.
 *
 * Every major client linkifies anything *shaped* like an address in running
 * text, so a bare `someone@example.com` arrives clickable and styled in the
 * client's own blue — a link that is not ours, does not follow our link style,
 * and points somewhere we did not choose. That is a fault whatever the address
 * is: the two known cases are a family-read note pointing outside the platform,
 * and a sender's address in a staff mail that is already the Reply-To, where a
 * second way to reach the same place reads as a different one.
 *
 * So an address that is *displayed* rather than linked has to be defused, and
 * this is the only sanctioned way to do it. It lives here beside `escapeHtml`
 * because it belongs to the same seam — the point where a value becomes text in
 * a mail — and because both templates that need it would otherwise grow their
 * own.
 *
 * Anything a client might read as an address: a run with no whitespace
 * containing a dot followed by two or more letters (`evil.example/x`,
 * `https://www.evil.example`, `someone@example.com`). A word joiner (U+2060)
 * goes in after every dot that a letter follows, and between the colon and the
 * slashes of a scheme. It is zero-width, so the text reads the same; it breaks
 * both the `.tld` and the `scheme://` patterns, so neither kind of linkifier
 * matches. Prose is barely touched — `e.g.` has one letter after its dot,
 * `klo 16.30` a digit, a sentence-ending dot nothing — and a `file.txt` that
 * picks up a joiner loses nothing.
 */
const LINKIFIABLE_RUN = /\S+\.[A-Za-z]{2,}\S*/g;

export function defuseAutolinks(escaped: string): string {
  return escaped.replace(LINKIFIABLE_RUN, (run) =>
    run.replace(/\.(?=[A-Za-z])/g, ".&#8288;").replace(/:\/\//g, ":&#8288;//"),
  );
}
