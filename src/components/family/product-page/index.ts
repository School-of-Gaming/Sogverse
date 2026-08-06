/*
 * Client-safe surface only. `FamilyProductWorkspace` is deliberately **not**
 * re-exported here: it is a server component that reaches for the server
 * Supabase client (and through it `next/headers`), and this barrel is imported
 * by `"use client"` modules — the preview scene among them. Adding it would
 * drag server-only code into a client bundle and break the build. The six route
 * shells import it by path, which is the only place it is wanted.
 */
export { FamilyProductBackLink } from "./BackLink";
export { FamilyProductNotFound } from "./FamilyProductNotFound";
export { FamilyProductPage } from "./FamilyProductPage";
export { FamilyProductPageBody } from "./FamilyProductPageBody";
export { FamilyProductPageSkeleton } from "./FamilyProductPageSkeleton";
export type {
  FamilyProductPageBodyProps,
  FamilyProductSchedule,
} from "./FamilyProductPageBody";
export { FamilySessionFeed } from "./FamilySessionFeed";
export { FamilySessionFeedItem } from "./FamilySessionFeedItem";
export type {
  FamilyFutureSessionEntry,
  FamilyPastSessionEntry,
  FamilyProductGedu,
  FamilyProductVenue,
  FamilySessionEntry,
} from "./types";
