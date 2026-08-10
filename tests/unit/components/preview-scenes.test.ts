import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  PREVIEW_SCENES,
  findPreviewScene,
  previewSceneHref,
  sceneHasScenario,
} from "@/components/preview/scenes";
import {
  GEDU_DASHBOARD_SCENARIOS,
  buildGeduDashboardFixture,
} from "@/components/gedu/mock-dashboard-fixtures";
import {
  GEDU_PRODUCT_SCENARIOS,
  buildGeduProductPageFixture,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import {
  FAMILY_PRODUCT_SCENARIOS,
  buildFamilyProductPageFixture,
} from "@/components/family/product-page/mock-fixtures";
import { SESSION_FEED_ROSTER } from "@/components/gedu/session-feed/mock-fixtures";
import {
  attendanceTally,
  countEntriesNeedingAttention,
  entryCompleteness,
  entryNeedsAttention,
} from "@/components/gedu/session-feed";
import { activityTypeOf, type ActivityType } from "@/lib/activity-type";
import { runEndedOn, runLiveness } from "@/lib/product-run";
import {
  CONFIRMATION_NOTICE_SCENARIOS,
  PREVIEW_SCENARIOS,
  buildScenarioFixture,
  scenarioFilledSeats,
} from "@/components/public/products/mock-detail-fixtures";
import { OPEN_ENDED_OCCURRENCE_CAP } from "@/lib/session-occurrence";

/**
 * The preview registry is the only thing standing between a link on the style
 * guide and a 404: the route validates a URL against it, and each scene's
 * renderer narrows the slug against its own fixtures. Those two lists are
 * declared separately, so this pins them together — a scenario renamed in a
 * fixture and not in the registry would otherwise only show up as a dead link
 * someone happens to click.
 */

function slugsFor(surface: string): string[] {
  const scene = findPreviewScene(surface);
  if (!scene) throw new Error(`no preview scene registered for "${surface}"`);
  return scene.scenarios.map((s) => s.slug);
}

describe("preview scene registry", () => {
  it("has a unique, non-empty surface for every scene", () => {
    const surfaces = PREVIEW_SCENES.map((s) => s.surface);
    expect(new Set(surfaces).size).toBe(surfaces.length);
    for (const surface of surfaces) expect(surface).not.toBe("");
  });

  it("gives every scene at least one scenario, with unique slugs", () => {
    for (const scene of PREVIEW_SCENES) {
      expect(scene.scenarios.length).toBeGreaterThan(0);
      const slugs = scene.scenarios.map((s) => s.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const scenario of scene.scenarios) {
        expect(scenario.label.trim()).not.toBe("");
      }
    }
  });

  it("resolves a known surface and rejects an unknown one", () => {
    expect(findPreviewScene("products")?.surface).toBe("products");
    expect(findPreviewScene("nope")).toBeNull();
  });

  it("matches scenarios against the scene that declares them", () => {
    const scene = findPreviewScene("gedu-product");
    expect(scene).not.toBeNull();
    expect(sceneHasScenario(scene!, "camp")).toBe(true);
    expect(sceneHasScenario(scene!, "club")).toBe(true);
    expect(sceneHasScenario(scene!, "default")).toBe(false);
  });

  it("builds the route the dynamic page serves", () => {
    expect(previewSceneHref("gedu-product", "camp")).toBe(
      "/preview/gedu-product/camp",
    );
  });

  /**
   * The scenario lists were deliberately collapsed to the states that cannot
   * coexist: everything else belongs in the kitchen sink. A scene creeping back
   * up to a scenario per state is the drift this pins down, and a scene whose
   * scenarios each need a sentence of explanation has to actually carry one.
   *
   * The dashboard is allowed one more than the product page, and only one: the
   * *composition* of its sections changes with which type nouns a gedu runs, and
   * a single-noun page is a shape the all-three page structurally cannot show.
   */
  it("keeps the gedu scenes down to their mutually-exclusive scenarios", () => {
    // A ceiling, not an equality: this test is here to stop a scene creeping
    // back up to a scenario per state, and pinning the exact count would also
    // fail on the day somebody correctly *folds* two scenarios into one.
    const MAX_SCENARIOS: Record<string, number> = {
      "gedu-product": 2,
      "gedu-dashboard": 3,
    };
    for (const surface of ["gedu-product", "gedu-dashboard"] as const) {
      const scene = findPreviewScene(surface);
      expect(scene).not.toBeNull();
      expect(scene!.scenarios.length, surface).toBeLessThanOrEqual(
        MAX_SCENARIOS[surface],
      );
      for (const scenario of scene!.scenarios) {
        expect(scenario.description?.trim(), `${surface}/${scenario.slug}`)
          .toBeTruthy();
      }
    }
  });
});

describe("registry scenarios match their fixtures", () => {
  it("gedu dashboard", () => {
    expect(slugsFor("gedu-dashboard")).toEqual([...GEDU_DASHBOARD_SCENARIOS]);
  });

  it("gedu product page", () => {
    expect(slugsFor("gedu-product")).toEqual([...GEDU_PRODUCT_SCENARIOS]);
  });

  it("family product page, both audiences", () => {
    // The parent's scene enumerates every scenario; the gamer's deliberately
    // carries one, because its variant is about attendance and voice rather
    // than about the shapes a product can be in.
    expect(slugsFor("parent-club")).toEqual([...FAMILY_PRODUCT_SCENARIOS]);
    for (const slug of slugsFor("gamer-club")) {
      expect(FAMILY_PRODUCT_SCENARIOS).toContain(slug);
    }
  });

  it("public product surfaces", () => {
    const productSlugs = PREVIEW_SCENARIOS.map((s) => s.slug);
    expect(slugsFor("products")).toEqual(productSlugs);
    // The confirmation surface carries the product scenarios plus the paid
    // no-order notice states, which no product fixture backs.
    expect(slugsFor("confirmation")).toEqual([
      ...productSlugs,
      ...CONFIRMATION_NOTICE_SCENARIOS.map((n) => n.slug),
    ]);
  });
});

/**
 * The signup panel draws its seat bar in every state a product can be signed up
 * on — pre-open included — so that the bar's box is settled before the CTA can
 * ever go live. These scenarios are the only place that surface is looked at,
 * and a fixture whose state disagreed with its own row would draw a bar for a
 * capacity the page beside it does not have.
 */
describe("product scenarios tell one capacity story", () => {
  it("gives every signup-able state the cap its own product row carries", () => {
    for (const { slug } of PREVIEW_SCENARIOS) {
      const { product, state } = buildScenarioFixture(slug);
      if (
        state.kind !== "closed_pre" &&
        state.kind !== "pending_thr" &&
        state.kind !== "open"
      ) {
        continue;
      }
      expect(state.seatCount, slug).toBe(product.seat_count);
      expect(state.seatsLeft, slug).toBe(
        product.seat_count === null
          ? null
          : product.seat_count - scenarioFilledSeats(slug),
      );
    }
  });

  it("keeps a capped countdown with every seat free, and one with seats already gone", () => {
    // Both pre-open bars have to be reviewable. The full track is the ordinary
    // drop; the short one is what an admin's comp enrolments do to it, and is
    // the reason the bar shows real numbers pre-open instead of a placeholder.
    const preOpen = PREVIEW_SCENARIOS.map(({ slug }) => ({
      slug,
      ...buildScenarioFixture(slug),
    })).filter((s) => s.state.kind === "closed_pre");

    expect(preOpen.length).toBeGreaterThan(0);
    const capped = preOpen.filter((s) => s.product.seat_count !== null);
    expect(capped.length).toBeGreaterThan(0);
    expect(
      capped.some((s) => scenarioFilledSeats(s.slug) === 0),
    ).toBe(true);
    expect(
      capped.some((s) => scenarioFilledSeats(s.slug) > 0),
    ).toBe(true);
  });

  it("caps the threshold-pending scenario, the only place that bar is visible", () => {
    const threshold = PREVIEW_SCENARIOS.map(({ slug }) =>
      buildScenarioFixture(slug),
    ).filter((f) => f.state.kind === "pending_thr");
    expect(threshold.length).toBeGreaterThan(0);
    expect(threshold.some((f) => f.product.seat_count !== null)).toBe(true);
  });
});

/**
 * An identicon is a pattern hashed out of the id's hex bytes, so a readable
 * fixture id like `"mock-gamer-aino"` parses to nothing and renders an empty
 * square. Every fixture id that reaches an avatar therefore has to be a real
 * UUID — and a hardcoded one, since generating them would give the same person a
 * different face on every render.
 */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("identicon fixture ids are real UUIDs", () => {
  it("every child on the feed roster", () => {
    expect(SESSION_FEED_ROSTER.length).toBeGreaterThan(0);
    for (const gamer of SESSION_FEED_ROSTER) {
      expect(gamer.id).toMatch(UUID_V4);
    }
  });

  it("every gedu chip and roster row in every product-page scenario", () => {
    const now = new Date("2026-02-11T09:00:00Z");
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      const { data } = buildGeduProductPageFixture(now, scenario);
      for (const group of data.groups) {
        for (const gedu of group.gedus) {
          expect(gedu.id, `${scenario}/${group.name}`).toMatch(UUID_V4);
        }
        for (const child of group.roster ?? []) {
          expect(child.gamer_id, `${scenario}/${group.name}`).toMatch(UUID_V4);
          if (child.minecraft_uuid !== null) {
            expect(child.minecraft_uuid).toMatch(UUID_V4);
          }
        }
      }
    }
  });

  it("keeps the same ids across two builds, so avatars never change under a reload", () => {
    const now = new Date("2026-02-11T09:00:00Z");
    const first = buildGeduProductPageFixture(now, "club");
    const second = buildGeduProductPageFixture(now, "club");
    expect(first.data.groups[0].gedus.map((g) => g.id)).toEqual(
      second.data.groups[0].gedus.map((g) => g.id),
    );
  });
});

/**
 * The product page's reference rail leads with the other groups on the product —
 * the "cover my room for ten minutes" surface. With only two scenarios left,
 * neither may be the one that skips it: an empty rail on half the scenes would
 * mean the peer-cover row is only ever reviewable on one page.
 */
describe("every scenario exercises the reference rail's other-groups card", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  function peerCountFor(scenario: (typeof GEDU_PRODUCT_SCENARIOS)[number]) {
    const { data } = buildGeduProductPageFixture(now, scenario);
    return data.groups.filter((g) => g.id !== data.my_group_id).length;
  }

  it("gives every scenario at least one peer group", () => {
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      expect(peerCountFor(scenario), scenario).toBeGreaterThan(0);
    }
  });

  it("covers a peer group with nobody teaching it yet", () => {
    const unstaffed = GEDU_PRODUCT_SCENARIOS.flatMap((scenario) => {
      const { data } = buildGeduProductPageFixture(now, scenario);
      return data.groups.filter(
        (g) => g.id !== data.my_group_id && g.gedus.length === 0,
      );
    });
    expect(unstaffed.length).toBeGreaterThan(0);
  });
});

/**
 * The roster row renders a parent email unconditionally — there is no
 * missing-email state left in the UI, because a gamer account is created by a
 * parent who signed up with one. A fixture that dropped an address would render
 * a row with a hole in it and nothing would fail.
 *
 * The long address is pinned for the same reason the roster row was redesigned:
 * an email has no useful upper bound, and a fixture of tidy short ones is how a
 * wrapping bug reaches a gedu's screen.
 */
describe("every roster row carries a parent email", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("gives every child in every scenario an address", () => {
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      const { data } = buildGeduProductPageFixture(now, scenario);
      for (const group of data.groups) {
        for (const child of group.roster ?? []) {
          expect(child.parent_email, `${scenario}/${child.first_name}`)
            .toBeTruthy();
        }
      }
    }
  });

  it("includes one address long enough to stress the row", () => {
    const { data } = buildGeduProductPageFixture(now, "club");
    const roster = data.groups.find((g) => g.id === data.my_group_id)?.roster;
    const longest = Math.max(
      ...(roster ?? []).map((r) => (r.parent_email ?? "").length),
    );
    expect(longest).toBeGreaterThan(40);
  });
});

/**
 * Remote-vs-in-person is the axis the two scenarios exist to split, and site
 * notes hang off exactly one side of it: an in-person product always has a
 * venue (the schema requires a location), a remote one never does. A fixture
 * that lost the site would silently take the whole site-notes panel off every
 * scene without failing anything else.
 */
describe("site notes follow in-person, and only in-person", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("gives the in-person camp a venue with both notes and an address", () => {
    const { data, site } = buildGeduProductPageFixture(now, "camp");
    expect(data.product.is_remote).toBe(false);
    expect(site).not.toBeNull();
    expect(site!.name.trim()).not.toBe("");
    expect(site!.address).not.toBeNull();
    expect(site!.publicNote).not.toBeNull();
    expect(site!.staffNote).not.toBeNull();
  });

  it("gives the remote club no venue at all", () => {
    const { data, site } = buildGeduProductPageFixture(now, "club");
    expect(data.product.is_remote).toBe(true);
    expect(site).toBeNull();
  });
});

/**
 * The consolidated `club` scenario is the kitchen sink: everything that can
 * coexist on one product page now has to be reachable from that one page,
 * because there is no longer a second scenario to hide a missing state in.
 */
describe("the club scenario stays the kitchen sink", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("carries 50+ past entries with a realistic mix of states", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const past = entries.filter((e) => e.kind !== "future");
    expect(past.length).toBeGreaterThan(50);

    const kinds = new Set(past.map((e) => e.kind));
    // Pre-epoch history alongside the ordinary weeks — otherwise the long-feed
    // navigation is only exercised against one state.
    expect(kinds).toContain("past");
    expect(kinds).toContain("no_record");
  });

  it("mixes finished weeks, bare gaps, a written-up week still owed, and a partial", () => {
    // The four shapes a past entry can take, all in one feed. The last two are
    // what the attendance model exists for: notes present with nothing marked,
    // and a roster started then abandoned — both render their body *and* their
    // alert, and only the fully-marked ones are clear.
    const { entries, feedRoster } = buildGeduProductPageFixture(now, "club");
    const pastEntries = entries.filter((e) => e.kind === "past");
    const markedCount = (entry: (typeof pastEntries)[number]) =>
      feedRoster.filter((g) => entry.attendance[g.id] !== undefined).length;

    expect(
      pastEntries.filter((e) => markedCount(e) === feedRoster.length).length,
    ).toBeGreaterThan(40);
    expect(
      pastEntries.some((e) => markedCount(e) === 0 && e.report === null),
    ).toBe(true);
    expect(
      pastEntries.some((e) => markedCount(e) === 0 && e.report !== null),
    ).toBe(true);
    expect(
      pastEntries.some(
        (e) => markedCount(e) > 0 && markedCount(e) < feedRoster.length,
      ),
    ).toBe(true);
  });

  it("puts notes on at least one future session, so its editor has a filled state", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const noted = entries.filter(
      (e) =>
        e.kind === "future" && (e.report !== null || e.staffNote !== null),
    );
    expect(noted.length).toBeGreaterThan(0);
  });

  it("spans more than a year, so the month dividers cross a New Year", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const oldest = entries[entries.length - 1].startsAt;
    const newest = entries[0].startsAt;
    const months =
      (newest.getUTCFullYear() - oldest.getUTCFullYear()) * 12 +
      (newest.getUTCMonth() - oldest.getUTCMonth());
    expect(months).toBeGreaterThan(12);
  });

  it("varies its recap copy rather than repeating one note 53 times", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const notes = entries
      .filter((e) => e.kind === "past")
      .map((e) => e.report)
      .filter((n) => n !== null);
    expect(new Set(notes).size).toBeGreaterThan(10);
  });
});

/**
 * The camp is the *nearly* up-to-date side of the pair, and the dashboard leans
 * on that number: its badge counts are derived from these very feeds. Exactly
 * one outstanding day is what makes the in-person dashboard card wear a badge at
 * all; a camp that quietly grew a backlog would stop being distinguishable from
 * the club beside it.
 */
describe("the camp scenario owes exactly its newest day", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("has one past session still owing its attendance, and only one", () => {
    const { entries, feedRoster } = buildGeduProductPageFixture(now, "camp");
    expect(countEntriesNeedingAttention(entries, feedRoster)).toBe(1);
  });

  it("owes its most recent day rather than one buried in the run", () => {
    const { entries, feedRoster } = buildGeduProductPageFixture(now, "camp");
    const past = entries.filter((e) => e.kind !== "future");
    expect(entryNeedsAttention(past[0], feedRoster)).toBe(true);
  });

  it("still runs several days, so the daily cadence is visible", () => {
    const { entries } = buildGeduProductPageFixture(now, "camp");
    expect(entries.filter((e) => e.kind === "past").length).toBeGreaterThan(3);
  });

  /**
   * **The camp is where the feed's volume lives**, and this is what makes it
   * true rather than aspirational.
   *
   * The now-divider's count is every future entry bar the next one, which
   * renders below the line — so seventeen future sessions is a divider reading
   * "16 more upcoming sessions", and an upward reveal proved against a screenful
   * instead of against four rows. It has to be an **end-dated** product: an
   * open-ended one is capped at eight occurrences by the same rule the family
   * dashboards use, so a club's divider structurally cannot say more than
   * seven, however the fixture is written.
   */
  it("carries a long future block, and is end-dated so it may", () => {
    const { data, entries } = buildGeduProductPageFixture(now, "camp");
    expect(data.product.end_date).not.toBeNull();

    const future = entries.filter((e) => e.kind === "future");
    expect(future.length).toBeGreaterThan(OPEN_ENDED_OCCURRENCE_CAP * 2);
    // What the divider reads: everything ahead of us except the next session.
    expect(future.length - 1).toBe(16);
  });

  it("leaves most of that future bare, so the reveal is not all prose", () => {
    // A camp gedu plans two or three days ahead, not seventeen — and the
    // collapsed block has to look right when most of what it holds is a date.
    const { entries } = buildGeduProductPageFixture(now, "camp");
    const future = entries.filter((e) => e.kind === "future");
    const noted = future.filter(
      (e) => e.report !== null || e.staffNote !== null,
    );
    expect(noted.length).toBeGreaterThan(0);
    expect(noted.length).toBeLessThan(future.length / 2);
  });

  it("runs every future session inside its own end date", () => {
    // An end-dated product emits occurrences up to its end and no further, so a
    // fixture whose spec list outran its end date would be describing sessions
    // the real expansion would never produce.
    const { data, entries } = buildGeduProductPageFixture(now, "camp");
    const endsAt = new Date(`${data.product.end_date}T23:59:59.999Z`);
    for (const entry of entries) {
      expect(entry.startsAt.getTime()).toBeLessThanOrEqual(endsAt.getTime());
    }
  });
});

/**
 * Reports are markdown now, and the feed clamps a long one behind a "Read more".
 * Both halves of that are invisible unless the fixtures actually carry the
 * shapes: a history of one-liners renders no clamp anywhere, and a history of
 * plain prose never proves a heading or a list survives the round trip through
 * the editor.
 */
describe("club reports are markdown, at realistic lengths", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  function clubReports(): string[] {
    const { entries } = buildGeduProductPageFixture(now, "club");
    return entries
      .map((e) => (e.kind === "past" || e.kind === "future" ? e.report : null))
      .filter((r): r is string => r !== null);
  }

  it("gives most reports a markdown title line", () => {
    const reports = clubReports();
    const titled = reports.filter((r) => r.startsWith("# "));
    expect(titled.length / reports.length).toBeGreaterThan(0.8);
  });

  it("uses sections and lists, not just paragraphs", () => {
    const reports = clubReports();
    expect(reports.some((r) => r.includes("\n## "))).toBe(true);
    expect(reports.some((r) => r.includes("\n- "))).toBe(true);
    expect(reports.some((r) => r.includes("**"))).toBe(true);
  });

  it("carries several long enough to need the clamp, and several not", () => {
    const lengths = clubReports().map((r) => r.length);
    expect(lengths.filter((n) => n >= 500).length).toBeGreaterThan(5);
    expect(lengths.filter((n) => n < 300).length).toBeGreaterThan(3);
    expect(Math.max(...lengths)).toBeLessThan(2000);
  });

  /**
   * The *dominant* shape a real report takes, and the one the clamp is
   * therefore judged against: a dated title line and then several paragraphs of
   * plain prose. Every other fixture here was written to exercise the renderer
   * — a section, a list, a bolded line — which is a fair test of the renderer
   * and a poor picture of what a gedu writes on a Monday evening. Losing this
   * one would leave the feed reviewed entirely against demonstration copy.
   */
  it("leads with a full dated write-up, and makes it the longest one", () => {
    // The newest past entry, so it is the first report on the page.
    const { entries } = buildGeduProductPageFixture(now, "club");
    const newest = entries.filter((e) => e.kind === "past")[0].report ?? "";

    expect(newest.length).toBeGreaterThan(1400);
    // A date, then a name for the session — `d.M.yyyy`, resolved from the
    // occurrence it landed on rather than hardcoded.
    expect(newest).toMatch(/^# \d{1,2}\.\d{1,2}\.\d{4} – \S/);
    // Plain prose: no sections, no bullets. That is what makes it long without
    // being a list of headings, which is the case the clamp has to survive.
    expect(newest).not.toMatch(/^\s*## /m);
    expect(newest).not.toMatch(/^\s*[-*] /m);
    expect(newest.split(/\n\s*\n/).length).toBeGreaterThanOrEqual(7);

    // And nothing in the year is longer. The recaps cycle over a 53-week run,
    // so this same write-up lands on a second date whose numerals differ by a
    // character or two — hence a tolerance rather than an exact maximum.
    const longest = Math.max(...clubReports().map((r) => r.length));
    expect(longest - newest.length).toBeLessThanOrEqual(2);
  });

  it("leaves no unresolved date placeholder in any report", () => {
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      const { entries } = buildGeduProductPageFixture(now, scenario);
      for (const entry of entries) {
        if (entry.kind !== "past" && entry.kind !== "future") continue;
        expect(entry.report ?? "", scenario).not.toContain("{date}");
      }
    }
  });

  /**
   * The editor's toolbar produces headings, bold, italics and lists and nothing
   * else. A fixture reaching past that subset would render as something the
   * gedu who opens it cannot reproduce — and a table would simply be dropped on
   * the way back through the serialiser.
   */
  it("stays inside the subset the editor can produce", () => {
    for (const report of clubReports()) {
      expect(report, report.slice(0, 40)).not.toMatch(/^\s*\|/m);
      expect(report, report.slice(0, 40)).not.toMatch(/```/);
      expect(report, report.slice(0, 40)).not.toMatch(/^\s*>/m);
      expect(report, report.slice(0, 40)).not.toMatch(/<[a-z]+[\s>]/i);
    }
  });
});

/**
 * A past session says one of two things or nothing at all, and the club
 * scenario is where all three are meant to be visible at once. The silence is
 * the fragile one: it is the *absence* of a badge, so nothing else in the app
 * fails if it stops being represented.
 */
describe("the club scenario shows every state a past session can wear", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("carries flagged, complete and silent entries", () => {
    const { entries, feedRoster } = buildGeduProductPageFixture(now, "club");
    const states = entries.map((e) => entryCompleteness(e, feedRoster));
    expect(states).toContain("needs_attention");
    expect(states).toContain("complete");
    // The pre-epoch entry somebody went back and half-wrote-up: unfinished and
    // owed nothing, so it is the one past card on the page that stays neutral.
    const silentPast = entries.filter(
      (e) => e.kind === "past" && entryCompleteness(e, feedRoster) === null,
    );
    expect(silentPast.length).toBeGreaterThan(0);
  });

  /**
   * Both routes to amber, side by side. They render identically and mean
   * different things, and only one of them is new — a fixture that quietly lost
   * the marked-but-unreported case would take the whole reversal off the page
   * without failing anything above.
   */
  it("flags a week for a missing register and a week for a missing report", () => {
    const { entries, feedRoster } = buildGeduProductPageFixture(now, "club");
    const flagged = entries.filter(
      (e) => entryCompleteness(e, feedRoster) === "needs_attention",
    );

    const missingRegister = flagged.filter(
      (e) => e.kind === "past" && !attendanceTally(feedRoster, e.attendance).complete,
    );
    const missingReport = flagged.filter(
      (e) =>
        e.kind === "past" &&
        attendanceTally(feedRoster, e.attendance).complete &&
        (e.report ?? "").trim() === "",
    );

    expect(missingRegister.length).toBeGreaterThan(0);
    expect(missingReport.length).toBeGreaterThan(0);
  });

  /**
   * The skip states went with the didn't-run editor: declaring a session off is
   * inseparable from the cancellation and billing flows nobody has designed, so
   * skip is a schema intention with no trace in the mock. A fixture quietly
   * reintroducing one would put an unrenderable kind back into the feed.
   */
  it("authors no skipped session anywhere, in either scenario", () => {
    const RENDERABLE = ["future", "past", "no_record"];
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      const { entries } = buildGeduProductPageFixture(now, scenario);
      for (const entry of entries) {
        expect(RENDERABLE, `${scenario}/${entry.id}`).toContain(entry.kind);
      }
    }
  });
});

/**
 * The dashboard's whole job is four states — open Join, locked Join, a badge,
 * no badge — and an open voice window is true for about two hours a week, so
 * the fixture manufactures one rather than leaving the most interesting state
 * unreviewable six days out of seven. That is worth pinning: it is derived from
 * `now` through the real schedule expansion, so a change to either the slot
 * arithmetic or the window boundaries would silently take it away again.
 *
 * `now` is late evening in the club's own zone, outside the camp's daytime
 * hours, so the camp cannot accidentally be open too.
 */
describe("the gedu dashboard scene puts every card state on one screen", () => {
  const now = new Date("2026-02-11T20:00:00Z");

  function summaries() {
    return buildGeduDashboardFixture(
      now,
      "default",
      "en",
      "Europe/Helsinki",
    ).assignments.map((card) => card.assignment);
  }

  it("has exactly one card mid-session, with its room open", () => {
    const open = summaries().filter(
      (a) => runLiveness(a, now).voiceIsOpen,
    );
    expect(open).toHaveLength(1);
    expect(open[0].nextSessionStart!.getTime()).toBeLessThanOrEqual(
      now.getTime(),
    );
  });

  it("puts five cards on the page, with and without a backlog", () => {
    const counts = summaries()
      .map((a) => a.attentionCount)
      .sort((a, b) => a - b);
    expect(counts).toHaveLength(5);
    // Both badge states have to be on screen: the empty slot is reserved
    // geometry, and it is only proved by a card that leaves it empty next to
    // one that fills it.
    expect(counts[0]).toBe(0);
    expect(counts[counts.length - 1]).toBeGreaterThan(0);
  });

  /**
   * The two Join states and the two "no Join at all" cases, on one screen. The
   * in-person card that is *running* is the important one: it proves the
   * reserved footer holds a card's height open with nothing in it.
   */
  it("pairs a live remote card with a live in-person one", () => {
    const live = summaries().filter(
      (a) =>
        a.nextSessionStart !== null &&
        a.nextSessionStart.getTime() <= now.getTime(),
    );
    expect(live).toHaveLength(2);
    expect(live.filter((a) => a.hasVoiceRoom)).toHaveLength(1);
    expect(live.filter((a) => !a.hasVoiceRoom)).toHaveLength(1);
  });

  it("has a remote card that is not live, so the locked Join is visible", () => {
    const locked = summaries().filter(
      (a) =>
        a.hasVoiceRoom &&
        !runLiveness(a, now).voiceIsOpen &&
        a.nextSessionStart !== null,
    );
    expect(locked.length).toBeGreaterThan(0);
  });

  it("spans all three type nouns, so every heading renders", () => {
    const nouns = new Set<ActivityType>(
      summaries().map((a) => activityTypeOf(a.productType)),
    );
    expect(nouns).toEqual(new Set(["club", "camp", "event"]));
  });

  /**
   * Only the two scene-backed cards link anywhere. The other two exist to show
   * card states and have no feed behind them, so an href would be a promise the
   * preview cannot keep — inert is the honest value, not a broken link.
   */
  it("points its scene-backed cards at the feed their badge was counted from", () => {
    const hrefs = summaries().map((a) => a.openHref);
    const linked = hrefs.filter((href) => href !== "#");
    expect(linked).toHaveLength(2);
    for (const href of linked) {
      expect(href).toMatch(/^\/preview\/gedu-product\/(club|camp)$/);
    }
  });

  /**
   * **Every card's footer holds something.** It used to be a reserved zone that
   * stood empty on any product with no room, which bought uniform heights with
   * two bands of nothing. Now it is the Join on a remote product and the venue
   * on an in-person one. That the two are mutually exclusive is the roll-up's
   * own rule and is pinned there; what is this fixture's job — and would put the
   * hole straight back without failing anything else — is that each of its
   * in-person cards actually names a building.
   */
  it("names a venue on every in-person card", () => {
    const onsite = summaries().filter((a) => !a.hasVoiceRoom);
    expect(onsite.length).toBeGreaterThan(0);
    for (const assignment of onsite) {
      expect(assignment.siteName, assignment.productName).toBeTruthy();
    }
  });

  it("names the camp's venue with the same string its product page does", () => {
    const camp = summaries().find((a) => a.productType === "camp");
    const { site } = buildGeduProductPageFixture(now, "camp");
    expect(camp?.siteName).toBe(site?.name);
  });

  /**
   * **The finished run is a card state, so the page has to hold one.** It is
   * the state the card’s old "no session" line used to libel as a scheduling
   * fault, and every part of the treatment that replaced it — the muted tones,
   * the missing next-session line, the "Ended …" date in the footer, the badge
   * that stays loud — is invisible on a page where nothing has ended.
   */
  it("carries exactly one card whose run is over", () => {
    const ended = summaries().filter((a) => runEndedOn(a, now) !== null);
    expect(ended).toHaveLength(1);
    // A date to name in the footer, and no next session to contradict it.
    expect(ended[0].endDate).not.toBeNull();
    expect(ended[0].nextSessionStart).toBeNull();
  });

  /**
   * Remote on purpose: this is the card that used to have an *empty* footer —
   * no room to join, no building to name — which is exactly where the end date
   * now goes. An ended in-person card would only have swapped one line for
   * another.
   */
  it("makes the ended card the remote one, so the end date fills a footer that was empty", () => {
    const ended = summaries().filter((a) => runEndedOn(a, now) !== null);
    expect(ended[0].hasVoiceRoom).toBe(true);
    expect(ended[0].siteName).toBeNull();
  });

  it("leaves the ended card a backlog, so the badge is visibly undimmed", () => {
    const ended = summaries().filter((a) => runEndedOn(a, now) !== null);
    expect(ended[0].attentionCount).toBeGreaterThan(0);
  });

  /**
   * The demotion has to be visible on the page, not only in the roll-up's own
   * unit tests — which is why the ended card is a *club*, sharing a heading with
   * two live ones instead of sitting alone under a noun of its own.
   */
  it("puts the ended card last inside its own type group", () => {
    const clubs = summaries().filter(
      (a) => activityTypeOf(a.productType) === "club",
    );
    expect(clubs.length).toBeGreaterThan(1);
    expect(runEndedOn(clubs[clubs.length - 1], now)).not.toBeNull();
    for (const club of clubs.slice(0, -1)) {
      expect(runEndedOn(club, now), club.productName).toBeNull();
    }
  });
});

/**
 * The clubs-only scenario stopped being only about the single-noun heading the
 * moment the cards started tiling: two cards say nothing about how a grid wraps,
 * and a gedu with a full timetable is exactly who meets the wrapping. Seven is
 * what fills a three-column row and starts a second — and an uneven second row
 * is the case worth looking at.
 */
describe("the clubs-only scenario fills the grid", () => {
  const now = new Date("2026-02-11T20:00:00Z");

  function clubsOnly() {
    return buildGeduDashboardFixture(
      now,
      "clubs-only",
      "en",
      "Europe/Helsinki",
    ).assignments.map((card) => card.assignment);
  }

  it("narrows to a single type noun", () => {
    const nouns = new Set(
      clubsOnly().map((a) => activityTypeOf(a.productType)),
    );
    expect(nouns).toEqual(new Set(["club"]));
  });

  it("carries seven clubs, so the tiles wrap at two and at three columns", () => {
    expect(clubsOnly()).toHaveLength(7);
  });

  it("spreads their next sessions across the week rather than stacking them", () => {
    // Bucketed by the day these sessions fall on **in the club's own zone**.
    // A UTC day boundary is nobody's day, and the evening `now` above sits on
    // the far side of one — so two clubs on different Helsinki evenings would
    // have looked like one day, and the spread this asserts would have been
    // measured against the wrong calendar.
    const days = new Set(
      clubsOnly()
        .map((a) => a.nextSessionStart)
        .filter((d): d is Date => d !== null)
        .map((d) => formatInTimeZone(d, "Europe/Helsinki", "yyyy-MM-dd")),
    );
    expect(days.size).toBeGreaterThanOrEqual(5);
  });

  it("puts a backlog on some cards and not others, and one of them live", () => {
    const cards = clubsOnly();
    expect(cards.filter((a) => a.attentionCount > 0).length).toBeGreaterThan(1);
    expect(cards.filter((a) => a.attentionCount === 0).length).toBeGreaterThan(1);
    expect(
      cards.filter((a) => runLiveness(a, now).voiceIsOpen),
    ).toHaveLength(1);
  });

  it("gives every one of them a distinct name", () => {
    const names = clubsOnly().map((a) => a.productName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.trim()).not.toBe("");
  });

  it("only withholds verification in the scenario that is about it", () => {
    for (const scenario of GEDU_DASHBOARD_SCENARIOS) {
      const { verified } = buildGeduDashboardFixture(
        now,
        scenario,
        "en",
        "Europe/Helsinki",
      );
      expect(verified, scenario).toBe(scenario !== "unverified");
    }
  });
});

/**
 * **The account awaiting verification is also the empty dashboard**, and that is
 * not a convenience: verification is the gate on group assignment, so an
 * unapproved gedu has nothing to be assigned to and could never see a card. The
 * page with no cards on it appears nowhere else in the registry, so pinning the
 * emptiness here is what stops a later fixture edit from quietly handing this
 * scenario a card and taking the only preview of the empty state away.
 */
describe("the unverified scenario is the empty dashboard", () => {
  const now = new Date("2026-02-11T20:00:00Z");

  it("rolls up no assignments at all, so the body renders its empty state", () => {
    const { assignments } = buildGeduDashboardFixture(
      now,
      "unverified",
      "en",
      "Europe/Helsinki",
    );
    expect(assignments).toEqual([]);
  });

  it("is the only scenario without cards — the others must stay populated", () => {
    for (const scenario of GEDU_DASHBOARD_SCENARIOS) {
      const { assignments } = buildGeduDashboardFixture(
        now,
        scenario,
        "en",
        "Europe/Helsinki",
      );
      expect(assignments.length === 0, scenario).toBe(scenario === "unverified");
    }
  });
});

/**
 * The club page's two billing states are the only things on it that are
 * parent-only *and* exceptional, so between them the scenarios have to show
 * each exactly once — and never both at once, which is a state Stripe cannot
 * produce (`past_due` and `canceling` are exclusive) and which the page would
 * therefore be inventing.
 */
describe("the family club page's billing states", () => {
  const now = new Date("2026-02-11T09:00:00Z");
  const fixtures = FAMILY_PRODUCT_SCENARIOS.map((scenario) => ({
    scenario,
    fixture: buildFamilyProductPageFixture(now, scenario),
  }));

  it("shows each of them somewhere, and never together", () => {
    expect(fixtures.filter((f) => f.fixture.paymentProblem)).toHaveLength(1);
    expect(
      fixtures.filter((f) => f.fixture.cancellation !== null),
    ).toHaveLength(1);
    for (const { scenario, fixture } of fixtures) {
      expect(
        fixture.paymentProblem && fixture.cancellation !== null,
        scenario,
      ).toBe(false);
    }
  });

  it("names a last session the feed actually contains", () => {
    // The notice says "her last session is …", so a date the timeline does not
    // have would be the page disagreeing with itself.
    const cancelled = fixtures.find((f) => f.fixture.cancellation !== null);
    expect(cancelled).toBeDefined();
    const { accessUntil, lastSessionStart } = cancelled!.fixture.cancellation!;
    expect(lastSessionStart).not.toBeNull();
    expect(lastSessionStart!.getTime()).toBeLessThanOrEqual(
      accessUntil.getTime(),
    );
    expect(
      cancelled!.fixture.entries.some(
        (entry) => entry.startsAt.getTime() === lastSessionStart!.getTime(),
      ),
    ).toBe(true);
  });
});
