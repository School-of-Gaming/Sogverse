/*
 * The directory's **external** surface, and deliberately only that.
 *
 * Everything else here — the page shell, the skeleton, the not-found card, the
 * back link, the feed and its item — is reached by relative path from inside
 * this directory and by nothing outside it. Re-exporting them would advertise a
 * public surface the directory does not have, and a barrel entry nobody imports
 * is indistinguishable from one whose last consumer was deleted.
 *
 * `FamilyProductWorkspace` is a separate case and stays out for a hard reason:
 * it is a server component reaching for the server Supabase client (and through
 * it `next/headers`), while this barrel is imported by `"use client"` modules —
 * the preview scene among them. Adding it would drag server-only code into a
 * client bundle and break the build. The six route shells import it by path,
 * which is the only place it is wanted.
 */
export { FamilyProductPageBody } from "./FamilyProductPageBody";
export type { FamilySessionEntry } from "./types";
