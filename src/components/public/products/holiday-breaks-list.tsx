import type { HolidayBreakLine } from "@/lib/products/holiday-breaks-shown";

/**
 * A club's holiday breaks, one line each: the break's name in the reader's
 * locale and its dates — "Autumn break  13–17 Oct".
 *
 * Shared by every family-facing page that lists them (the product page and the
 * purchase confirmation, both inside the "Good to know" card), and fed lines
 * the shared rule has already chosen and worded, so the pages and the
 * confirmation mail cannot list different breaks or draw one differently.
 *
 * The dates may wrap under the name in a narrow column (the product page's
 * facts rail) but never break inside themselves: "13–17" split across two
 * lines reads as two dates.
 */
export function HolidayBreaksList({
  lines,
}: {
  lines: readonly HolidayBreakLine[];
}) {
  return (
    <ul className="space-y-0.5">
      {lines.map((line) => (
        <li key={line.id} className="flex flex-wrap justify-between gap-x-3">
          <span>{line.name}</span>
          <span className="whitespace-nowrap text-muted-foreground">
            {line.range}
          </span>
        </li>
      ))}
    </ul>
  );
}
