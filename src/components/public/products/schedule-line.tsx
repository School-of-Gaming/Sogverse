import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";

/**
 * A schedule line, with its parts kept whole.
 *
 * The formatter joins a line's parts with `SCHEDULE_PART_SEPARATOR` — "Mon, Wed,
 * Fri · 10:00–14:00 (EEST)" — and in a narrow column that wraps wherever the
 * browser likes, which is routinely *inside* the time: a clock face broken across
 * two lines is briefly unreadable and looks like a rendering fault. So each part
 * becomes a no-wrap span and only the separator between them may break, which
 * puts the fold where a reader would put it: after the days, before the time.
 *
 * **A line with no separator is returned untouched, and that is the whole of the
 * care needed here.** Several lines carry no parts to keep together — a camp's
 * date range, a club's term range, the "—" placeholder — and wrapping one of
 * those in a no-wrap span would not be preserving a clock face, it would be
 * taking away the wrapping the line had before anybody thought about this. The
 * split runs first and the one-part case exits before any span is added.
 *
 * **Every surface printing schedule lines renders them through this**, at any
 * width: on a multi-part line the spans are inert wherever there is room, since
 * a part is at most as wide as the line it came from, so one rendering serves
 * the shop's facts rail, its full-width card and the admin product page's
 * reference column alike.
 */
export function ScheduleLine({ line }: { line: string }) {
  const parts = line.split(SCHEDULE_PART_SEPARATOR);
  if (parts.length === 1) return line;
  return (
    <>
      {parts.map((part, idx) => (
        <span key={idx}>
          {idx > 0 && SCHEDULE_PART_SEPARATOR}
          <span className="whitespace-nowrap">{part}</span>
        </span>
      ))}
    </>
  );
}
