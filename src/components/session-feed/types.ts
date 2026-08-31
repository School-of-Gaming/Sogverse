/**
 * The vocabulary both session feeds are built out of.
 *
 * Deliberately tiny, and it stays tiny. Each surface owns its own entry shape —
 * the gedu's workspace entry carries a gedu note, the whole group's marks and an
 * owed flag; a family's carries one child's mark and nothing else — because
 * narrowing the *type* per surface is what makes "a family surface cannot render
 * a gedu note" a compile-time fact rather than a rule somebody has to remember.
 * What belongs here is only the small pieces those two shapes are assembled
 * from, and a type that only one of them needs belongs in that one's module.
 */

/** How one roster member's attendance was recorded. */
export type AttendanceMark = "present" | "absent";

/**
 * One photo attached to a session's report, as the shared gallery renders it.
 *
 * **Declared here rather than imported from either feed's contracts**, and that
 * is the privacy line doing its job rather than duplication: the gedu document
 * and the family document each carry their own image summary, and a family
 * module may not import a gedu shape at all (the ESLint zone forbids it). The
 * three fields are identical in both, so both arrays satisfy this type
 * structurally and neither surface needs an adapter.
 *
 * `id` is the whole address. The object it names is derived from it by the
 * session-image URL helper, which also passes a leading-slash value straight
 * through — so a preview scene's fixture art travels in this same field and the
 * gallery needs no scene-only override prop. The dimensions are what every
 * renderer sizes its boxes from; nothing measures a decoded image.
 */
export interface SessionPhoto {
  id: string;
  width: number;
  height: number;
}
