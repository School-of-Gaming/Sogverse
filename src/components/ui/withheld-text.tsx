import { cn } from "@/lib/utils";

/**
 * Filler for a text field this reader may not read — never the field's text.
 *
 * The real text never reaches the browser (see `src/lib/withheld.ts`), so what
 * stands in its place is a fixed run of placeholder Latin: it gives the slot the
 * look of a paragraph somebody wrote, which teaches where that paragraph lives
 * and roughly what it is for, while saying nothing about any particular child,
 * group or building. It is the same words everywhere, deliberately — filler that
 * varied with the data would be a signal about the data. A slot with a shape of
 * its own, such as an email address, passes a fixed stand-in of that shape
 * instead; it is still a constant, never derived from the row.
 *
 * Not translated, and not a string in the message files: it is not copy, it is
 * texture, and the blur is what tells a reader not to try to read it. What a
 * screen reader hears instead is {@link WithheldTextProps.label}, and the filler
 * itself is hidden from assistive technology.
 */
const FILLER =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

/**
 * How many lines the filler may take. A fixed set rather than any number,
 * because each maps onto a clamp class Tailwind has to be able to see written
 * out in full.
 */
export type WithheldTextLines = 1 | 2 | 3 | 4 | 5;

const CLAMP: Record<WithheldTextLines, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
};

interface WithheldTextProps {
  /**
   * What the slot is, said in words — the only thing assistive technology is
   * given here. Every word a component renders is a prop.
   */
  label: string;
  /** How many lines of filler to draw. */
  lines?: WithheldTextLines;
  /**
   * Draw the filler inside a box the shape of a text field, for a slot that is
   * an input for a reader who may write it. The box is not an input: nothing
   * here can be focused or typed into.
   */
  boxed?: boolean;
  /** The text size of the slot it stands in for. */
  size?: "sm" | "xs";
  /**
   * A fixed stand-in shaped like the slot's value, for a slot that is not
   * prose. A constant at the call site — never anything read from the data.
   */
  filler?: string;
  className?: string;
}

export function WithheldText({
  label,
  filler = FILLER,
  lines = 3,
  boxed = false,
  size = "sm",
  className,
}: WithheldTextProps) {
  return (
    <div
      className={cn(
        boxed &&
          "rounded-md border border-border bg-background px-3 py-2",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <p
        aria-hidden
        className={cn(
          "select-none leading-relaxed text-muted-foreground blur-[3px]",
          size === "sm" ? "text-sm" : "text-xs",
          CLAMP[lines],
        )}
      >
        {filler}
      </p>
    </div>
  );
}
