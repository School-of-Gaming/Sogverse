import type { LandingSection } from "@/lib/landing-pages/sections";
import type { ParsedLandingVersion } from "./landing-pages.contracts";

/**
 * What one landing page write carries that can hold a link: the structure
 * (internal button targets) when the write sets it, and the versions (the
 * `landing` markdown fields) it writes.
 */
export interface LandingWrite {
  sections: LandingSection[] | null;
  versions: ParsedLandingVersion[];
}

/**
 * Every landing page write passes through here, in the service, after its
 * input is parsed and before anything is sent to the database — so the editor
 * and the MCP tools are held to the same links.
 *
 * This is where own-site links are made canonical: relative or on the site's
 * own host, the locale prefix and translated segments removed, a link to a
 * page with per-language slugs stored at its id address, and a link that
 * leads to no page on the site refused. Until that is wired in, every write
 * passes through unchanged.
 */
export function canonicaliseLandingLinks(write: LandingWrite): Promise<LandingWrite> {
  return Promise.resolve(write);
}
