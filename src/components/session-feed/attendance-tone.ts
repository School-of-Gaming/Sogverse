import type { AttendanceMark } from "./types";

/**
 * How an attendance mark is **toned**, wherever one is rendered.
 *
 * Two surfaces draw these marks — a family reads their own child's on the
 * product page, a gedu reads the whole group's on the register — and they had
 * arrived at the same decision independently, which is the arrangement that
 * only stays consistent until somebody edits one of them.
 *
 * **"Present" is a small positive; "absent" is muted and neutral, never
 * destructive.** The reason is in the data, not in the design: the attendance
 * enum is currently `present | absent` and nothing more, so an absence a parent
 * arranged in advance (a holiday, an appointment, an ill child kept at home) is
 * stored identically to a child who simply never turned up. A red or
 * warning-toned mark would have the product editorialise a distinction it cannot
 * actually make — and on the family surface it would do so to the parent who
 * arranged the absence themselves.
 *
 * **`unmarked` is not a third kind of answer**, it is the absence of one: a gap
 * in the register, which the gedu's sheet shows as still asking for something
 * and the family's surface does not show at all. A family shown "not marked"
 * would read it as a fact about their child rather than about the paperwork.
 *
 * A `planned_absent` value — marked by the parent, in advance, from the future
 * row of their own feed — is a planned addition to the enum. When it lands, the
 * tone decision for it is made **here, once**, and both renderers follow.
 *
 * **The glyphs are deliberately not here.** The two mark sets are different
 * sizes: the register has three states and spends a cross on `absent` so the
 * dash can mean "nobody has said", while the family's two-state chip has no
 * unmarked case to distinguish and uses the calmer dash for the absence itself.
 * That is a choice about each set, not about the mark, and folding it in here
 * would force one of the two to say something it does not mean.
 */

/** A mark, or the absence of one — the three states a register row can be in. */
export type AttendanceMarkState = AttendanceMark | "unmarked";

/** The semantic tokens one state is drawn in. */
export interface AttendanceTone {
  /** Text (and icon) colour. */
  text: string;
  /** Border colour, for the chip forms that draw one. */
  border: string;
}

export const ATTENDANCE_TONE: Record<AttendanceMarkState, AttendanceTone> = {
  // Full value on the edge, because these chips carry no ground: the edge is
  // most of the chip's area and is what makes the mark readable at a glance. A
  // low-alpha edge is a hue mixed toward the page, which is neither the family
  // colour nor a neutral.
  present: { text: "text-success", border: "border-success" },
  // Warning, not muted: absent and unmarked sat one shade of grey apart and
  // could not be told apart at a glance (owner ruling, 2026-08-25). Warning is
  // still deliberately short of destructive — an absence is a fact to notice,
  // not a fault to punish, on the family surface as much as the staff ones.
  absent: { text: "text-warning", border: "border-warning" },
  // The state still asking for something, so it is the one that stays faint and
  // keeps a dashed edge instead of settling in beside the answered chips.
  unmarked: {
    text: "text-muted-foreground/70",
    border: "border-dashed border-border/70",
  },
};

/** Which state a possibly-missing mark is in. */
export function attendanceMarkState(
  mark: AttendanceMark | null | undefined,
): AttendanceMarkState {
  return mark ?? "unmarked";
}
