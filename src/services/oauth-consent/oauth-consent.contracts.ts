import { z } from "zod";
import { isNavigableRedirect } from "@/lib/oauth-consent";

/** The admin's answer to an AI app asking to connect, from the consent page. */
export const oauthConsentBody = z.object({
  authorizationId: z.string().min(1).max(255),
  decision: z.enum(["approve", "deny"]),
});
export type OAuthConsentBody = z.infer<typeof oauthConsentBody>;

/**
 * Where the browser goes next: back to the AI app, carrying the code or the
 * refusal. Supabase builds it from a redirect URI the client registered; the
 * refinement keeps a script scheme from ever reaching `window.location`.
 */
export const oauthConsentResponse = z.object({
  redirectUrl: z.string().refine(isNavigableRedirect),
});
export type OAuthConsentResponse = z.infer<typeof oauthConsentResponse>;
