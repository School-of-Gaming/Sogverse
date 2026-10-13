/**
 * §1 — The role-named steps.
 *
 * **What is being asked.** Whether the scale's heading steps are renamed by role
 * — `hero`, `page-title`, `section`, `card-title`, `sub-section`, `label` — and,
 * for the two new steps and the card title, at what size. The four renames are
 * drawn twice from one recipe (`steps.ts`); the new steps are drawn as
 * candidates; and under each step, today's real headings that would take it
 * are drawn class-for-class beside the same words at the proposed step.
 *
 * **Why `page-title` is new.** The 48px H1 appears only on heroes. Every app
 * page title is 24–30px today, set by hand at `font-bold` — `text-2xl` and
 * `text-3xl` are the two biggest clusters in the survey, 23 sites each — so the
 * app's most common heading has no step at all. Its candidates are drawn in the
 * admin dashboard's header and a parent page's header, the two shapes it comes
 * in: a title and a sentence, and a title under a back link.
 *
 * **Why `card-title` gets a 20px candidate.** CardTitle is 24px by default and
 * 28 of its 58 call sites override the size, most of them to `text-xl` (20px);
 * the admin dashboard's panels all do. Twenty is where the card title already
 * lives in practice.
 *
 * **Why `label` is new.** About nineteen headings are 11–14px furniture over a
 * list or a panel. They have no step, so they are all hand-set; §7 asks whether
 * each is a heading at all, and this section draws the step they would take if
 * they are.
 *
 * **What `section` is drawn against.** Its rename is the marketing section
 * heading — the public pages' `text-3xl sm:text-4xl`. The app's h2s are a
 * different size altogether (18–20px; no app h2 reaches 36), and one of them is
 * drawn here at the section step so the gap shows; whether the app needs a
 * second section step is §8's question.
 *
 * Every exemplar's classes are copied from the file named under it; the words
 * are the English messages, with `Aino` standing in for a child's name.
 */

import { ArrowLeft } from "lucide-react";

import { Case, CardGround, Column, Columns, Exemplar, Question } from "./parts";
import { CARD_TITLE_20, LABEL, PAGE_TITLE, STEP } from "./steps";

function HomeHeroWords() {
  return (
    <>
      Where
      <br />
      Screen Time
      <br />
      Becomes
      <br />
      <span className="text-act">Quality Time</span>
    </>
  );
}

/** The admin dashboard's header, with its first panel under it for scale. */
function AdminHeader({ titleClass }: { titleClass: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className={titleClass}>Dashboard</h1>
        <p className="text-muted-foreground">
          What needs an admin today, who is on the platform, and what is running.
        </p>
      </div>
      <CardGround>
        <h3 className="text-xl font-semibold tracking-tight">Needs attention</h3>
      </CardGround>
    </div>
  );
}

/** A parent page's header: the back link, the title, the sentence, the first card. */
function ParentHeader({ titleClass }: { titleClass: string }) {
  return (
    <div className="space-y-6">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to My SOG
      </span>
      <div>
        <h1 className={titleClass}>Gamer settings</h1>
        <p className="text-muted-foreground">Manage settings for Aino</p>
      </div>
      <CardGround>
        <h3 className="text-2xl leading-none font-semibold tracking-tight">
          Profile
        </h3>
      </CardGround>
    </div>
  );
}

/** The verify-email page's centred title block. */
function VerifyHeader({ titleClass }: { titleClass: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className={titleClass}>Email verified</h1>
      <p className="text-muted-foreground">
        Thanks — we know this address reaches you now, so nothing important will
        get lost.
      </p>
    </div>
  );
}

const PAGE_TITLE_COLUMNS = [
  { name: "28px", cls: PAGE_TITLE[28] },
  { name: "30px", cls: PAGE_TITLE[30] },
  { name: "32px", cls: PAGE_TITLE[32] },
] as const;

export function StepsSection() {
  return (
    <Question n={1} title="The role-named steps">
      <Case title="hero">
        <Columns of={2}>
          <Column name="today — h1">
            <p className={STEP.hero}>Where Screen Time Becomes Quality Time</p>
          </Column>
          <Column name="hero">
            <p className={STEP.hero}>Where Screen Time Becomes Quality Time</p>
          </Column>
        </Columns>
        <Exemplar file="src/app/[locale]/(public)/page.tsx" page="Home, hero">
          <Columns of={2}>
            <Column name="today">
              <h1 className="text-h1-mobile font-bold tracking-tight md:text-6xl">
                <HomeHeroWords />
              </h1>
            </Column>
            <Column name="hero">
              <h1 className={STEP.hero}>
                <HomeHeroWords />
              </h1>
            </Column>
          </Columns>
        </Exemplar>
      </Case>

      <Case title="page-title">
        <Exemplar
          file="src/app/[locale]/(dashboard)/admin/page.tsx"
          page="Admin dashboard"
        >
          <Columns of={4}>
            <Column name="today">
              <AdminHeader titleClass="text-3xl font-bold" />
            </Column>
            {PAGE_TITLE_COLUMNS.map(({ name, cls }) => (
              <Column key={name} name={name}>
                <AdminHeader titleClass={cls} />
              </Column>
            ))}
          </Columns>
        </Exemplar>
        <Exemplar
          file="src/app/[locale]/(dashboard)/parent/gamers/[id]/page.tsx"
          page="Parent, gamer settings"
        >
          <Columns of={4}>
            <Column name="today">
              <ParentHeader titleClass="text-3xl font-bold" />
            </Column>
            {PAGE_TITLE_COLUMNS.map(({ name, cls }) => (
              <Column key={name} name={name}>
                <ParentHeader titleClass={cls} />
              </Column>
            ))}
          </Columns>
        </Exemplar>
        <Exemplar
          file="src/app/[locale]/(auth)/verify-email/page.tsx"
          page="Verify email"
        >
          <Columns of={4}>
            <Column name="today">
              <VerifyHeader titleClass="text-2xl font-bold" />
            </Column>
            {PAGE_TITLE_COLUMNS.map(({ name, cls }) => (
              <Column key={name} name={name}>
                <VerifyHeader titleClass={cls} />
              </Column>
            ))}
          </Columns>
        </Exemplar>
      </Case>

      <Case title="section">
        <Columns of={2}>
          <Column name="today — h2">
            <p className={STEP.section}>Make gaming a great hobby</p>
          </Column>
          <Column name="section">
            <p className={STEP.section}>Make gaming a great hobby</p>
          </Column>
        </Columns>
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, features"
        >
          <Columns of={2}>
            <Column name="today">
              <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Make gaming a great hobby
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Gaming is a hobby just like any other — better with good
                  friends and with a professional Game Educator who is there to
                  guide and help.
                </p>
              </div>
            </Column>
            <Column name="section">
              <div className="text-center">
                <h2 className={STEP.section}>Make gaming a great hobby</h2>
                <p className="mt-4 text-muted-foreground">
                  Gaming is a hobby just like any other — better with good
                  friends and with a professional Game Educator who is there to
                  guide and help.
                </p>
              </div>
            </Column>
          </Columns>
        </Exemplar>
        <Exemplar
          file="src/components/legal/policy-page.tsx"
          page="Privacy policy, summary box"
        >
          <Columns of={2}>
            <Column name="today">
              <div className="space-y-3 rounded-lg border border-border bg-card p-6">
                <h2 className="text-lg font-semibold">The short version</h2>
                <p>School of Gaming exists to give children a safe, fun place to learn through gaming.</p>
              </div>
            </Column>
            <Column name="section">
              <div className="space-y-3 rounded-lg border border-border bg-card p-6">
                <h2 className={STEP.section}>The short version</h2>
                <p>School of Gaming exists to give children a safe, fun place to learn through gaming.</p>
              </div>
            </Column>
          </Columns>
        </Exemplar>
      </Case>

      <Case title="card-title">
        <Columns of={3}>
          <Column name="today — h3">
            <CardGround>
              <p className={STEP.cardTitle}>Our mission</p>
            </CardGround>
          </Column>
          <Column name="card-title">
            <CardGround>
              <p className={STEP.cardTitle}>Our mission</p>
            </CardGround>
          </Column>
          <Column name="card-title — 20px">
            <CardGround>
              <p className={CARD_TITLE_20}>Our mission</p>
            </CardGround>
          </Column>
        </Columns>
        {/* CardTitle's own classes, unoverridden. */}
        <Exemplar
          file="src/components/ui/card.tsx"
          page="Parent, gamer settings"
        >
          <Columns of={3}>
            <Column name="today">
              <CardGround>
                <h3 className="text-2xl leading-none font-semibold tracking-tight">
                  Profile
                </h3>
              </CardGround>
            </Column>
            <Column name="card-title">
              <CardGround>
                <h3 className={STEP.cardTitle}>Profile</h3>
              </CardGround>
            </Column>
            <Column name="card-title — 20px">
              <CardGround>
                <h3 className={CARD_TITLE_20}>Profile</h3>
              </CardGround>
            </Column>
          </Columns>
        </Exemplar>
        {/*
          CardTitle with the panel's `text-xl` override, as the class merger
          resolves it today: the override's font size drops the primitive's
          `leading-none`, so the title renders at `text-xl`'s own line height.
        */}
        <Exemplar
          file="src/components/admin/dashboard/schedule-panel.tsx"
          page="Admin dashboard"
        >
          <Columns of={3}>
            <Column name="today">
              <CardGround>
                <h3 className="font-semibold tracking-tight text-xl">Schedule</h3>
              </CardGround>
            </Column>
            <Column name="card-title">
              <CardGround>
                <h3 className={STEP.cardTitle}>Schedule</h3>
              </CardGround>
            </Column>
            <Column name="card-title — 20px">
              <CardGround>
                <h3 className={CARD_TITLE_20}>Schedule</h3>
              </CardGround>
            </Column>
          </Columns>
        </Exemplar>
      </Case>

      <Case title="sub-section">
        <Columns of={2}>
          <Column name="today — h4">
            <p className={STEP.subSection}>Create your account</p>
          </Column>
          <Column name="sub-section">
            <p className={STEP.subSection}>Create your account</p>
          </Column>
        </Columns>
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, how it works"
        >
          <Columns of={2}>
            <Column name="today">
              <h3 className="mt-4 text-lg font-semibold">Create your account</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign up as a parent and create gamer accounts for your children.
              </p>
            </Column>
            <Column name="sub-section">
              <h3 className={`mt-4 ${STEP.subSection}`}>Create your account</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign up as a parent and create gamer accounts for your children.
              </p>
            </Column>
          </Columns>
        </Exemplar>
        <Exemplar
          file="src/app/[locale]/(dashboard)/parent/gamers/[id]/page.tsx"
          page="Parent, gamer not found"
        >
          <Columns of={2}>
            <Column name="today">
              <CardGround>
                <h3 className="text-lg font-medium">Gamer not found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  This gamer account may have been removed or you don’t have
                  access to it.
                </p>
              </CardGround>
            </Column>
            <Column name="sub-section">
              <CardGround>
                <h3 className={STEP.subSection}>Gamer not found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  This gamer account may have been removed or you don’t have
                  access to it.
                </p>
              </CardGround>
            </Column>
          </Columns>
        </Exemplar>
      </Case>

      <Case title="label">
        <Exemplar
          file="src/components/admin/dashboard/schedule-panel.tsx"
          page="Admin dashboard"
        >
          <Columns of={3}>
            <Column name="today">
              <CardGround>
                <h3 className="text-sm font-semibold">Coming up</h3>
              </CardGround>
            </Column>
            <Column name="label — 14px">
              <CardGround>
                <h3 className={LABEL[14]}>Coming up</h3>
              </CardGround>
            </Column>
            <Column name="label — 12px">
              <CardGround>
                <h3 className={LABEL[12]}>Coming up</h3>
              </CardGround>
            </Column>
          </Columns>
        </Exemplar>
        <Exemplar
          file="src/components/consent/consent-banner-view.tsx"
          page="Every page, first visit"
        >
          <Columns of={3}>
            <Column name="today">
              <div className="space-y-1 border border-border bg-card px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Your privacy choices
                </h2>
                <p className="text-sm text-muted-foreground">
                  We use cookies to run the site.
                </p>
              </div>
            </Column>
            <Column name="label — 14px">
              <div className="space-y-1 border border-border bg-card px-4 py-3">
                <h2 className={LABEL[14]}>Your privacy choices</h2>
                <p className="text-sm text-muted-foreground">
                  We use cookies to run the site.
                </p>
              </div>
            </Column>
            <Column name="label — 12px">
              <div className="space-y-1 border border-border bg-card px-4 py-3">
                <h2 className={LABEL[12]}>Your privacy choices</h2>
                <p className="text-sm text-muted-foreground">
                  We use cookies to run the site.
                </p>
              </div>
            </Column>
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}
