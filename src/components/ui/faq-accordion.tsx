import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Heading, type HeadingLevel } from "@sog/ui";

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
  /**
   * The heading level each question is drawn at: one below the heading the
   * caller draws over the list, or 2 where the list has none of its own. Stated
   * at every call site because only the caller can see the page's outline, and
   * a guessed default skips a level on whichever page it guesses wrong for.
   */
  questionLevel: Exclude<HeadingLevel, 1>;
}

/**
 * The divided card of question rows that every FAQ on the site is drawn as.
 *
 * Native `<details>`/`<summary>` rather than an ARIA disclosure widget — the
 * answers are readable and keyboard-operable before hydration and with no
 * client JS at all, which is the right shape under a nonce-based CSP and on a
 * public page a stranger may meet on a slow connection.
 *
 * **Each question is a heading inside its `<summary>`, not a plain span.**
 * Search engines and AI assistants tie an answer to its question through the
 * page's headings, and a span gives them nothing to tie it to. The cost is
 * accepted, by the owner: some screen readers — VoiceOver in particular —
 * flatten a heading inside `<summary>` into the button, so the row is announced
 * as a button carrying the question and does not appear in the headings list,
 * while NVDA and JAWS announce both. The row stays fully operable and its
 * question is still read out everywhere, which is what matters. Going back to a
 * span gives up the outline, and swapping in an ARIA disclosure widget to get
 * both gives up everything the native element is here for. The heading takes
 * the `item-title` step, the body size the old span was set at, so the row
 * looks exactly as it did.
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
 * **There is no box around the list, only the lines between the rows.** It used
 * to be a bordered card, and the outer edge read as a panel of its own on a page
 * whose other sections have none — a light rectangle drawn around copy nobody
 * had set apart. The divider is what the construct actually needs: it says where
 * one question ends and the next begins, and the rows sit on the page's own
 * ground like everything else in the reading column.
 *
 * The component owns the row markup and nothing else: no namespace, no key
 * array, no section wrapper, no tinted band. Those are all page-specific, and
 * pulling any of them in here is what turns a shared list into per-call-site
 * configuration.
 */
export function FaqAccordion({ items, questionLevel }: FaqAccordionProps) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <details key={item.key} className="group">
          {/* `list-none` kills the disclosure triangle in Gecko and Blink, the
              `::-webkit-details-marker` rule in WebKit; the chevron below
              replaces it so the affordance sits on the side the reader's thumb
              is already on. */}
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-md px-3 py-4 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-act sm:px-4 sm:py-5 [&::-webkit-details-marker]:hidden">
            <Heading level={questionLevel} step="item-title">
              {item.question}
            </Heading>
            <ChevronDown
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="space-y-3 px-3 pb-5 leading-7 text-muted-foreground sm:px-4">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
