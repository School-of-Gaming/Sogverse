/**
 * Query keys for gedu contract acceptance.
 *
 * **A root of its own rather than a branch of the gedu-profiles key**, because
 * the two answer different questions about the same person and are written by
 * different actors. Certification is an *admin's* verdict on an educator;
 * acceptance is the *educator's* own act. Hanging them off one root would mean
 * every certify/de-certify refetched a gedu's signatures and every signature
 * refetched the certification list — invalidations that describe a relationship
 * the data does not have. Nothing gates on the pair together, so nothing needs
 * one key to reach both.
 *
 * **Deliberately not in `gedu-contract.queries.ts`,** for the reason the
 * admin-dashboard and family-feed factories are not in theirs: that file is
 * `"use client"`, so a server component importing from it gets a client
 * reference rather than the object. A gedu surface that hydrates this cache
 * entry server-side has to name the very key the hook reads.
 */
export const geduContractKeys = {
  all: ["gedu-contract"] as const,
  /**
   * One gedu's acceptances. Keyed by id rather than left global because an admin
   * reading a candidate's standing and a gedu reading their own are the same
   * query with different subjects, and RLS answers each of them differently.
   */
  acceptances: (geduId: string) =>
    [...geduContractKeys.all, "acceptances", geduId] as const,
};
