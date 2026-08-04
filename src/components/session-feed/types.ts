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
