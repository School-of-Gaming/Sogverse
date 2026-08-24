/* eslint-disable i18next/no-literal-string -- TEMP: logo-glow exploration — strip before merge. Every string in this scene is developer-facing metadata on an admin-only page (which treatment a row is showing, and why it exists), the same class of copy as the scene titles in the preview registry. Nothing here ships in any locale. */
"use client";

import { useMemo } from "react";
import { Header, type HeaderLogoTreatment } from "@/components/layout/header";
import { AuthContext } from "@/providers/auth-provider";
import type { AuthenticatedUser, Profile } from "@/types";

/**
 * **TEMP: logo-glow exploration — strip before merge.**
 *
 * The header used to say "you are here" by glowing the word SOG yellow whenever
 * the visitor was already on the page the logo links to. That worked because the
 * logo was 20px of type; the definitive mark is a yellow badge, and a yellow
 * glow around a yellow badge is a strong candidate for reading as *blur* rather
 * than as emphasis. The nav links have no such problem — Shop and Help turn
 * primary against muted siblings — so the open question is only about the logo,
 * and "nothing at all" is a real answer to it.
 *
 * This scene exists to settle that by looking at it: one real `Header` per
 * candidate treatment, stacked at full viewport width so each is the size it
 * will actually be met at, all in the state where the treatment is *on* (a
 * visitor already on the logo's target page). Rows are compared by scrolling one
 * page, not by remembering the last tab.
 *
 * Two scenarios rather than one, because the two viewers cannot share a render:
 * a signed-out visitor on the home page and a signed-in parent on My SOG. They
 * are worth both looking at because the logo means different things to them —
 * for the visitor it is "the home page", for the parent it is "my dashboard" —
 * and the parent's header is the busier one, with a settings cog and an
 * identicon competing for the same eye.
 *
 * The whole file is temporary. So is the `preview` prop on `Header`, the
 * treatment table beside it, and the `AuthContext` export this leans on.
 */

/** TEMP: logo-glow exploration — strip before merge. */
export const LOGO_GLOW_SCENARIOS = ["signed-out", "parent"] as const;
export type LogoGlowScenario = (typeof LOGO_GLOW_SCENARIOS)[number];

/** TEMP: logo-glow exploration — strip before merge. */
export function isLogoGlowScenario(value: string): value is LogoGlowScenario {
  return (LOGO_GLOW_SCENARIOS as readonly string[]).includes(value);
}

/**
 * A real generated UUID, hardcoded — the header's identicon derives its pattern
 * from the id's hex bytes, so a readable stand-in would render a degenerate
 * avatar and make this a false picture of the parent's header.
 */
const PARENT_ID = "64338754-8f3f-4132-957e-22aa93e04634";

const TREATMENTS: readonly {
  treatment: HeaderLogoTreatment;
  title: string;
  note: string;
}[] = [
  {
    treatment: "none",
    title: "a. Nothing",
    note: "The logo says nothing about where you are. The candidate to beat: the mark is the one thing on the page that is already unmissable, and a parent who clicked it to get here does not need telling.",
  },
  {
    treatment: "tight-glow",
    title: "b. Tight glow",
    note: "The old text treatment aimed at the mark — a 12px primary bloom hugging the badge. This is the one most likely to read as the badge being out of focus.",
  },
  {
    treatment: "soft-halo",
    title: "c. Soft halo",
    note: "Same light, spread to 26px at half opacity, so it separates from the badge's own edge instead of smearing it.",
  },
  {
    treatment: "radial-backdrop",
    title: "d. Radial backdrop",
    note: "The glow moved behind the mark as its own layer: the badge's silhouette stays perfectly sharp and the light sits on the header strip around it.",
  },
  {
    treatment: "underline",
    title: "e. Underline (non-glow)",
    note: "The nav's rhyme. Shop and Help say \"here\" by turning primary; a mark that is already primary says it with a rule under it, the way a selected tab does.",
  },
  {
    treatment: "chip",
    title: "f. Current chip (non-glow)",
    note: "The other rhyme: a faint primary plate and hairline ring behind the mark. The padding is unconditional, so the mark itself does not move when the chip lights.",
  },
];

interface ViewerFixture {
  /** What the header's `usePathname()` is told the visitor is looking at. */
  pathname: string;
  user: AuthenticatedUser | null;
  profile: Profile | null;
  blurb: string;
}

const VIEWERS: Record<LogoGlowScenario, ViewerFixture> = {
  "signed-out": {
    pathname: "/",
    user: null,
    profile: null,
    blurb:
      "A signed-out visitor on the home page. The logo links home, so it is on its own target and every treatment below is lit. No cog, no identicon — the mark has the left end of the strip to itself.",
  },
  parent: {
    pathname: "/parent",
    user: { id: PARENT_ID, email: "aino.virtanen@example.com" },
    profile: {
      id: PARENT_ID,
      email: "aino.virtanen@example.com",
      first_name: "Aino",
      last_name: "Virtanen",
      role: "customer",
      created_at: "2025-09-01T09:00:00.000Z",
      updated_at: "2025-09-01T09:00:00.000Z",
      currency: "eur",
      email_verified_at: "2025-09-01T09:05:00.000Z",
      home_location_id: null,
      locale: "en",
      phone: null,
      referral_code: null,
      spoken_languages: ["en"],
    },
    blurb:
      "A signed-in parent on My SOG. The logo links to /parent, so it is on its own target here too — but now the strip also carries a settings cog and the parent's own identicon, which is the busier case a treatment has to survive.",
  },
};

/**
 * TEMP: logo-glow exploration — strip before merge.
 *
 * The real `AuthProvider` reads the live session, and the only person who can
 * open a preview route is an admin — so a fixture value is the only way to see
 * the header as a visitor or as a parent. Nothing else in the app provides this
 * context by hand.
 */
function FixtureAuth({
  user,
  profile,
  children,
}: {
  user: AuthenticatedUser | null;
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      user,
      profile,
      isLoading: false,
      refreshProfile: async () => {},
      freezeUntilNavigation: () => {},
      unfreezeAuthState: () => {},
    }),
    [user, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function LogoGlowScene({ scenario }: { scenario: LogoGlowScenario }) {
  const viewer = VIEWERS[scenario];

  return (
    <div className="space-y-8 py-8">
      <div className="container mx-auto space-y-3 px-4">
        <h1 className="text-2xl font-bold">
          Logo &ldquo;you are here&rdquo; treatments
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">{viewer.blurb}</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          The strip at the very top of this page is the real header as{" "}
          <em>you</em> (an admin, off the logo&rsquo;s target) meet it — that is
          the unlit state, and the comparison. Every row below is the same
          component with the treatment on.
        </p>
      </div>

      {TREATMENTS.map(({ treatment, title, note }) => (
        <section key={treatment} className="space-y-3">
          <div className="container mx-auto space-y-1 px-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="max-w-prose text-sm text-muted-foreground">{note}</p>
          </div>
          {/*
            Full-bleed, so each row is the width the header is really met at.
            `isolate` keeps the nested header's own `z-50` from competing with
            the page's real header, and `overflow-hidden` turns this box into
            the sticky element's scrollport — the box is exactly one header
            tall, so the header inside it cannot travel anywhere. No border of
            its own: the header already draws one along its bottom edge, and a
            second one beside it would just read as a rendering fault.
          */}
          <div className="isolate overflow-hidden">
            <FixtureAuth user={viewer.user} profile={viewer.profile}>
              <Header preview={{ pathname: viewer.pathname, logoTreatment: treatment }} />
            </FixtureAuth>
          </div>
        </section>
      ))}
    </div>
  );
}
