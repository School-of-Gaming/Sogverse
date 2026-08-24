/* eslint-disable i18next/no-literal-string -- TEMP: header-nav exploration — strip before merge. Every string this file contributes is developer-facing metadata on an admin-only page (which arrangement a row is showing, which locale and width a frame is), the same class of copy as the scene titles in the preview registry. The header *inside* each frame renders real translated copy from the real message catalogs; nothing authored here ships in any locale. */
"use client";

import { Fragment, useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  Header,
  type HeaderBrandRender,
  type HeaderNavOption,
} from "@/components/layout/header";
import { AuthContext } from "@/providers/auth-provider";
import {
  DEFAULT_TIMEZONE,
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { cn } from "@/lib/utils";
import type { Messages } from "@/i18n/messages";
import type { AuthenticatedUser, Profile } from "@/types";
import en from "../../../../messages/en.json";
import fi from "../../../../messages/fi.json";
import fr from "../../../../messages/fr.json";
import sv from "../../../../messages/sv.json";
import tlh from "../../../../messages/tlh.json";
import type { HeaderNavScenario } from "./header-nav-scenarios";

/**
 * **TEMP: header-nav exploration — strip before merge.**
 *
 * The logo is the single most-used path to My SOG — 732 of 1427 `dashboard_nav`
 * events over the last 30 days, about 51% — and it is about to stop being the
 * only one: the mark will link home for everybody, and a signed-in visitor gets
 * a *worded* item in the nav instead. The replacement has to be at least as
 * findable as the thing it replaces, and it has to fit on a phone.
 *
 * Fitting is the whole difficulty, and it is why this scene exists rather than a
 * paragraph of arithmetic. At the 360px design floor the strip has 336px inside
 * its gutter, and the mark (66px) plus the cog/locale/avatar cluster (134px)
 * take 200 of them before a single word is set. What is left has to carry Shop,
 * Help *and* the new item, in five locales whose words are not the same length —
 * French sets "Boutique" where English sets "Shop". So each option is rendered
 * at 360 and 390px in every locale, with today's header beside it as the
 * control. (360 is the floor per the root CLAUDE.md rule: the Android baseline
 * width; 320px hardware is written off and only has to degrade gracefully.)
 *
 * A second, independent question rides along: **how the brand is drawn**. The
 * full mark sets "SCHOOL OF GAMING" at about 13% of the badge's height, so at
 * the 44px a 64px strip allows it comes out around 6px — too small to read. Two
 * ways out, and they pull in opposite directions: set the name as real text
 * beside the simple badge (crisp at any size, +137px of width), or grow the
 * whole strip until the mark's own line is legible (+66px of width, and a
 * taller header on every page). Neither is free, so each nav option is shown in
 * all three.
 *
 * Three scenarios, because the three questions want different widths and cannot
 * share a render:
 *
 * - **full-width** is where the *design* is judged — each arrangement at real
 *   desktop width, in all three brand treatments, and signed out underneath,
 *   which is how you check that nothing else moves when the item is absent.
 * - **phone-widths** is where the *phone fit* is judged — 360 and 390px in every
 *   locale, clipped at the frame edge exactly as a phone clips it. The brand
 *   dimension is absent there on purpose: below `sm` all three treatments render
 *   the simple mark alone in a 64px strip, so there is nothing to compare.
 * - **sm-breakpoint** is where the *brand's* cost is judged — 640 and 768px, the
 *   band where the desktop layout has just switched on and has the least room,
 *   in the widest locale.
 *
 * Every option carries the same touch-target change to the nav links, because
 * that part ships whichever option wins: a 44px hit height and `px-2` of
 * horizontal target, arranged so the desktop geometry is unchanged.
 *
 * The whole file is temporary. So is the `navOption`/`brandRender`/`viewport`
 * half of the `preview` prop on `Header`, `LocalePicker`'s `narrow` prop, and
 * the `AuthContext` export this leans on.
 */

/**
 * A real generated UUID, hardcoded — the header's identicon derives its pattern
 * from the id's hex bytes, so a readable stand-in would render a degenerate
 * avatar and make this a false picture of the parent's header.
 */
const PARENT_ID = "64338754-8f3f-4132-957e-22aa93e04634";

const PARENT_USER: AuthenticatedUser = {
  id: PARENT_ID,
  email: "aino.virtanen@example.com",
};

const PARENT_PROFILE: Profile = {
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
};

/** Where a signed-in parent is standing when the item is lit. */
const PARENT_PATH = "/parent";

/** The locale the widest words belong to, and so the one the tight bands use. */
const WIDEST_LOCALE: SupportedLocale = "fr";

const OPTIONS: readonly {
  option: HeaderNavOption;
  title: string;
  note: string;
}[] = [
  {
    option: "none",
    title: "Control — today",
    note: "The header as it ships: the mark is the only way to My SOG. Here as the control, so the cost of every option below is visible rather than asserted. At the 360px floor it fits in all five locales with about 20px of French spare; only written-off 320px hardware ever saw it overflow.",
  },
  {
    option: "trailing-pill",
    title: "A. Filled pill, last",
    note: "Shop · Help · [My SOG]. A filled primary pill in last position — the loudest thing on the strip, and the one an eye scanning for an action lands on first. It cannot say \"you are here\" the way the text links do (it is already primary), so it says it with an inset hairline instead. Also the widest option, by the pill's own padding.",
  },
  {
    option: "leading-link",
    title: "B. Leading text link",
    note: "My SOG · Shop · Help. First position, nearest the mark where the eye starts, styled exactly like its siblings — muted until you are on it, then primary. The narrowest of the three, and the only one that adds nothing but a word.",
  },
  {
    option: "cluster-pill",
    title: "C. Pill in the right cluster",
    note: "The nav keeps Shop · Help; My SOG becomes an outlined pill beside the cog and the avatar — \"your stuff\" grouped with \"you\". Reads as account chrome rather than as a fourth destination, and costs the most total width, since it pays a pill's padding *and* another cluster gap.",
  },
];

/**
 * The three ways the brand can read from `sm` up.
 *
 * `strip` is a Tailwind arbitrary-property class rather than an inline style:
 * everything that lines up with the header reads `--header-height`, so setting
 * the variable on the row is all a taller strip takes — the shell's own height,
 * the nav's `h-full` centring and the row's box all follow from it. Written as
 * literal class strings so Tailwind's scanner can see them.
 */
const BRANDS: readonly {
  brand: HeaderBrandRender;
  title: string;
  strip: string;
  note: string;
}[] = [
  {
    brand: "full-mark",
    title: "1. Full mark — 44px mark in a 64px strip",
    strip: "",
    note: "What ships. The mark's own \"SCHOOL OF GAMING\" line is about 13% of the badge's height, so here it renders at roughly 6px. It is the reason the other two exist.",
  },
  {
    brand: "mark-plus-text",
    title: "2. Simple mark + wordmark text — 64px strip",
    strip: "",
    note: "The icon-plus-wordmark pattern: the simple badge at the same 44px, with \"School of Gaming\" set as real 16px semibold text beside it. Crisp at any size and themeable, and it keeps the strip the height it is — at a cost of about 137px of desktop width, which is where the sm band gets interesting.",
  },
  {
    brand: "tall-full-mark",
    title: "3. Full mark at 80px — 96px strip",
    strip: "[--header-height:6rem]",
    note: "The other way out: leave the artwork alone and grow the strip until the line inside it is legible — about 10px at an 80px mark. Costs 66px of width (the mark goes 80 → 146px) and 32px of vertical room on every page. If this wins, the real change is a responsive override of --header-height from sm up, never a new hardcoded height.",
  },
];

/** The two phone widths worth arguing about: the design floor, and the common one. */
const PHONE_WIDTHS = [360, 390] as const;
type PhoneWidth = (typeof PHONE_WIDTHS)[number];

/** The band where the desktop layout has just switched on and has least room. */
const SM_WIDTHS = [640, 768] as const;
type SmWidth = (typeof SM_WIDTHS)[number];

/**
 * Fixed-width grid columns — one per option on the phone pages, one per brand in
 * the sm band. Literal class strings so Tailwind's scanner can see them.
 */
const PHONE_GRID: Record<PhoneWidth, string> = {
  360: "grid-cols-[repeat(4,360px)]",
  390: "grid-cols-[repeat(4,390px)]",
};

const SM_GRID: Record<SmWidth, string> = {
  640: "grid-cols-[repeat(3,640px)]",
  768: "grid-cols-[repeat(3,768px)]",
};

const PHONE_NOTE: Record<PhoneWidth, string> = {
  360: "The design floor — the Android baseline width that nearly every Samsung family phone reports. Anything narrower is a written-off 2013-era iPhone or an accessibility display-zoom, which must degrade gracefully but is not designed for.",
  390: "An iPhone 14/15, and roughly the middle of the modern Android range.",
};

const SM_NOTE: Record<SmWidth, string> = {
  640: "Exactly where sm switches on: the desktop layout at the narrowest width it is ever asked to hold.",
  768: "A small tablet in portrait, and the width the desktop layout starts to breathe at.",
};

/**
 * The five catalogs, imported rather than loaded, because a scene cannot await.
 *
 * Klingon omits the legal surface and falls back to English at runtime; that
 * merge is a module-private function in `src/i18n/messages.ts`, so it is
 * mirrored here rather than imported. The compiler checks the result against
 * `Messages`, so a new hole in `tlh` fails this file's build too.
 */
const FRAME_MESSAGES: Record<SupportedLocale, Messages> = {
  en,
  fi,
  sv,
  fr,
  tlh: {
    ...en,
    ...tlh,
    footer: { ...en.footer, ...tlh.footer },
    metadata: {
      ...en.metadata,
      ...tlh.metadata,
      pages: { ...en.metadata.pages, ...tlh.metadata.pages },
    },
    roblox: {
      ...en.roblox,
      ...tlh.roblox,
      legal: { ...en.roblox.legal, ...tlh.roblox.legal },
    },
  },
};

/**
 * TEMP: header-nav exploration — strip before merge.
 *
 * The real `AuthProvider` reads the live session, and the only person who can
 * open a preview route is an admin — so a fixture value is the only way to see
 * the header as a signed-out visitor or as a parent. Nothing else in the app
 * provides this context by hand.
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

/**
 * One header in a box.
 *
 * `isolate` keeps the nested header's own `z-50` from competing with the page's
 * real header, and `overflow-hidden` is doing the load-bearing work in the
 * fixed-width frames: the box is exactly one header tall and exactly the
 * device's width, so anything the strip cannot fit is *clipped at the frame
 * edge* — which is what the device shows at rest, before anybody thinks to
 * swipe sideways.
 */
function HeaderFrame({
  locale,
  option,
  brand,
  narrow = false,
  user,
  profile,
  pathname,
  className,
}: {
  locale?: SupportedLocale;
  option: HeaderNavOption;
  brand: HeaderBrandRender;
  narrow?: boolean;
  user: AuthenticatedUser | null;
  profile: Profile | null;
  pathname: string;
  className?: string;
}) {
  const strip = BRANDS.find((b) => b.brand === brand)?.strip ?? "";
  const header = (
    <FixtureAuth user={user} profile={profile}>
      <Header
        preview={{
          pathname,
          navOption: option,
          brandRender: brand,
          ...(narrow ? { viewport: "narrow" as const } : {}),
        }}
      />
    </FixtureAuth>
  );

  return (
    <div className={cn("isolate overflow-hidden", strip, className)}>
      {locale === undefined ? (
        header
      ) : (
        <NextIntlClientProvider
          locale={locale}
          messages={FRAME_MESSAGES[locale]}
          timeZone={DEFAULT_TIMEZONE}
        >
          {header}
        </NextIntlClientProvider>
      )}
    </div>
  );
}

/** A caption sitting in the page gutter above a full-bleed header row. */
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function FullWidthScenario() {
  return (
    <div className="space-y-12 py-8">
      <div className="container mx-auto space-y-3 px-4">
        <h1 className="text-2xl font-bold">
          Header nav — the labelled way to My SOG
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Four arrangements of the nav down the page, each rendered in all three
          brand treatments, at the width you are reading this. The three brand
          rows sit together so the mark can be compared without changing
          anything else; the signed-out row that closes each block is where you
          check that nothing <em>else</em> moves when the My SOG item goes away.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          Whether any of it fits on a phone is a different question with its own
          page (<strong>360 and 390 px, every locale</strong>), and so is what the
          wordmark costs where the desktop layout is tightest (
          <strong>640 and 768 px</strong>).
        </p>
      </div>

      <section className="space-y-3">
        <div className="container mx-auto space-y-2 px-4">
          <h2 className="text-lg font-semibold">The three brand treatments</h2>
          {BRANDS.map(({ brand, title, note }) => (
            <p key={brand} className="max-w-prose text-sm text-muted-foreground">
              <strong className="text-foreground">{title}</strong> — {note}
            </p>
          ))}
        </div>
      </section>

      {OPTIONS.map(({ option, title, note }) => (
        <section key={option} className="space-y-3">
          <div className="container mx-auto space-y-1 px-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="max-w-prose text-sm text-muted-foreground">{note}</p>
          </div>
          {BRANDS.map(({ brand, title: brandTitle }) => (
            <Fragment key={brand}>
              <RowLabel>Signed-in parent, on My SOG — {brandTitle}</RowLabel>
              <HeaderFrame
                option={option}
                brand={brand}
                user={PARENT_USER}
                profile={PARENT_PROFILE}
                pathname={PARENT_PATH}
              />
            </Fragment>
          ))}
          <RowLabel>
            Signed out, on the home page — full mark, 64px strip
          </RowLabel>
          <HeaderFrame
            option={option}
            brand="full-mark"
            user={null}
            profile={null}
            pathname="/"
          />
        </section>
      ))}
    </div>
  );
}

function PhoneWidthsScenario() {
  return (
    <div className="space-y-12 py-8">
      <div className="container mx-auto space-y-3 px-4">
        <h1 className="text-2xl font-bold">
          Header nav on a phone — every locale, both widths
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Each box is a real header at a real phone width, clipped at its own
          edge the way a phone clips it. Columns are the four arrangements, rows
          are the five locales. The first column is today&rsquo;s header, so the
          cost of each option is a sideways comparison rather than a memory.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          No brand dimension here: below <code>sm</code> all three treatments
          render the same simple mark in the same 64px strip — the wordmark and
          the taller strip are both desktop-only — so a phone frame would show
          three identical headers.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          One thing the frames cannot show: the locale picker reads{" "}
          <em>your</em> locale, not the frame&rsquo;s, so every flag says the
          same thing. Its width does not depend on the locale at these sizes —
          the two-letter code is hidden below <code>sm</code> — so the
          measurement is unaffected; the nav words are where the locale shows.
        </p>
      </div>

      {PHONE_WIDTHS.map((width) => (
        <section key={width} className="space-y-4 px-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{width} px</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {PHONE_NOTE[width]}
            </p>
          </div>
          <div
            className={cn(
              "grid gap-x-4 gap-y-6 overflow-x-auto pb-4",
              PHONE_GRID[width],
            )}
          >
            {OPTIONS.map(({ option, title }) => (
              <p key={option} className="text-sm font-semibold">
                {title}
              </p>
            ))}
            {SUPPORTED_LOCALES.map((locale) => (
              <Fragment key={locale}>
                <p className="col-span-4 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {LOCALE_CONFIG[locale].nativeLabel} ({locale})
                </p>
                {OPTIONS.map(({ option }) => (
                  <HeaderFrame
                    key={option}
                    locale={locale}
                    option={option}
                    brand="full-mark"
                    narrow
                    user={PARENT_USER}
                    profile={PARENT_PROFILE}
                    pathname={PARENT_PATH}
                    className="rounded-md border border-border"
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SmBreakpointScenario() {
  return (
    <div className="space-y-12 py-8">
      <div className="container mx-auto space-y-3 px-4">
        <h1 className="text-2xl font-bold">
          The sm band — what the brand costs where the desktop layout is
          tightest
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          From 640px up the header switches to its desktop form: the wide mark,
          the two-letter locale code beside the flag, roomier gaps. That is also
          the width at which it has the least room, so it is where a wordmark or
          a bigger mark either fits or does not. Columns are the three brand
          treatments, rows the four nav arrangements.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          All of it in French, because French sets the longest words this nav
          has to carry — &ldquo;Boutique&rdquo; and &ldquo;Mon SOG&rdquo;. English
          has about 34px more slack at the same width, so a row that fits here
          fits everywhere.
        </p>
      </div>

      {SM_WIDTHS.map((width) => (
        <section key={width} className="space-y-4 px-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{width} px</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {SM_NOTE[width]}
            </p>
          </div>
          <div
            className={cn(
              "grid gap-x-4 gap-y-6 overflow-x-auto pb-4",
              SM_GRID[width],
            )}
          >
            {BRANDS.map(({ brand, title }) => (
              <p key={brand} className="text-sm font-semibold">
                {title}
              </p>
            ))}
            {OPTIONS.map(({ option, title }) => (
              <Fragment key={option}>
                <p className="col-span-3 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {title}
                </p>
                {BRANDS.map(({ brand }) => (
                  <HeaderFrame
                    key={brand}
                    locale={WIDEST_LOCALE}
                    option={option}
                    brand={brand}
                    user={PARENT_USER}
                    profile={PARENT_PROFILE}
                    pathname={PARENT_PATH}
                    className="self-start rounded-md border border-border"
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function HeaderNavScene({ scenario }: { scenario: HeaderNavScenario }) {
  if (scenario === "full-width") return <FullWidthScenario />;
  if (scenario === "phone-widths") return <PhoneWidthsScenario />;
  return <SmBreakpointScenario />;
}
