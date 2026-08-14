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

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">${text}</p>`;
}

export function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:18px;font-weight:bold;color:${DARK_THEME.foreground};">${text}</h2>`;
}

export function styledName(name: string): string {
  // Class targets the Gmail-specific background-clip:text rule in layout.ts <style> block.
  // Inline style is the default for all other email clients.
  return `<span class="brand-primary" style="color:${BRAND.primary};">${escapeHtml(name)}</span>`;
}

/**
 * Bold, in the body's own text color — deliberately *not* the brand secondary it
 * used to carry. Gmail's dark-theme color rewriting left that purple unreadable
 * against the card, and the background-clip workaround that saves the primary is
 * a Gmail-only patch on a problem the secondary hits in more clients than one.
 * Weight is the emphasis every client renders the same way, so the product name
 * still stands out of the sentence without depending on a color surviving.
 * Brand color now lives only where it does survive: the header and button fills.
 */
export function styledProductName(name: string): string {
  return `<strong style="color:${DARK_THEME.foreground};">${escapeHtml(name)}</strong>`;
}
