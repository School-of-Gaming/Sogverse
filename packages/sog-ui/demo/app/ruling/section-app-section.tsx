/**
 * §8 — App section against marketing section.
 *
 * **What is being asked.** Whether the scale carries two section steps — the
 * marketing `section` (36px, the public pages' `text-3xl sm:text-4xl`) and an
 * app one, proposed here as `app-section` — or one.
 *
 * **Why it is a question.** No app h2 reaches 36px. The app's section headings
 * sit at 18–20px: `h2 text-lg font-semibold` twelve times and
 * `h2 text-xl font-semibold` ten. Meanwhile `section` at 36px outranks every
 * `page-title` candidate (28–32px), so a dashboard page drawn with one section
 * step has sections that shout over the page's own title — the inversion §2's
 * parent drawing already shows. A second step keeps the outline (h1 page-title,
 * h2 section) while letting the eye read it in the same order.
 *
 * **The name.** `app-section` says where it is spent rather than how big it is,
 * which is the role-naming §1 asks for; the marketing step keeps `section`
 * because it is the one the public pages already wear. If the owner rules one
 * step, `app-section` is withdrawn and the app's sections take `section`.
 *
 * **The candidates.** 20px/600 (where ten of the app's h2s already are, and
 * the same recipe as the 20px `card-title` candidate) and 22px/600 (a clear
 * step above a 20px card title, and still under every page-title candidate).
 *
 * **What is drawn.** Two real app pages that are a title and two sections — the
 * admin substitutions page and the gedu one — each under every page-title
 * candidate, with its sections at `section`, `app-section` 20 and 22; today's
 * render sits above them. Then the home page's features section, the marketing
 * shape, at today's classes, at `section`, and at the larger app-section
 * candidate for contrast.
 *
 * A row card is drawn under each section for scale: the admin page's
 * substituted-session card (the card primitive with `p-4`, the session's name
 * at `text-sm font-medium`). The headings are copied class-for-class from the
 * files named; the words are the English messages, with a fictional club name.
 */

import { ArrowLeft } from "lucide-react";

import { Case, Column, Columns, Exemplar, Question } from "./parts";
import { APP_SECTION, PAGE_TITLE, STEP } from "./steps";

const PAGE_TITLES = [
  { name: "28px", cls: PAGE_TITLE[28] },
  { name: "30px", cls: PAGE_TITLE[30] },
  { name: "32px", cls: PAGE_TITLE[32] },
] as const;

const SECTION_STEPS = [
  { name: "section", cls: STEP.section },
  { name: "app-section — 20px", cls: APP_SECTION[20] },
  { name: "app-section — 22px", cls: APP_SECTION[22] },
] as const;

/** One session row, as the admin substitutions page draws it under a section. */
function SessionCard() {
  return (
    <div className="space-y-1 rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-sm leading-snug font-medium">Minecraft-maanantaikerho</p>
      <p className="text-xs text-muted-foreground">Away: Mikael · Sick</p>
    </div>
  );
}

/** The admin substitutions page: title, sentence, two sections. */
function AdminSubstitutions({
  titleClass,
  sectionClass,
}: {
  titleClass: string;
  sectionClass: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className={titleClass}>Substitutions</h1>
        <p className="text-muted-foreground">
          Sessions somebody cannot make, and who stood in.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className={`flex items-baseline gap-2 ${sectionClass}`}>
          Sessions needing a substitute
          <span className="text-sm font-normal text-muted-foreground">1</span>
        </h2>
        <SessionCard />
      </section>
      <section className="space-y-3">
        <h2 className={sectionClass}>Sessions with a substitute</h2>
        <p className="text-sm text-muted-foreground">
          No upcoming session has a substitute.
        </p>
      </section>
    </div>
  );
}

/** The gedu substitutions page: back link, title, two sections. */
function GeduSubstitutions({
  titleClass,
  sectionClass,
}: {
  titleClass: string;
  sectionClass: string;
}) {
  return (
    <div className="space-y-10">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to My SOG
      </span>
      <h1 className={titleClass}>Substitutions</h1>
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className={sectionClass}>Sessions needing a substitute</h2>
          <p className="text-sm text-muted-foreground">
            You see sessions in a language you speak and, for on-site ones, in
            your coverage areas.
          </p>
        </div>
        <SessionCard />
      </section>
      <section className="space-y-4">
        <h2 className={sectionClass}>You’re substituting</h2>
        <p className="text-sm text-muted-foreground">
          You have no substitutions coming up.
        </p>
      </section>
    </div>
  );
}

/** The home page's features heading and its sentence. */
function HomeFeatures({ headingClass }: { headingClass: string }) {
  return (
    <div className="text-center">
      <h2 className={headingClass}>Make gaming a great hobby</h2>
      <p className="mt-4 text-muted-foreground">
        Gaming is a hobby just like any other — better with good friends and
        with a professional Game Educator who is there to guide and help.
      </p>
    </div>
  );
}

export function AppSectionSection() {
  return (
    <Question n={8} title="App section and marketing section">
      <Case title="An admin page">
        <Exemplar
          file="src/components/admin/substitutions/admin-substitutions-page-body.tsx"
          page="Admin, substitutions"
        >
          <Columns of={3}>
            <Column name="today">
              <AdminSubstitutions
                titleClass="text-3xl font-bold"
                sectionClass="text-xl font-semibold"
              />
            </Column>
          </Columns>
        </Exemplar>
        {PAGE_TITLES.map((title) => (
          <Columns key={title.name} of={3}>
            {SECTION_STEPS.map((step) => (
              <Column key={step.name} name={`page-title ${title.name} · ${step.name}`}>
                <AdminSubstitutions
                  titleClass={title.cls}
                  sectionClass={step.cls}
                />
              </Column>
            ))}
          </Columns>
        ))}
      </Case>

      <Case title="A gedu page">
        <Exemplar
          file="src/components/gedu/gedu-substitutions-page-body.tsx"
          page="Gedu, substitutions"
        >
          <Columns of={3}>
            <Column name="today">
              <GeduSubstitutions
                titleClass="text-3xl font-bold tracking-tight"
                sectionClass="text-xl font-semibold"
              />
            </Column>
          </Columns>
        </Exemplar>
        {PAGE_TITLES.map((title) => (
          <Columns key={title.name} of={3}>
            {SECTION_STEPS.map((step) => (
              <Column key={step.name} name={`page-title ${title.name} · ${step.name}`}>
                <GeduSubstitutions
                  titleClass={title.cls}
                  sectionClass={step.cls}
                />
              </Column>
            ))}
          </Columns>
        ))}
      </Case>

      <Case title="A marketing section">
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, features"
        >
          <Columns of={3}>
            <Column name="today">
              <HomeFeatures headingClass="text-3xl font-bold tracking-tight sm:text-4xl" />
            </Column>
            <Column name="section">
              <HomeFeatures headingClass={STEP.section} />
            </Column>
            <Column name="app-section — 22px">
              <HomeFeatures headingClass={APP_SECTION[22]} />
            </Column>
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}
