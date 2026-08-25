import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { UserRole } from "@/types";

/**
 * The route verification spine — docs/route-boundary-architecture.md §3.3.
 *
 * The HTTP route boundary has the same shape of problem the database
 * authorization layer had: the right way to write a route exists and is mostly
 * followed, but a deviation fails no automated check. Nothing distinguishes a
 * deliberately public route from a route whose author forgot the gate.
 *
 * The fix is the same shape too. Every handler on the surface carries exactly
 * one machine-readable classification in the registry below, and four checks
 * keep that registry honest:
 *
 *   1. Completeness — the route files on disk and the registry agree in both
 *      directions, and each file's declared handlers are the methods it really
 *      exports. A new unclassified route fails CI.
 *   2. Static conformance — a handler that authenticates its caller must
 *      contain the boundary primitive. A file containing neither the primitive
 *      nor the role gate has to be a reasoned carve-out.
 *   3. Admin-client pinning — the set of files reaching for the service-role
 *      client equals the set that justified it. A new import site without a
 *      written justification fails CI.
 *   4. Test linkage — every classified handler names an integration test, and
 *      that test really exists and really exercises the route.
 *
 * They interlock: 1 forces a classification to exist, 2 and 3 force the
 * classification to match what the file actually does, 4 forces something to be
 * verifying the behaviour. Allowlist growth is the failure mode of every
 * allowlist design, and check 1 is what polices it — so the registry is
 * deliberately verbose, and every carve-out costs its author a sentence.
 *
 * The registry seeds REALITY AS IT IS, warts included: the route that hand-rolls
 * its session check instead of using the shared gate, the webhook challenge that
 * compares its secret with a plain `===`, and the handlers with no integration
 * test at all are all recorded as what they are rather than quietly excused.
 * Recording a wart is what makes it a tracked item instead of an invisible one.
 */

// ---------------------------------------------------------------------------
// Classification vocabulary
// ---------------------------------------------------------------------------

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

const METHODS: readonly Method[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

/**
 * The auth posture taxonomy. It is exhaustive over the current surface by
 * construction — a route that fits none of these is the first finding, not a
 * reason to widen a case silently.
 *
 * Every posture except `role-gated` carries a mandatory `reason`: role-gated is
 * the default and needs no defence, and everything else is a decision someone
 * made that the next reader deserves to see.
 */
type Posture =
  /** The shared role gate: a named set of roles, plus its two extra gates. */
  | {
      kind: "role-gated";
      roles: readonly UserRole[];
      /** Skips the parent-PIN gate, for routes a locked customer must reach. */
      allowUnverified?: true;
      /** Refuses an uncertified educator, for gedu actions that are a boundary. */
      requireCertifiedGedu?: true;
    }
  /** Any signed-in caller, no role check. */
  | { kind: "any-authenticated"; reason: string }
  /** Reachable with no session at all. */
  | { kind: "public"; reason: string }
  /** Public, and its whole purpose is to change the session cookies. */
  | { kind: "session-mutating-public"; reason: string }
  /** A signed token in the request IS the authorization; session-agnostic. */
  | { kind: "signed-token"; reason: string }
  /** Public, but silently elevates a recognized caller. Must fail closed. */
  | { kind: "optional-auth"; reason: string }
  /** A third party's signature over the raw body is the authorization. */
  | { kind: "webhook"; verifier: WebhookVerifier; reason: string }
  /** Server-to-server, authorized by a shared secret rather than a session. */
  | { kind: "api-key"; reason: string };

/**
 * Webhook verifier strategies, recorded per handler because their error
 * contracts diverge and the divergence is load-bearing: Stripe wants a 5xx so
 * it retries, and Meta disables an endpoint that answers 5xx persistently.
 */
type WebhookVerifier =
  | "stripe-signature"
  | "meta-hmac-sha256"
  | "meta-challenge-timing-safe"
  | "discord-ed25519";

/**
 * How the handler takes its request payload. `schema: null` on a `json` entry
 * records a body parsed without a schema — a hand-rolled shape check, or none
 * at all. There are none left, and the `null` stays in the type as the slot a
 * regression would have to occupy: recording one is what makes it countable,
 * and check 1 asserts the count is still zero.
 */
type BodyDiscipline =
  | { kind: "json"; schema: string | null }
  | { kind: "multipart"; schema: string }
  | { kind: "raw"; reason: string }
  | { kind: "none" };

interface HandlerEntry {
  posture: Posture;
  body: BodyDiscipline;
  /**
   * The integration test that exercises this handler, repo-relative. `null`
   * records a handler with no test at all — allowed only while the registry is
   * seeding reality; the sweep ends with none left.
   */
  test: string | null;
}

interface RouteEntry {
  handlers: Partial<Record<Method, HandlerEntry>>;
  /**
   * Why this file may construct the service-role client. Seeded from the
   * database-authorization refactor's triage, which classified every module
   * that used that client with a one-clause justification.
   */
  adminClient?: string;
  /**
   * Why this file contains neither the boundary primitive nor the shared role
   * gate despite authenticating its caller. A recorded exception, not a
   * permanent allowance — check 2 fails if the file later gains the primitive
   * and the exception is left behind.
   */
  offPrimitive?: string;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const API_DIR = join("src", "app", "api");

const TESTS = {
  adminLocations: "tests/integration/api/admin-locations.test.ts",
  adminSiteNotes: "tests/integration/api/admin-site-notes.test.ts",
  billingPortal: "tests/integration/api/billing-portal.test.ts",
  callback: "tests/integration/auth/callback.test.ts",
  checkout: "tests/integration/api/checkout-products-create.test.ts",
  discordInteractions: "tests/integration/api/discord-interactions.test.ts",
  familyList: "tests/integration/api/family-list.test.ts",
  feedback: "tests/integration/api/feedback.test.ts",
  forgotPassword: "tests/integration/auth/forgot-password.test.ts",
  gamersCreate: "tests/integration/api/gamers-create.test.ts",
  gamersUpdate: "tests/integration/api/gamers-update.test.ts",
  geduGamerMinecraft: "tests/integration/api/gedu-gamer-minecraft.test.ts",
  geduGamerRoblox: "tests/integration/api/gedu-gamer-roblox.test.ts",
  geduRegister: "tests/integration/api/gedu-register.test.ts",
  geduSessionEmailReport:
    "tests/integration/api/gedu-session-email-report.test.ts",
  locationsSearch: "tests/integration/api/locations-search.test.ts",
  minecraftAccount: "tests/integration/api/minecraft-account.test.ts",
  minecraftPasswordReset:
    "tests/integration/api/tools-minecraft-password-reset.test.ts",
  minecraftJoinCheck: "tests/integration/api/minecraft-join-check.test.ts",
  minecraftVerify: "tests/integration/api/minecraft-verify.test.ts",
  pin: "tests/integration/auth/pin.test.ts",
  productImagesManage: "tests/integration/api/product-images-manage.test.ts",
  productImagesReplace: "tests/integration/api/product-images-replace.test.ts",
  productImagesUpload: "tests/integration/api/product-images-upload.test.ts",
  productsCreate: "tests/integration/api/products-create.test.ts",
  productsGroupsApply: "tests/integration/api/products-groups-apply.test.ts",
  productsParticipations: "tests/integration/api/products-participations.test.ts",
  productsParticipationsDelete:
    "tests/integration/api/products-participations-delete.test.ts",
  productsParticipationsTransition:
    "tests/integration/api/products-participations-transition.test.ts",
  productsUpdate: "tests/integration/api/products-update.test.ts",
  register: "tests/integration/auth/register.test.ts",
  adminUserGameAccount: "tests/integration/api/admin-user-game-account.test.ts",
  robloxAccount: "tests/integration/api/roblox-account.test.ts",
  robloxAvatars: "tests/integration/api/roblox-avatars.test.ts",
  robloxVerify: "tests/integration/api/roblox-verify.test.ts",
  sendTestEmail: "tests/integration/api/send-test-email.test.ts",
  signout: "tests/integration/auth/signout.test.ts",
  stripeWebhook: "tests/integration/api/stripe-webhook-products.test.ts",
  switchAccount: "tests/integration/auth/switch-account.test.ts",
  userLocale: "tests/integration/api/user-locale.test.ts",
  verifyEmailSend: "tests/integration/auth/verify-email-send.test.ts",
  voiceInstantCreate: "tests/integration/api/voice-instant-create.test.ts",
  voiceInstantEnd: "tests/integration/api/voice-instant-end.test.ts",
  voiceInstantExists: "tests/integration/api/voice-instant-exists.test.ts",
  voiceInstantToken: "tests/integration/api/voice-instant-token.test.ts",
  voiceToken: "tests/integration/api/voice-token.test.ts",
  waitlist: "tests/integration/api/participations-waitlist.test.ts",
  whatsappSend: "tests/integration/api/whatsapp-send.test.ts",
  whatsappWebhook: "tests/integration/api/whatsapp-webhook.test.ts",
} as const;

const ADMIN_ONLY: Posture = { kind: "role-gated", roles: ["admin"] };

const ROUTE_REGISTRY: Record<string, RouteEntry> = {
  // --- Admin surfaces ------------------------------------------------------

  "src/app/api/admin/locations/[id]/route.ts": {
    handlers: {
      PATCH: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "updateLocationBody" },
        test: TESTS.adminLocations,
      },
    },
  },

  "src/app/api/admin/locations/create/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "createLocationBody" },
        test: TESTS.adminLocations,
      },
    },
  },

  "src/app/api/admin/users/[id]/game-account/route.ts": {
    handlers: {
      PATCH: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "adminGameAccountBody" },
        test: TESTS.adminUserGameAccount,
      },
    },
  },

  "src/app/api/admin/products/[id]/groups/apply/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "groupChangeSet" },
        test: TESTS.productsGroupsApply,
      },
    },
  },

  "src/app/api/admin/products/[id]/participations/[participationId]/route.ts": {
    handlers: {
      DELETE: {
        posture: ADMIN_ONLY,
        body: { kind: "none" },
        test: TESTS.productsParticipationsDelete,
      },
      PATCH: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "waitlistTransitionBody" },
        // The handler that was untested while its file-mate was covered — the
        // shape a per-file view of coverage hides, and the reason check 4 is
        // per handler rather than per file.
        test: TESTS.productsParticipationsTransition,
      },
    },
  },

  "src/app/api/admin/products/[id]/participations/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "adminEnrollParticipantBody" },
        test: TESTS.productsParticipations,
      },
    },
  },

  // The catalogue routes. All three write the `product_images` table on the
  // caller's own session — an admin-only RLS policy is what decides there — and
  // reach for the service-role client for the storage bucket alone, which has
  // no policies at all.
  "src/app/api/admin/product-images/route.ts": {
    adminClient:
      "privileged-bucket storage upload only (the bucket carries no policies); the catalogue row is inserted on the user client",
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: {
          kind: "multipart",
          schema:
            "inline: one `file` plus an optional `label`, read by readImageUpload — no JSON field, and the label is capped rather than refused (productImageLabel governs the rename route, where the label is the request)",
        },
        test: TESTS.productImagesUpload,
      },
    },
  },

  "src/app/api/admin/product-images/[id]/route.ts": {
    adminClient:
      "privileged-bucket object removal only; the row delete and the linked-product count run on the user client",
    handlers: {
      PATCH: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "renameProductImageBody" },
        test: TESTS.productImagesManage,
      },
      DELETE: {
        posture: ADMIN_ONLY,
        body: { kind: "none" },
        test: TESTS.productImagesManage,
      },
    },
  },

  "src/app/api/admin/product-images/[id]/replace/route.ts": {
    adminClient:
      "privileged-bucket storage upload only (the bucket carries no policies); the catalogue row and the one-statement repoint of every linked product run on the user client",
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: {
          kind: "multipart",
          schema:
            "inline: one `file`, read by readImageUpload — the replaced entry supplies the label, so the form carries nothing else",
        },
        test: TESTS.productImagesReplace,
      },
    },
  },

  // Both product routes became plain JSON when a product's picture became a
  // catalogue entry it points at: no file rides along any more, so there is no
  // multipart form to read and no storage for these routes to touch.
  "src/app/api/admin/products/[id]/update/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "updateProductData" },
        test: TESTS.productsUpdate,
      },
    },
  },

  "src/app/api/admin/products/create/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "createProductData" },
        test: TESTS.productsCreate,
      },
    },
  },

  "src/app/api/admin/send-test-email/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: {
          kind: "json",
          schema: "inline: requestSchema (declared on the primitive)",
        },
        test: TESTS.sendTestEmail,
      },
    },
  },

  "src/app/api/admin/site-notes/route.ts": {
    handlers: {
      PATCH: {
        posture: ADMIN_ONLY,
        body: { kind: "json", schema: "updateSiteNotesBody" },
        test: TESTS.adminSiteNotes,
      },
    },
  },

  "src/app/api/admin/whatsapp/send/route.ts": {
    handlers: {
      POST: {
        posture: ADMIN_ONLY,
        body: {
          kind: "json",
          schema: "inline: requestSchema (declared on the primitive)",
        },
        test: TESTS.whatsappSend,
      },
    },
  },

  // --- Auth ----------------------------------------------------------------

  "src/app/api/auth/callback/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "session-mutating-public",
          reason:
            "the OAuth redirect target: it exchanges the provider's code for a session, so it must be reachable before one exists. Returns only redirects, and its caller-supplied `next` is resolved to an internal path before use",
        },
        body: { kind: "none" },
        test: TESTS.callback,
      },
    },
  },

  "src/app/api/auth/forgot-password/route.ts": {
    adminClient: "Auth Admin API (recovery link generation)",
    handlers: {
      POST: {
        posture: {
          kind: "public",
          reason:
            "a password reset is requested by someone who cannot sign in — and, from the settings page, by someone who is signed in and wants a new password anyway; it is gateless because the first caller has no session to gate, not because the second is exempt from one. Always answers 200 regardless of whether the address exists, which is the enumeration defence",
        },
        body: {
          kind: "json",
          // Parsed inside the handler rather than through the primitive's body
          // slot: the slot answers 400 on a schema failure, and this route must
          // answer 200 whatever happens or the answer itself enumerates.
          schema: "inline: requestSchema (parsed in-handler)",
        },
        test: TESTS.forgotPassword,
      },
    },
  },

  "src/app/api/auth/register/route.ts": {
    adminClient:
      "Auth Admin API (self-registration creates the auth user before any session exists), plus the optional home-location write onto the profile that same request creates",
    handlers: {
      POST: {
        posture: {
          kind: "public",
          reason:
            "parents self-register, so no session can exist yet. It creates an account and mails a verification link to the address that account was created with — the same creation power as the educator registration route. The exposure is one step wider, on purpose: an address that already has an account gets a distinct 409, where the educator route collapses every refusal into one 400. That confirms account existence to anyone who asks, and it is accepted because registration has to tell the parent which of the two problems they have, and because the client-side flow this replaced leaked the same fact through the empty identities array signUp() returns. Unlike forgot-password, which answers 200 whatever it finds because nobody needs to be told anything by it. The account it creates is never privileged: handle_new_user hardcodes the customer role, so no key in the body can influence what is granted",
        },
        body: { kind: "json", schema: "registerParentBody" },
        test: TESTS.register,
      },
    },
  },

  "src/app/api/auth/pin/forgot/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["customer"],
          allowUnverified: true,
        },
        body: { kind: "none" },
        test: TESTS.pin,
      },
    },
  },

  "src/app/api/auth/pin/reset/route.ts": {
    adminClient:
      "resolves its user from a signed token rather than a session, so there is no caller to act as",
    handlers: {
      POST: {
        posture: {
          kind: "signed-token",
          reason:
            "completes a PIN reset from an emailed link. The signed, single-use token delivered to the parent's inbox IS the authorization; a session cannot be required because the parent is locked out of the one they have",
        },
        body: { kind: "json", schema: "inline: { token, pin }" },
        test: TESTS.pin,
      },
    },
  },

  "src/app/api/auth/pin/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["customer"],
          allowUnverified: true,
        },
        body: { kind: "json", schema: "pinBody" },
        test: TESTS.pin,
      },
    },
  },

  "src/app/api/auth/pin/status/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "role-gated",
          roles: ["customer"],
          allowUnverified: true,
        },
        body: { kind: "none" },
        test: TESTS.pin,
      },
    },
  },

  "src/app/api/auth/pin/verify/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["customer"],
          allowUnverified: true,
        },
        body: { kind: "json", schema: "pinBody" },
        test: TESTS.pin,
      },
    },
  },

  "src/app/api/auth/verify-email/send/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          // Every role with a real inbox. `gamer` is excluded deliberately: a
          // gamer's address is the synthetic `@gamer.sogverse.internal` one the
          // account was created with, so there is nobody to write to and
          // nothing a stamp on it would mean.
          roles: ["customer", "gedu", "admin"],
        },
        body: { kind: "none" },
        test: TESTS.verifyEmailSend,
      },
    },
  },

  "src/app/api/auth/signout/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "session-mutating-public",
          reason:
            "clearing a session must work even when the session is already unusable, so requiring a valid one would strand exactly the callers who need it. POST-only is the CSRF control: a cross-origin top-level POST carries no SameSite=Lax cookie, so a hostile page cannot force a sign-out. Answers a 303 the browser follows as a full-page GET",
        },
        body: { kind: "none" },
        test: TESTS.signout,
      },
    },
  },

  "src/app/api/auth/switch-account/route.ts": {
    adminClient: "Auth Admin API (user lookup and magic-link generation)",
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["customer", "gamer"],
          allowUnverified: true,
        },
        body: { kind: "json", schema: "inline: switchAccountBody" },
        test: TESTS.switchAccount,
      },
    },
  },

  // --- Checkout and billing ------------------------------------------------

  "src/app/api/checkout/products/create/route.ts": {
    adminClient:
      "caches a Stripe customer id onto the grant-locked billing table; an authenticated write path there would let a user point their billing row at someone else's Stripe customer",
    handlers: {
      POST: {
        posture: { kind: "role-gated", roles: ["customer"] },
        body: { kind: "json", schema: "createCheckoutBody" },
        test: TESTS.checkout,
      },
    },
  },

  "src/app/api/parent/billing-portal/route.ts": {
    adminClient: "same Stripe-customer helper as checkout",
    handlers: {
      POST: {
        posture: { kind: "role-gated", roles: ["customer"] },
        body: { kind: "json", schema: "billingPortalBody" },
        test: TESTS.billingPortal,
      },
    },
  },

  // --- Discord -------------------------------------------------------------

  "src/app/api/discord/interactions/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "webhook",
          verifier: "discord-ed25519",
          reason:
            "Discord's interaction endpoint. There is no session — the Ed25519 signature over the timestamp and raw body is the authorization, and Discord de-registers an endpoint that fails its verification handshake",
        },
        body: {
          kind: "raw",
          reason: "the signature is computed over the exact bytes sent",
        },
        test: TESTS.discordInteractions,
      },
    },
  },

  // --- Family and feedback -------------------------------------------------

  "src/app/api/family/list/route.ts": {
    adminClient:
      "a gamer legitimately reads siblings beyond their own row-level view; the resolver is scoped to the verified caller's family",
    handlers: {
      GET: {
        posture: {
          kind: "role-gated",
          roles: ["customer", "gamer"],
          allowUnverified: true,
        },
        body: { kind: "none" },
        test: TESTS.familyList,
      },
    },
  },

  "src/app/api/feedback/route.ts": {
    adminClient:
      "the submission write runs on the user client; the admin client survives only for the notification fan-out (every admin's address, a gamer's parent's) which is not in the submitter's view and must not be returnable",
    handlers: {
      POST: {
        // Every role, which is the shared gate's way of spelling "any
        // authenticated caller". Recorded as role-gated rather than
        // any-authenticated because that is what the code does — it loads the
        // profile and applies the parent-PIN gate along the way.
        posture: {
          kind: "role-gated",
          roles: ["admin", "customer", "gamer", "gedu"],
        },
        body: { kind: "json", schema: "inline: feedbackSchema" },
        test: TESTS.feedback,
      },
    },
  },

  // --- Gamer accounts ------------------------------------------------------

  "src/app/api/gamers/[id]/route.ts": {
    adminClient:
      "Auth Admin API (metadata and password updates) interleaved with writes to a LINKED user's rows",
    handlers: {
      PATCH: {
        posture: { kind: "role-gated", roles: ["customer"] },
        body: { kind: "json", schema: "updateGamerBody" },
        test: TESTS.gamersUpdate,
      },
    },
  },

  "src/app/api/gamers/create/route.ts": {
    adminClient:
      "Auth Admin API (user creation, with delete-on-failure compensation)",
    handlers: {
      POST: {
        posture: { kind: "role-gated", roles: ["customer"] },
        body: { kind: "json", schema: "createGamerBody" },
        test: TESTS.gamersCreate,
      },
    },
  },

  // --- Educator surfaces ---------------------------------------------------

  // The role gate only establishes that the caller is staff. WHICH children
  // they may edit is decided by the RPC underneath, which re-derives the caller
  // from auth.uid() and refuses any gamer who is not actively participating in
  // a group that caller is assigned to — so the gamer id in the path names a
  // target and grants nothing.
  //
  // `admin` joined the roles in 00205, when the admin group details page began
  // rendering the gedu workspace's roster body unchanged, inline username
  // editor included: a surface that shows the control has to serve it. This
  // aligns two surfaces rather than granting a power — an admin already holds
  // this exact edit on /admin/users/[id], so nothing here is reachable to them
  // that was not reachable before. The RPC is still the authorization: an admin
  // passes its "and you teach this group" half by role, exactly as they do on
  // the session writers widened in 00200, and every other refusal in the
  // function — the target must be a gamer, a customer or a gamer is refused on
  // the first statement — binds them identically.
  "src/app/api/gedu/gamers/[gamerId]/minecraft/route.ts": {
    handlers: {
      PATCH: {
        posture: { kind: "role-gated", roles: ["gedu", "admin"] },
        body: { kind: "json", schema: "updateGroupMemberMinecraftBody" },
        test: TESTS.geduGamerMinecraft,
      },
    },
  },

  // The Roblox twin of the route above, and the same reasoning applies verbatim:
  // the role gate says "an educator or an admin", and `set_group_member_roblox`
  // says which children that caller may touch, re-deriving them from auth.uid()
  // and letting an admin past the group half alone. Widened alongside its twin
  // in 00205 — the editor the admin page renders is one component serving both
  // platforms, so one of the two routes admitting an admin would have shipped a
  // control that works on Minecraft groups and 403s on Roblox ones.
  "src/app/api/gedu/gamers/[gamerId]/roblox/route.ts": {
    handlers: {
      PATCH: {
        posture: { kind: "role-gated", roles: ["gedu", "admin"] },
        body: { kind: "json", schema: "updateGroupMemberRobloxBody" },
        test: TESTS.geduGamerRoblox,
      },
    },
  },

  // --- Educator self-registration ------------------------------------------

  "src/app/api/gedu/register/route.ts": {
    adminClient:
      "Auth Admin API (self-registration creates the auth user before any session exists)",
    handlers: {
      POST: {
        posture: {
          kind: "public",
          reason:
            "educators self-register, so no session can exist yet. The highest-value public route on the surface: it creates an account, and the account it creates is unverified until an admin approves it",
        },
        body: { kind: "json", schema: "registerGeduBody" },
        test: TESTS.geduRegister,
      },
    },
  },

  // --- Educator sessions ---------------------------------------------------

  // Mailing every family in a group is a trust boundary, so the gate asks for a
  // certified educator on top of the role — group assignment already implies
  // certification, so this declares the posture rather than narrowing who
  // passes, and the gate applies that test only to a caller whose role is
  // `gedu`, so the admin below is unaffected by it. WHICH group may be mailed is
  // decided by the claim RPC underneath, which re-derives the caller from
  // auth.uid(), refuses a gedu a group they do not teach, and refuses anybody a
  // session with no report or one already sent.
  //
  // `admin` joined the roles in 00200, when the same session panel arrived on
  // the admin product page over the same feed component and the same claim. The
  // claim is still the authorization: an admin passes its group half by role,
  // exactly as they now do on the four other session writers, and every other
  // refusal binds them identically.
  "src/app/api/gedu/sessions/email-report/route.ts": {
    adminClient:
      "the claim runs on the user client and is the authorization; the admin client resolves parents' addresses and locales and the admin list, which are not in a gedu's view and are never returned to either role",
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["gedu", "admin"],
          requireCertifiedGedu: true,
        },
        body: { kind: "json", schema: "emailSessionReportBody" },
        test: TESTS.geduSessionEmailReport,
      },
    },
  },

  // --- Locations -----------------------------------------------------------

  "src/app/api/locations/search/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "public",
          reason:
            "the educator registration page asks an applicant where they can work before any account exists, so search cannot require a session. It reads two tables of public reference data — `locations` and, since 00165, `postal_codes` — and every row of both is already SELECTable by anon directly, under identical policies, so the route narrows that surface rather than widening it, and bounds the needle length and page size on the way in. It reads no session at all, which is what lets its answer be cached and shared",
        },
        body: { kind: "none" },
        test: TESTS.locationsSearch,
      },
    },
  },

  // --- Minecraft -----------------------------------------------------------

  "src/app/api/minecraft/account/route.ts": {
    handlers: {
      PATCH: {
        posture: { kind: "role-gated", roles: ["gamer", "gedu"] },
        body: { kind: "json", schema: "updateMinecraftAccountBody" },
        test: TESTS.minecraftAccount,
      },
    },
  },

  // No adminClient entry: the session gating that read the database was removed
  // when it became unportable, so the route reaches nothing. It authenticates,
  // validates the uuid, and answers 501.
  "src/app/api/minecraft/join-check/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "api-key",
          reason:
            "the game server calls this on player join; it has no user session to present. A bearer token compared in constant time is the authorization, and the endpoint fails closed — it admits nobody at all until the gating is rebuilt",
        },
        body: { kind: "none" },
        test: TESTS.minecraftJoinCheck,
      },
    },
  },

  "src/app/api/minecraft/verify/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "public",
          reason:
            "a read-only passthrough to Mojang's public username lookup — no database access and no secrets. The public educator registration page checks a username before any account exists, so it cannot require a session",
        },
        body: { kind: "none" },
        test: TESTS.minecraftVerify,
      },
    },
  },

  // --- Participations ------------------------------------------------------

  "src/app/api/participations/waitlist/route.ts": {
    handlers: {
      POST: {
        posture: { kind: "role-gated", roles: ["customer"] },
        body: { kind: "json", schema: "joinWaitlistBody" },
        test: TESTS.waitlist,
      },
      DELETE: {
        posture: { kind: "role-gated", roles: ["customer"] },
        body: { kind: "json", schema: "leaveWaitlistBody" },
        test: TESTS.waitlist,
      },
    },
  },

  // --- Roblox --------------------------------------------------------------

  "src/app/api/roblox/account/route.ts": {
    handlers: {
      PATCH: {
        posture: { kind: "role-gated", roles: ["gamer", "gedu"] },
        body: { kind: "json", schema: "updateRobloxAccountBody" },
        test: TESTS.robloxAccount,
      },
    },
  },

  "src/app/api/roblox/avatars/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "any-authenticated",
          reason:
            "it takes Roblox account ids and answers with Roblox CDN URLs — both the platform's own public data — and reads no Sogverse row at all, so no role is more entitled to an answer than another and there is nothing here to own. What a session protects is not the data but the budget: the thumbnails API is rate limited to 60 requests a minute per IP across the whole serverless fleet, and an open route would be a free thumbnail proxy draining it",
        },
        body: { kind: "none" },
        test: TESTS.robloxAvatars,
      },
    },
  },

  "src/app/api/roblox/verify/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "public",
          reason:
            "a read-only passthrough to Roblox's public username lookup — no database access and no secrets. It mirrors the Minecraft verify route: a username is checked before any account exists, so it cannot require a session",
        },
        body: { kind: "none" },
        test: TESTS.robloxVerify,
      },
    },
  },

  // --- User settings -------------------------------------------------------

  "src/app/api/user/locale/route.ts": {
    handlers: {
      PATCH: {
        posture: {
          kind: "any-authenticated",
          reason:
            "every role sets their own interface language, and the write is scoped to the caller's own row by a column grant plus a self-update policy, so the role is genuinely irrelevant here",
        },
        body: { kind: "json", schema: "setLocaleBody" },
        test: TESTS.userLocale,
      },
    },
  },

  // --- Platform tools ------------------------------------------------------

  // Resetting a Minecraft Education account password is a moderator power, so
  // it carries the same gate as the instant voice room: admins, plus gedus an
  // admin has certified. The in-app half of the Discord `/reset-password`
  // command, running through the same Graph module.
  "src/app/api/tools/minecraft-password-reset/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["admin", "gedu"],
          requireCertifiedGedu: true,
        },
        body: { kind: "json", schema: "minecraftPasswordResetBody" },
        test: TESTS.minecraftPasswordReset,
      },
    },
  },

  // --- Voice ---------------------------------------------------------------

  "src/app/api/voice/instant/create/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["admin", "gedu"],
          requireCertifiedGedu: true,
        },
        body: { kind: "none" },
        test: TESTS.voiceInstantCreate,
      },
    },
  },

  "src/app/api/voice/instant/end/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["admin", "gedu"],
          requireCertifiedGedu: true,
        },
        body: { kind: "json", schema: "inline: { code } (declared on the primitive)" },
        test: TESTS.voiceInstantEnd,
      },
    },
  },

  "src/app/api/voice/instant/exists/route.ts": {
    handlers: {
      GET: {
        posture: {
          kind: "public",
          reason:
            "the lobby checks whether a room code resolves before asking for camera and microphone permission, and a guest joining by link has no session. Reveals only that a code exists, which anyone holding the code could learn by joining",
        },
        body: { kind: "none" },
        test: TESTS.voiceInstantExists,
      },
    },
  },

  "src/app/api/voice/instant/token/route.ts": {
    handlers: {
      POST: {
        posture: {
          kind: "optional-auth",
          reason:
            "anyone holding the room code may join as a guest, and a recognized admin or verified educator is silently elevated to room owner. A public-or-gated binary cannot express it. Ownership is derived only from the server-side session lookup — never from the request body — and every ambiguous outcome falls through to guest",
        },
        body: { kind: "json", schema: "inline: instantRoomTokenBody" },
        test: TESTS.voiceInstantToken,
      },
    },
  },

  "src/app/api/voice/token/route.ts": {
    adminClient:
      "the self-healing occupancy prune is a cross-user system write no participant is authorized to make",
    handlers: {
      POST: {
        posture: {
          kind: "role-gated",
          roles: ["gedu", "gamer", "admin", "customer"],
        },
        body: { kind: "json", schema: "inline: { groupId } (declared on the primitive)" },
        test: TESTS.voiceToken,
      },
    },
  },

  // --- Webhooks ------------------------------------------------------------

  "src/app/api/webhooks/stripe/products/route.ts": {
    adminClient: "webhook; no session by construction",
    handlers: {
      POST: {
        posture: {
          kind: "webhook",
          verifier: "stripe-signature",
          reason:
            "Stripe posts payment events with no session. The signature over the raw body is the authorization. Its error contract is the inverse of Meta's: a failed write answers 5xx ON PURPOSE so Stripe retries the delivery",
        },
        body: {
          kind: "raw",
          reason: "the signature is computed over the exact bytes sent",
        },
        test: TESTS.stripeWebhook,
      },
    },
  },

  "src/app/api/webhooks/whatsapp/route.ts": {
    adminClient: "webhook; no session by construction",
    handlers: {
      GET: {
        posture: {
          kind: "webhook",
          verifier: "meta-challenge-timing-safe",
          reason:
            "Meta's subscription handshake: it echoes a challenge back when the shared verify token matches. The verify token is compared in constant time, like every other secret comparison on this surface — it was a plain equality check until the sweep fixed it",
        },
        body: { kind: "none" },
        test: TESTS.whatsappWebhook,
      },
      POST: {
        posture: {
          kind: "webhook",
          verifier: "meta-hmac-sha256",
          reason:
            "Meta posts inbound messages and delivery receipts with no session; an HMAC over the raw body, compared in constant time, is the authorization. Its error contract is the inverse of Stripe's: it must answer 200 even for an envelope it cannot parse, because Meta disables an endpoint that errors persistently",
        },
        body: {
          kind: "raw",
          reason: "the HMAC is computed over the exact bytes sent",
        },
        test: TESTS.whatsappWebhook,
      },
    },
  },
};

/**
 * Modules OUTSIDE the route surface that construct the service-role client.
 * Pinned here for the same reason the route entries are: the dangerous thing is
 * not any one use, it is a new use appearing without anyone weighing it.
 */
const NON_ROUTE_ADMIN_CLIENT_SITES: Record<string, string> = {
  "src/lib/supabase/admin.ts": "the client factory itself",
  "src/lib/pin-session-server.ts":
    "resolves a PIN-reset token to a user id with no session in hand; shared by the reset page and the reset route",
  "src/lib/email-verification.server.ts":
    "redeems an emailed verification token, which authorizes itself — the reader may hold no session or somebody else's, and `email_verified_at` has no write grant outside the service role",
  "src/services/family/family.server.ts":
    "the shared family resolver — a gamer legitimately reads siblings beyond their own view",
  "src/app/select-profile/page.tsx":
    "the profile chooser prefetch, through the same family resolver as the family-list route",
};

// ---------------------------------------------------------------------------
// Surface enumeration
// ---------------------------------------------------------------------------

/** Repo-relative, forward-slashed, so registry keys read the same everywhere. */
function repoPath(absolute: string): string {
  return relative(process.cwd(), absolute).split("\\").join("/");
}

function walk(dir: string, matches: (name: string) => boolean): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks fixed in-repo directories (the API route tree and src/), no external input
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, matches);
    return matches(entry.name) ? [full] : [];
  });
}

function readSource(path: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** Handler exports really present in a route file's source. */
function exportedMethods(source: string): Method[] {
  const pattern =
    /^export\s+(?:async\s+function|function|const|let|var)\s+([A-Z]+)\b/gm;
  const found = new Set<Method>();
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const method = METHODS.find((candidate) => candidate === name);
    if (method) found.add(method);
  }
  return METHODS.filter((method) => found.has(method));
}

const ROUTE_FILES = walk(join(process.cwd(), API_DIR), (name) => name === "route.ts")
  .map(repoPath)
  .sort();

const REGISTRY_PATHS = Object.keys(ROUTE_REGISTRY).sort();

/** Every (file, method, entry) triple, which is the real unit of classification. */
const REGISTERED_HANDLERS = Object.entries(ROUTE_REGISTRY).flatMap(
  ([path, entry]) =>
    Object.entries(entry.handlers).map(([method, handler]) => ({
      path,
      method,
      handler,
      label: `${method} ${path}`,
    })),
);

// ---------------------------------------------------------------------------
// Check 1 — completeness
// ---------------------------------------------------------------------------

describe("check 1 — completeness: the surface and the registry agree", () => {
  // Anti-vacuity. Every check below iterates a discovered or declared list; if
  // either list were empty the whole suite would pass while verifying nothing,
  // which is the failure mode a spine must not have.
  it("found route files on disk", () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it("found classified handlers in the registry", () => {
    expect(REGISTERED_HANDLERS.length).toBeGreaterThan(0);
  });

  it("classifies every route file on disk", () => {
    const unclassified = ROUTE_FILES.filter(
      (path) => !REGISTRY_PATHS.includes(path),
    );
    expect(unclassified).toEqual([]);
  });

  it("has no registry entry for a file that no longer exists", () => {
    const stale = REGISTRY_PATHS.filter((path) => !ROUTE_FILES.includes(path));
    expect(stale).toEqual([]);
  });

  it.each(REGISTRY_PATHS)(
    "%s declares exactly the handlers it exports",
    (path) => {
      const declared = Object.keys(ROUTE_REGISTRY[path].handlers).sort();
      const actual = exportedMethods(readSource(path)).sort();
      expect(declared).toEqual(actual);
    },
  );

  it.each(REGISTERED_HANDLERS.map((h) => [h.label, h.handler] as const))(
    "%s carries a reason for any posture that is not role-gated",
    (_label, handler) => {
      if (handler.posture.kind === "role-gated") {
        expect(handler.posture.roles.length).toBeGreaterThan(0);
        return;
      }
      expect(handler.posture.reason.trim().length).toBeGreaterThan(0);
    },
  );

  // The second counter the sweep drove to zero, kept as a ratchet for the same
  // reason as the untested one in check 4: a JSON body parsed by hand is how a
  // shape rule ends up stated twice and drifting, and the only way one comes
  // back is if someone writes the `null` in.
  it("has no JSON handler left without a body schema", () => {
    const unschemad = REGISTERED_HANDLERS.filter(
      (h) => h.handler.body.kind === "json" && h.handler.body.schema === null,
    );
    expect(unschemad.map((h) => h.label).sort()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Check 2 — static conformance
// ---------------------------------------------------------------------------

/**
 * A handler that authenticates its caller has to do it through shared code, so
 * that fixing the gate once fixes it everywhere. `defineRoute` is the primitive;
 * the bare role gate is the pre-primitive shape and still counts while the sweep
 * runs. A file that contains neither, yet claims to authenticate, must say why —
 * and that exception expires automatically, because a file that later gains the
 * primitive while keeping its exception fails the same test.
 */
describe("check 2 — static conformance: gated routes contain the primitive", () => {
  const GATED_KINDS = new Set(["role-gated", "any-authenticated"]);

  const gatedPaths = REGISTRY_PATHS.filter((path) =>
    Object.values(ROUTE_REGISTRY[path].handlers).some((handler) =>
      GATED_KINDS.has(handler.posture.kind),
    ),
  );

  it("found gated routes to check", () => {
    expect(gatedPaths.length).toBeGreaterThan(0);
  });

  it.each(gatedPaths)("%s calls defineRoute or the shared role gate", (path) => {
    const source = readSource(path);
    const usesPrimitive = /\bdefineRoute\b/.test(source);
    const usesRoleGate = /\brequireRole\b/.test(source);
    const exception = ROUTE_REGISTRY[path].offPrimitive;

    if (exception === undefined) {
      expect(
        usesPrimitive || usesRoleGate,
        `${path} authenticates its caller but contains neither defineRoute nor requireRole. Either use the primitive, or record an offPrimitive reason in the registry.`,
      ).toBe(true);
      return;
    }

    // The exception is recorded — assert it is still true, so a converted route
    // cannot keep a stale excuse.
    expect(
      usesPrimitive || usesRoleGate,
      `${path} carries an offPrimitive exception but now uses the shared gate. Delete the exception.`,
    ).toBe(false);
  });

  it.each(
    REGISTRY_PATHS.filter((path) => ROUTE_REGISTRY[path].offPrimitive !== undefined),
  )("%s gives a reason for standing off the primitive", (path) => {
    expect(ROUTE_REGISTRY[path].offPrimitive?.trim().length).toBeGreaterThan(0);
  });

  // The wrapper reads the request body only when a body schema is declared, so
  // a raw-body posture must never be wrapped: a consumed stream cannot be
  // re-read, and the signature is over the bytes.
  it.each(
    REGISTERED_HANDLERS.filter((h) => h.handler.body.kind === "raw").map(
      (h) => [h.label, h.path] as const,
    ),
  )("%s verifies a raw body and stays off the wrapper", (_label, path) => {
    expect(/\bdefineRoute\b/.test(readSource(path))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Check 3 — admin-client pinning
// ---------------------------------------------------------------------------

/**
 * The service-role client bypasses every row-level policy, so its import sites
 * are the shortest list of places where a handler bug becomes a database-wide
 * capability. Pinning the set to a justified registry is the same move that
 * pinned anonymous write grants at zero: growth is possible, but only
 * deliberately.
 */
describe("check 3 — admin-client pinning", () => {
  const ADMIN_CLIENT = /\bcreateAdminClient\b/;

  const importers = walk(join(process.cwd(), "src"), (name) =>
    /\.tsx?$/.test(name),
  )
    .map(repoPath)
    .filter((path) => ADMIN_CLIENT.test(readSource(path)))
    .sort();

  const routeImporters = importers.filter((path) =>
    path.startsWith("src/app/api/"),
  );
  const nonRouteImporters = importers.filter(
    (path) => !path.startsWith("src/app/api/"),
  );

  const justifiedRoutes = REGISTRY_PATHS.filter(
    (path) => ROUTE_REGISTRY[path].adminClient !== undefined,
  );

  it("found service-role client import sites", () => {
    expect(importers.length).toBeGreaterThan(0);
  });

  it("has a justification for every route that uses the service-role client", () => {
    const unjustified = routeImporters.filter(
      (path) => !justifiedRoutes.includes(path),
    );
    expect(unjustified).toEqual([]);
  });

  it("has no justification left behind by a route that dropped the client", () => {
    const obsolete = justifiedRoutes.filter(
      (path) => !routeImporters.includes(path),
    );
    expect(obsolete).toEqual([]);
  });

  it.each(justifiedRoutes)("%s justifies its use in a full clause", (path) => {
    expect(ROUTE_REGISTRY[path].adminClient?.trim().length).toBeGreaterThan(0);
  });

  it("pins the non-route import sites too", () => {
    expect(nonRouteImporters).toEqual(
      Object.keys(NON_ROUTE_ADMIN_CLIENT_SITES).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Check 4 — test linkage
// ---------------------------------------------------------------------------

/**
 * The spine guarantees a test EXISTS to review, not that it is a good one —
 * test quality stays a review concern. What it removes is the silent case: a
 * route shipping with nothing exercising it and nobody noticing.
 */
describe("check 4 — test linkage", () => {
  const linked = REGISTERED_HANDLERS.flatMap((h) =>
    h.handler.test === null ? [] : [{ ...h, test: h.handler.test }],
  );
  const untested = REGISTERED_HANDLERS.filter((h) => h.handler.test === null);

  it("found linked handlers", () => {
    expect(linked.length).toBeGreaterThan(0);
  });

  it.each(
    linked.map((h) => [h.label, h.test, h.path] as const),
  )("%s names a test file that exists and exercises it", (_label, test, path) => {
    const testPath = join(process.cwd(), test);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path comes from the registry literal in this file, not from input
    expect(existsSync(testPath), `${test} does not exist`).toBe(true);

    // Matches both the static import and the dynamic `await import(...)` form.
    const specifier = `@/${path.replace(/^src\//, "").replace(/\.ts$/, "")}`;
    expect(
      readSource(test).includes(specifier),
      `${test} does not reference ${specifier}`,
    ).toBe(true);
  });

  // Untested handlers were recorded rather than excused, and the list is now
  // empty. Keeping the assertion as an equality against `[]` rather than
  // deleting it is deliberate: it is a ratchet. A new handler that ships with
  // `test: null` fails here immediately, so the zero cannot quietly become a
  // one the way the original nine accumulated.
  it("has no handler left without a test", () => {
    expect(untested.map((h) => h.label).sort()).toEqual([]);
  });
});
