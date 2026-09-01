import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqAccordionItem {
  /** Stable React key — the caller's own message key for the entry. */
  key: string;
  /** The question, already resolved to the reader's locale. */
  question: string;
  /**
   * The answer, already rendered. A caller composing links, a second
   * paragraph or any other page-specific shape does it here, at its own call
   * site — this component never resolves a string or a rich-text tag.
   */
  answer: ReactNode;
}

interface FaqAccordionProps {
  /**
   * The questions in the order they are to be read. Order is owned by the
   * caller (a key array beside its own copy), so every locale renders the same
   * sequence.
   */
  items: readonly FaqAccordionItem[];
}

/**
 * The divided card of question rows that every FAQ on the site is drawn as.
 *
 * Native `<details>`/`<summary>` rather than an ARIA disclosure widget — the
 * answers are readable and keyboard-operable before hydration and with no
 * client JS at all, which is the right shape under a nonce-based CSP and on a
 * public page a stranger may meet on a slow connection.
 *
 * Expanding an answer pushes the rows below it down. That is the direct result
 * of the reader's own tap, on the surface they tapped, so the layout rule is
 * satisfied — nothing moves on data's schedule.
 *
 * **Zero items renders nothing at all** — not an empty card, not a hole where
 * one would go. FAQ surfaces are seeded empty and grow one question at a time,
 * and a slot held open for copy that does not exist yet is dead reserved space.
 * A heading over the list belongs to the caller for the same reason: the
 * caller is the only place that can decide not to draw one.
 *
 * The component owns the row markup and nothing else: no namespace, no key
 * array, no section wrapper, no tinted band. Those are all page-specific, and
 * pulling any of them in here is what turns a shared list into per-call-site
 * configuration.
 */
export function FaqAccordion({ items }: FaqAccordionProps) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card/50">
      {items.map((item) => (
        <details key={item.key} className="group">
          {/* `list-none` kills the disclosure triangle in Gecko and Blink, the
              `::-webkit-details-marker` rule in WebKit; the chevron below
              replaces it so the affordance sits on the side the reader's thumb
              is already on. */}
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 text-left font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <ChevronDown
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="space-y-3 px-4 pb-5 leading-7 text-muted-foreground sm:px-6">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
