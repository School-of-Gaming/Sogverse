import "server-only";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Bump when the feature set below changes. We never edit an existing
// configuration — we supersede it, so a new version tag forces a fresh config
// to be created on next use; the old one is simply left unreferenced in Stripe.
const PORTAL_CONFIG_VERSION = "1";
const VERSION_KEY = "sogverse_portal_config_version";

// Resolve the id once per serverless instance so we only hit
// `configurations.list` on a cold start, not on every portal open.
let cachedId: string | null = null;

/**
 * Return the id of our code-owned Customer Portal configuration, creating it on
 * first use. We own this explicitly so the portal never falls back to Stripe's
 * dashboard-managed default config — that default (in the test account) exposes
 * a "switch plan" picker with weekly tiers we don't actually sell.
 *
 * The one behaviour we care about versus the default is
 * `subscription_update.enabled = false`: parents can update payment methods,
 * view invoices, and cancel, but cannot self-switch plans from the portal.
 *
 * Lazy-ensure (find-by-version-tag, else create) means zero manual setup —
 * this self-provisions in both the test and prod Stripe accounts, scoped
 * automatically by whichever `STRIPE_SECRET_KEY` the process holds.
 */
export async function getPortalConfigurationId(): Promise<string> {
  if (cachedId) return cachedId;

  const existing = await stripe.billingPortal.configurations.list({
    limit: 100,
  });
  const found = existing.data.find(
    (config) => config.metadata?.[VERSION_KEY] === PORTAL_CONFIG_VERSION,
  );
  if (found) {
    cachedId = found.id;
    return found.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    metadata: { [VERSION_KEY]: PORTAL_CONFIG_VERSION },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "name", "address", "phone"],
      },
      subscription_cancel: { enabled: true },
      // The whole point of owning this config: never offer plan switching.
      subscription_update: { enabled: false },
    },
  });
  cachedId = created.id;
  return created.id;
}
