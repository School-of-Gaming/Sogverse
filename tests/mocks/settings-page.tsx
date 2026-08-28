import { vi } from "vitest";
import type { Profile } from "@/types";

/**
 * The scaffolding a settings-page test needs before it can render the page body
 * at all: the auth provider, the four data hooks the profile form reads, and
 * stubs for the neighbouring sections that own their own reads and their own
 * tests.
 *
 * **The bodies live here; the `vi.mock` calls cannot.** Vitest hoists a
 * `vi.mock` above every import in its file, so the call itself has to stay
 * beside the test — what moves is the module object each factory returns, which
 * is the part that was identical in two files and would have drifted apart in
 * three.
 *
 * A consumer therefore writes one line per module, and the import of this file
 * **must come before any import that pulls a mocked module in**: a factory runs
 * during the importing test file's import phase, and it reads these functions
 * out of an already-evaluated module or not at all.
 */

/**
 * `@/providers` over one mutable profile. The profile is read through a getter
 * rather than passed by value, because a test file swaps it per case before
 * rendering and a captured value would freeze the first one.
 *
 * `useTimezone` is here for the surfaces that format a date; a test whose tree
 * never calls it is not harmed by its presence.
 */
export function providersModule(currentProfile: () => Profile) {
  return {
    useAuth: () => ({
      user: { id: currentProfile().id },
      profile: currentProfile(),
      refreshProfile: vi.fn(),
    }),
    useTimezone: () => "Europe/Helsinki",
  };
}

/** `@/services/users` — the profile form's write and the verification send. */
export function usersServiceModule() {
  return {
    useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
    useSendVerificationEmail: () => ({ mutate: vi.fn() }),
  };
}

/** `@/services/locations` — the parent's home-location lookup, unresolved. */
export function locationsServiceModule() {
  return {
    useLocationsByIds: () => ({ data: undefined }),
  };
}

/** `@/services/minecraft` — the game-account card's read and write. */
export function minecraftServiceModule() {
  return {
    useMyMinecraftAccount: () => ({ data: null }),
    useUpdateMyMinecraft: () => ({ mutateAsync: vi.fn() }),
  };
}

/** `@/services/roblox` — the other game account's read and write. */
export function robloxServiceModule() {
  return {
    useMyRobloxAccount: () => ({ data: null }),
    useUpdateMyRoblox: () => ({ mutateAsync: vi.fn() }),
  };
}

/**
 * `@/services/marketing-consents` — the parent-only marketing card's read and
 * write, answered with an empty (but *resolved*) list.
 *
 * `[]` rather than `undefined`: a resolved read with no rows is the ordinary
 * state of a parent who has never been asked, and it is what leaves the card's
 * boxes enabled. A test that cares about the unresolved state overrides this
 * module itself rather than reaching for a second factory here.
 */
export function marketingConsentsServiceModule() {
  return {
    useMyMarketingConsents: () => ({ data: [] }),
    useMarketingConsentsForCustomer: () => ({ data: [] }),
    useSetMarketingConsent: () => ({ mutate: vi.fn() }),
  };
}

/** `@/components/game-account` — a neighbouring section, reduced to a marker. */
export function gameAccountModule() {
  return {
    GameAccountCard: () => <div data-testid="game-account-card" />,
  };
}

/** `@/components/gedu/gedu-coverage-editor` — likewise. */
export function geduCoverageEditorModule() {
  return {
    GeduCoverageEditor: () => <div data-testid="gedu-coverage-editor" />,
  };
}

/** `@/components/locations/home-location-field` — likewise. */
export function homeLocationFieldModule() {
  return {
    HomeLocationField: () => <div data-testid="home-location-field" />,
  };
}
