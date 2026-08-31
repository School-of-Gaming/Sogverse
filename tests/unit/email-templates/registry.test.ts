import { describe, it, expect, beforeAll, vi } from "vitest";
import { templateRegistry } from "@/lib/email-templates/registry";
import { BRAND } from "@/lib/constants/colors";
import { styledName } from "@/lib/email-templates/utils";
import { bulletList } from "@/lib/email-templates/blocks";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

/**
 * The seat variant reaches the reader twice — once in the body and once in the
 * subject — and the two are chosen by different code: the builder picks the
 * body, the registry entry picks the subject. The builders' halves are covered
 * next door; this file covers the registry's, through `render()` rather than by
 * reaching for the ternary, because `render` is what the API route calls.
 *
 * The failure being pinned is the half-applied one: an inbox line reading
 * "Marja is enrolled in" above a mail that opens "you’re enrolled in". It
 * renders, it sends, and only the subject is wrong — so each case asserts the
 * subject and the body *together*, which is the only way a disagreement between
 * them shows up as a failure.
 */
describe("templateRegistry render()", () => {
  /**
   * The signup mail branches on three things at once — enrolled vs waitlisted,
   * whose seat it is, and which verb the product type calls for — and all three
   * reach the subject line. The pairing is what each case asserts: a subject
   * reading "Aino is signed up" over a body that opens "you are on the waitlist"
   * is two wrong answers in the one line the reader meets first, and each half
   * looks fine on its own.
   */
  describe("productConfirmation", () => {
    const signup = {
      participantName: "Aino",
      productName: "Minecraft 101",
      productType: "consumer_club",
      mode: "subscription",
      priceAmount: "€40.00",
      dashboardUrl: "https://sogverse.sog.gg/parent",
    };

    it("names the participant when the seat is a child's", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, isSelfSeat: false },
        t,
        "en",
      );

      expect(subject).toBe("Aino is enrolled in Minecraft 101");
      expect(html).toContain("Aino");
      expect(html).toContain("is enrolled in");
    });

    /**
     * The subject takes the same per-type verb the body does, because the two
     * are read together: an inbox line saying "Aino is enrolled in" over a mail
     * that opens "Aino is joining" is the kind of mismatch nobody notices until
     * a parent asks which one it is. Each case pins the subject and the body of
     * one type at once, which is the only way a drift between them fails.
     */
    it.each([
      ["consumer_club", "Aino is enrolled in Minecraft 101", "is enrolled in"],
      ["municipality_club", "Aino is registered for Minecraft 101", "is registered for"],
      ["camp", "Aino is signed up for Minecraft 101", "is signed up for"],
      ["event", "Aino is joining Minecraft 101", "is joining"],
    ])("uses the %s verb in the subject as well as the body", (productType, expected, bodyVerb) => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, productType, isSelfSeat: false },
        t,
        "en",
      );

      expect(subject).toBe(expected);
      expect(html).toContain(bodyVerb);
    });

    it.each([
      ["consumer_club", "You are enrolled in Minecraft 101", "You’re enrolled in"],
      ["municipality_club", "You are registered for Minecraft 101", "You’re registered for"],
      ["camp", "You are signed up for Minecraft 101", "You’re signed up for"],
      ["event", "You are joining Minecraft 101", "You’re joining"],
    ])("uses the %s verb on a self seat too", (productType, expected, bodyVerb) => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, productType, participantName: "Marja", isSelfSeat: true },
        t,
        "en",
      );

      expect(subject).toBe(expected);
      expect(subject).not.toContain("Marja");
      expect(html).toContain(bodyVerb);
    });

    it("moves to the second person when the seat is the parent's own", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, participantName: "Marja", isSelfSeat: true },
        t,
        "en",
      );

      expect(subject).toBe("You are enrolled in Minecraft 101");
      expect(subject).not.toContain("Marja");
      expect(html).toContain("You’re enrolled in");
      expect(html).not.toContain("Marja");
    });

    it("says waitlist in the subject when the outcome is a waitlist join", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, isSelfSeat: false, mode: "waitlist", priceAmount: null },
        t,
        "en",
      );

      expect(subject).toBe("Aino is on the waitlist for Minecraft 101");
      expect(html).toContain("is on the waitlist for");
      expect(html).not.toContain("signed up");
    });

    it("carries both axes at once on a self-seat waitlist join", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, participantName: "Marja", isSelfSeat: true, mode: "waitlist", priceAmount: null },
        t,
        "en",
      );

      expect(subject).toBe("You are on the waitlist for Minecraft 101");
      expect(subject).not.toContain("Marja");
      expect(html).toContain("You’re on the waitlist for");
      expect(html).not.toContain("Marja");
    });

    /**
     * The testing form hands every field over as a string. This is where the
     * seat select becomes the boolean the schema demands, and where the price
     * is cleared on the two modes that state no amount — so a test send of a
     * free signup carries what the live mail carries, not a price the builder
     * would have ignored anyway.
     */
    describe("its resolver", () => {
      const resolve = templateRegistry.productConfirmation.resolveParams;

      it("expands the seat select into a boolean", () => {
        if (!resolve) throw new Error("productConfirmation has no resolveParams");
        expect(resolve({ seat: "self", mode: "subscription" })).toMatchObject({ isSelfSeat: true });
        expect(resolve({ seat: "child", mode: "subscription" })).toMatchObject({ isSelfSeat: false });
        expect(resolve({ mode: "subscription" })).toMatchObject({ isSelfSeat: false });
      });

      it("keeps the price on the paid modes and clears it on the rest", () => {
        if (!resolve) throw new Error("productConfirmation has no resolveParams");
        for (const mode of ["subscription", "upfront"]) {
          expect(resolve({ mode, priceAmount: "€40.00" })).toMatchObject({ priceAmount: "€40.00" });
        }
        for (const mode of ["free", "waitlist"]) {
          expect(resolve({ mode, priceAmount: "€40.00" })).toMatchObject({ priceAmount: null });
        }
      });
    });
  });
});

/**
 * The session-report entry is fixture-backed: the form posts a sample id and
 * an optional markdown override, and the registry turns them into the dated,
 * timed params the builder takes. What is pinned is the seam — the sample's
 * date reaches the subject formatted for the locale, the sample's markdown
 * reaches the body, and a typed override displaces the markdown and nothing
 * else.
 */
describe("templateRegistry sessionReport", () => {
  const params = {
    gamerName: "Aino",
    geduName: "Marianne",
    productName: "Minecraft: Cozy Adventures",
    groupName: "Usvalaakso: Kettukallio",
    copy: "family",
    photoCount: "0",
    sample: "en",
    viewerTimezone: "Europe/Helsinki",
    reportMarkdown: "",
    productUrl: "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
  };

  it("formats the sample's date and time in the parent's zone for the locale", async () => {
    const { subject, html } = templateRegistry.sessionReport.render(params, t, "en");
    expect(subject).toBe("Session report – Minecraft: Cozy Adventures, Thursday, August 20, 2026");
    expect(html).toContain("Thursday, August 20, 2026");
    // 13:30Z is 16:30 in Helsinki summer time.
    expect(html).toMatch(/16:30\s*–\s*18:00/);

    const fi = await getEmailTranslator("fi");
    const finnish = templateRegistry.sessionReport.render(params, fi, "fi");
    expect(finnish.subject).toContain("torstai 20. elokuuta 2026");
  });

  /**
   * The zone is always named: a mail is rendered without the reader's own zone,
   * so the reader has to be able to see which zone the clock face is in.
   */
  it("always names the zone the times are formatted in", () => {
    const home = templateRegistry.sessionReport.render(params, t, "en");
    expect(home.html).toMatch(/16:30\s*–\s*18:00 GMT\+3/);

    const away = templateRegistry.sessionReport.render(
      { ...params, viewerTimezone: "Europe/London" },
      t,
      "en",
    );
    expect(away.html).toMatch(/14:30\s*–\s*16:00 GMT\+1/);
    expect(away.subject).toContain("Thursday, August 20, 2026");
  });

  it("sends the sample's own markdown when the override is empty", () => {
    const { html } = templateRegistry.sessionReport.render(params, t, "en");
    expect(html).toContain("Lanterns over the Harbour");
  });

  /**
   * The report's language is the gedu's, the mail's is the parent's, and the
   * two are independent: a Finnish report inside an English mail keeps its
   * Finnish title while the chrome around it stays English.
   */
  it("keeps the report's own language whatever locale the mail is sent in", () => {
    const { subject, html } = templateRegistry.sessionReport.render(
      { ...params, sample: "fi" },
      t,
      "en",
    );
    expect(html).toContain("Lyhtyjä sataman ylle");
    expect(html).toContain("View in My SOG");
    expect(subject).toContain("Thursday, August 27, 2026");
  });

  it("lets a typed report replace the sample's markdown but keep its date", () => {
    const { subject, html } = templateRegistry.sessionReport.render(
      { ...params, reportMarkdown: "# Custom report\n\nTyped in the tool." },
      t,
      "en",
    );
    expect(html).toContain("Custom report");
    expect(html).toContain("Typed in the tool.");
    expect(html).not.toContain("Lanterns over the Harbour");
    expect(subject).toContain("Thursday, August 20, 2026");
  });

  /**
   * The select is the whole reason the variant is testable from the admin tool:
   * a banner nobody can send themselves is a banner nobody can check. The
   * default option is the family mail, which is what an untouched form posts.
   */
  it("renders the staff copy's banner only when the form asks for it", () => {
    const family = templateRegistry.sessionReport.render(params, t, "en");
    const staff = templateRegistry.sessionReport.render({ ...params, copy: "staff" }, t, "en");

    expect(staff.html).toContain("Gedu and Admin copy");
    expect(staff.html).toContain("Every family received their own separate email");
    expect(family.html).not.toContain("Gedu and Admin copy");
    // The subject is the family mail's, deliberately: the copy is the same mail
    // and finds itself in an inbox by the same line.
    expect(staff.subject).toBe(family.subject);
  });

  /**
   * The live send puts the GROUP's name in the child's slot on the staff copy,
   * so the intro reads as a record of what the group was mailed. The testing
   * tool has to do the same or its staff render is a mail nobody receives —
   * right banner, wrong first sentence.
   */
  it("puts the group's name in the child's slot on the staff copy", () => {
    const family = templateRegistry.sessionReport.render(params, t, "en");
    const staff = templateRegistry.sessionReport.render({ ...params, copy: "staff" }, t, "en");

    // The styled span, not the bare name: the group's name is in the fact table
    // of both mails, and the child's name is in the sample report's own text.
    expect(family.html).toContain(styledName("Aino"));
    expect(staff.html).not.toContain(styledName("Aino"));
    expect(staff.html).toContain(styledName("Usvalaakso: Kettukallio"));
  });

  /**
   * The photo count is the tool's whole answer to a question no unit test can
   * settle: what a grid of pictures looks like in a real inbox, with images on
   * and with images off. So the select has to actually hang photos on the
   * fixture session — and the fixtures have to be absolute, because a relative
   * path is unfetchable from wherever the test send lands.
   */
  it("hangs the chosen number of demo photos on the fixture session", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
    try {
      const none = templateRegistry.sessionReport.render(params, t, "en");
      expect(none.html).not.toContain("Photos from this session");

      const three = templateRegistry.sessionReport.render(
        { ...params, photoCount: "3" },
        t,
        "en",
      );
      expect(three.html).toContain("Photos from this session");
      expect(three.html.match(/<img src="https:\/\/sogverse\.sog\.gg\/preview-art\//g))
        .toHaveLength(3);
      // The staff copy is the same mail behind a banner, pictures included.
      const staff = templateRegistry.sessionReport.render(
        { ...params, photoCount: "3", copy: "staff" },
        t,
        "en",
      );
      expect(staff.html.match(/<img src="https:\/\/sogverse\.sog\.gg\/preview-art\//g))
        .toHaveLength(3);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  /**
   * A send from a dev machine carries no photos, on exactly the terms the
   * shell's brand mark takes: a `localhost` src is unreachable by construction
   * for the inbox the mail is about to land in, and a *failed* fetch is worse
   * than an absent one — Gmail's proxy paints its broken-image glyph in every
   * well the design reserved. The rule is that an `<img>` which will
   * predictably fail is never emitted, and a fixture is not exempt from it.
   */
  it("sends no photos when the origin is one only a dev machine can reach", () => {
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
      try {
        const { html } = templateRegistry.sessionReport.render(
          { ...params, photoCount: "5" },
          t,
          "en",
          { to: "send" },
        );
        expect(html, `origin ${origin} produced photos`)
          .not.toContain("Photos from this session");
        expect(html).not.toContain("/preview-art/");
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  /**
   * The preview is the other destination, and the reason the context exists:
   * the mail drawn in `/admin/testing` is fetched by the browser looking at
   * it, so the loopback origin that is useless in an inbox is the right one
   * here. Suppressing the grid there would leave the one surface built to show
   * it with nothing to show — no pairs, no spanning odd one, no wells.
   */
  it("keeps the photos in a preview, resolved against the previewing browser", () => {
    // Not the env: a preview names the origin its own browser will fetch from,
    // which is the dev server actually serving the art whatever port it is on.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    try {
      const { html } = templateRegistry.sessionReport.render(
        { ...params, photoCount: "5" },
        t,
        "en",
        { to: "preview", origin: "http://localhost:3010" },
      );
      expect(html).toContain("Photos from this session");
      const sources = html.match(/<img src="[^"]+"/g) ?? [];
      expect(
        sources.filter((tag) => tag.startsWith('<img src="http://localhost:3010/preview-art/')),
      ).toHaveLength(5);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  /**
   * A real origin is a real origin in both destinations — the distinction is
   * about reachability, not about the tool, so a staging or production send is
   * unchanged by any of it.
   */
  it("carries the photos from a public origin whichever way it is rendered", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
    try {
      const contexts = [
        { to: "send" },
        { to: "preview", origin: "https://sogverse.sog.gg" },
      ] as const;
      for (const context of contexts) {
        const { html } = templateRegistry.sessionReport.render(
          { ...params, photoCount: "3" },
          t,
          "en",
          context,
        );
        expect(html, `context ${context.to} dropped the photos`)
          .toContain("Photos from this session");
        expect(html.match(/<img src="https:\/\/sogverse\.sog\.gg\/preview-art\//g))
          .toHaveLength(3);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  /**
   * No origin is the third case, and it is an impossibility rather than a
   * judgment: there is no absolute URL to put in a `src`, and a half-built one
   * is what this directory never emits. The default context is the send, which
   * is what a caller who has not thought about it should get.
   */
  it("renders no photos at all when no site origin can be built", () => {
    for (const origin of ["", "not-a-url"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
      try {
        const { html } = templateRegistry.sessionReport.render(
          { ...params, photoCount: "5" },
          t,
          "en",
        );
        expect(html, `origin ${JSON.stringify(origin)} produced photos`)
          .not.toContain("Photos from this session");
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it("rejects a sample id it does not know", () => {
    expect(() =>
      templateRegistry.sessionReport.render({ ...params, sample: "1999-01-01" }, t, "en"),
    ).toThrow();
  });
});

/**
 * Every registered template, rendered in every locale we ship.
 *
 * The failure this catches is a key added to `en.json` and forgotten in one of
 * the other four: the translator falls back to printing the key path, so the
 * mail still renders, still sends, and reads as `email.welcomeParent.heading`
 * to a Finnish parent. Each case looks for its own template's key prefix, which
 * is what a fallback prints — a blanket search for `email.` would trip over
 * every sentence that happens to end in the word.
 */
describe("every template renders in every locale", () => {
  /**
   * Valid params per template, and the list is checked against the registry
   * below — a new template with no fixture fails here rather than quietly
   * skipping the sweep.
   */
  const TEMPLATE_PARAMS: Record<string, Record<string, string | boolean | null>> = {
    componentsReference: {},
    passwordReset: { resetLink: "https://sogverse.sog.gg/reset-password?code=abc123" },
    feedback: {
      userName: "Marja Virtanen",
      userRole: "customer",
      userEmail: "marja@example.com",
      message: "Great product!",
    },
    welcomeParent: {
      firstName: "Marja",
      verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
      dashboardUrl: "https://sogverse.sog.gg/parent",
      shopUrl: "https://sogverse.sog.gg/shop",
      settingsUrl: "https://sogverse.sog.gg/settings",
    },
    welcomeGedu: {
      firstName: "Alice",
      verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
      dashboardUrl: "https://sogverse.sog.gg/gedu",
      settingsUrl: "https://sogverse.sog.gg/settings",
    },
    productConfirmation: {
      participantName: "Aino",
      isSelfSeat: false,
      productName: "Minecraft 101",
      productType: "camp",
      mode: "upfront",
      priceAmount: "€40.00",
      dashboardUrl: "https://sogverse.sog.gg/parent",
    },
    verifyEmail: {
      firstName: "Marja",
      verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
    },
    seatOffer: {
      participantName: "Aino",
      isSelfSeat: false,
      productName: "Minecraft 101",
      deadline: "Sunday, 31 August at 14:20 GMT+3",
      acceptUrl: "https://sogverse.sog.gg/seat-offer?token=abc123&answer=accept",
      declineUrl: "https://sogverse.sog.gg/seat-offer?token=abc123&answer=decline",
      dashboardUrl: "https://sogverse.sog.gg/parent",
    },
    seatOfferStaff: {
      reason: "declined",
      participantName: "Aino",
      contactName: "Marja Virtanen",
      contactEmail: "marja@example.com",
      productName: "Minecraft 101",
      productSchedule: "Tue 16:00, Thu 16:00 (Europe/Helsinki)",
      offeredAt: "Tue, 26 Aug, 14:20 GMT+3",
      adminProductUrl:
        "https://sogverse.sog.gg/admin/municipality-clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
    },
    sessionReport: {
      gamerName: "Aino",
      geduName: "Marianne",
      productName: "Minecraft: Cozy Adventures",
      groupName: "Usvalaakso: Kettukallio",
      copy: "family",
      // Photos, so the locale sweep also reaches the one section with a
      // translated line of its own above it.
      photoCount: "3",
      sample: "en",
      viewerTimezone: "Europe/Helsinki",
      reportMarkdown: "",
      productUrl: "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
    },
  };

  /**
   * One fixture is not always one mail. The session report's builder ships two —
   * the family's and the staff copy — and the copy's banner is the only thing
   * that reads the `staffCopy*` keys, so a sweep that only ever asked for the
   * family mail would let those three keys go missing from four locales without
   * anything failing. Every variant listed here goes through the same key-leak
   * guard below; a template with no entry is swept once, as its own fixture.
   */
  const TEMPLATE_VARIANTS: Record<string, Record<string, string | boolean | null>[]> = {
    sessionReport: [{ copy: "family" }, { copy: "staff" }],
    // The offer speaks in two voices, and each has its own heading, opening and
    // subject — four keys per locale that only the self variant reaches.
    seatOffer: [{ isSelfSeat: false }, { isSelfSeat: true }],
    // Declined and no-response are three keys apiece, in five locales, and only
    // the reason they name is ever rendered.
    seatOfferStaff: [{ reason: "declined" }, { reason: "no_response" }],
  };

  function variantsOf(key: string): Record<string, string | boolean | null>[] {
    return (TEMPLATE_VARIANTS[key] ?? [{}]).map((overrides) => ({
      ...TEMPLATE_PARAMS[key],
      ...overrides,
    }));
  }

  it("has a fixture for every registered template", () => {
    expect(Object.keys(TEMPLATE_PARAMS).sort()).toEqual(Object.keys(templateRegistry).sort());
  });

  describe.each(SUPPORTED_LOCALES)("%s", (locale) => {
    it.each(Object.keys(templateRegistry))("renders %s", async (key) => {
      const translator = await getEmailTranslator(locale);

      for (const params of variantsOf(key)) {
        const { subject, html, replyTo } = templateRegistry[key].render(
          params,
          translator,
          locale,
        );

        expect(subject.trim()).not.toBe("");
        expect(subject).not.toContain(`email.${key}`);
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain(`lang="${locale}"`);
        expect(html).not.toContain(`email.${key}`);
        expect(replyTo).toContain("@");
      }
    });
  });
});

/**
 * The reference earns assertions because its one claim is that it is built from
 * the real helpers. A specimen that drifted into hand-written markup would still
 * look right in a screenshot while having stopped describing the components —
 * which is the exact failure a reference page exists to prevent, so it is the
 * thing pinned here.
 */
describe("templateRegistry componentsReference", () => {
  function render() {
    return templateRegistry.componentsReference.render({}, translatorStub, "en");
  }

  let translatorStub: EmailTranslator;

  beforeAll(async () => {
    translatorStub = await getEmailTranslator("en");
  });

  it("shows every button variant, rendered by the shared helper", () => {
    const { html } = render();
    // One filled cell per variant, each carrying that variant's own fill.
    expect(html).toContain(`background-color:${BRAND.primary};background-image:linear-gradient(${BRAND.primary},${BRAND.primary})`);
    expect(html).toContain(`background-color:${BRAND.secondary};background-image:linear-gradient(${BRAND.secondary},${BRAND.secondary})`);
    expect(html).toContain(`color:${BRAND.primaryForeground}`);
    expect(html).toContain(`color:${BRAND.secondaryForeground}`);
    // The two-up row is the helper's, not a hand-built pair of cells.
    expect([...html.matchAll(/width="50%"/g)]).toHaveLength(2);
  });

  it("carries the whole palette, each swatch as a real background", () => {
    const { html } = render();
    for (const hex of [BRAND.primary, BRAND.secondary]) {
      expect(html).toContain(`background-image:linear-gradient(${hex},${hex})`);
    }
    expect(html).toContain("BRAND.secondary");
  });

  /**
   * The rendered mail is the work and the code is the placard, so the page
   * shows components and names them and explains nothing. Usage prose in the
   * output competes with the specimen it describes, is read by nobody at the
   * moment they need it, and is the half that rots — the specimen regenerates
   * on every send and the sentence about it does not.
   *
   * Asserted on contrast ratios in particular because they are the most
   * tempting thing to print: they read as helpful and they are a claim the
   * reader cannot check from the mail. `palette-contrast.test.ts` holds them
   * instead, where being wrong fails the build.
   */
  it("names its specimens and explains nothing", () => {
    const { html } = render();
    // Contrast ratios are the assertion that earns its place: they read as
    // helpful, they are the thing most likely to creep back in, and this page
    // carried them until today. The <code> and "Expected:" checks went with
    // them — both described prose shapes that were never anywhere else.
    expect(html).not.toMatch(/\d\.\d:1/);
  });

  /**
   * A reference that shows a broken example teaches it. The ruled-out
   * techniques live in this directory's CLAUDE.md instead, and this is what
   * stops one drifting back onto the page.
   */
  it("demonstrates nothing that is known to be wrong", () => {
    const { html } = render();
    // cta-on-card only: it is the class this branch deleted for breaking light
    // labels, and the reference is the first place someone would reintroduce it
    // while copying a button. Absences of things that never existed were removed
    // from here — an assertion that cannot fail reads as cover.
    expect(html).not.toContain("cta-on-card");
  });

  it("shows the text helpers rather than describing them", () => {
    const { html } = render();
    expect(html).toContain(styledName("Marja"));
    // The whole helper output, not a prefix of it: a slice short enough to be
    // safe covers only the <ul> wrapper, which every list shares, so it passes
    // whatever the items say — including when they say something the page does
    // not render.
    expect(html).toContain(
      bulletList([
        "One item, already composed and escaped.",
        "And a second, so it is a list.",
      ]),
    );
  });
});
