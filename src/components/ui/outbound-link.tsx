import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

/**
 * A link that leaves the site, marked as such for both audiences: the arrow
 * glyph for a reader who can see it, and `label` — a localized "(opens in a new
 * tab)" — for one who cannot.
 *
 * `label` is a required prop, so no caller can ship an unlabelled outbound
 * link. It is passed in rather than read from `next-intl` here so this stays a
 * plain synchronous component usable from server and client alike.
 */
export function OutboundLink({
  href,
  label,
  children,
}: {
  href: string;
  /** Localized "(opens in a new tab)", read out beside the link. */
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // `inline`, never `inline-flex`: in legal prose this anchor sits
      // mid-sentence, and an inline-flex box cannot break across lines, so a
      // long translator-controlled label would push a paragraph past the 360px
      // floor. The glyph stays with the last word because JSX emits no
      // whitespace between `{children}` and the span below, leaving the browser
      // no break opportunity there.
      className="inline rounded-sm font-medium text-act underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
    >
      {children}
      <span>
        <ExternalLink
          className="ml-0.5 inline h-3 w-3 align-[-0.1em]"
          aria-hidden="true"
        />
        <span className="sr-only">{label}</span>
      </span>
    </a>
  );
}
