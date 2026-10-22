import type { HolidayBreakLine } from "@/lib/products/holiday-breaks-shown";

/**
 * A club's holiday breaks: each break's name in the reader's locale, in bold,
 * and its dates on the line under it — the confirmation mail draws them the
 * same way.
 *
 * Used inside the product page's "Good to know" card, and fed lines the shared
 * rule has already chosen and worded, so the page and the confirmation mail
 * cannot list different breaks or draw one differently.
 *
 * The dates always take their own line, so every break reads the same in the
 * product page's wide card and in its narrow facts rail, and never break
 * inside themselves: "13–17" split across two lines reads as two dates.
 */
export function HolidayBreaksList({
  lines,
}: {
  lines: readonly HolidayBreakLine[];
}) {
  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line.id}>
          <span className="block font-semibold">{line.name}</span>
          <span className="block whitespace-nowrap text-muted-foreground">
            {line.range}
          </span>
        </li>
      ))}
    </ul>
  );
}
