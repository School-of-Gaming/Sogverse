import { describe, it, expect, beforeAll, vi } from "vitest";
import { templateRegistry } from "@/lib/email-templates/registry";
import { BRAND } from "@/lib/constants/colors";
import { styledName } from "@/lib/email-templates/utils";
import { bulletList } from "@/lib/email-templates/blocks";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import {
  CALENDAR_EXPLORER_BODY,
  calendarInvitationStartDate,
  calendarInvitationUntilDate,
} from "@/lib/email-templates/calendar-invitation";

/**
 * The schedule half of the signup form, as a product with a real one posts it.
 *
 * Spread into every product-confirmation fixture below, because the schema
 * requires the whole form — and because the dates have to be *ahead* of now for
 * an invitation to be composed at all, which is a fact about the render rather
 * than about the fixture.
 */
const PRODUCT_CONFIRMATION_SCHEDULE = {
  participationId: "3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
  attendeeName: "Marja Virtanen",
  attendeeEmail: "marja@example.com",
  topic: "minecraft_java",
  shortDescription: "Build, explore and survive together.",
  timezone: "Europe/Helsinki",
  startDate: calendarInvitationStartDate(),
  endDate: calendarInvitationUntilDate(),
  slots: "mon 16:00 60",
  isRemote: "no",
  siteName: "Kallion kirjasto",
  siteAddress: "Viides linja 11, 00530 Helsinki",
  siteNote: "The door on the north side. Ring the bell.",
};

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

/**
 * The calendar explorer's baseline params — every field at the value its
 * untouched form control posts, which is what makes it a *baseline*: this is
 * the document the first send of a session carries, and everything after it is
 * this fixture with one key overridden.
 */
const CALENDAR_INVITATION_FIXTURE = {
  subject: "Calendar invite explorer",
  body: "",
  uid: "",
  sequence: "0",
  method: "request",
  status: "confirmed",
  timezone: "Europe/Helsinki",
  startDate: calendarInvitationStartDate(),
  startTime: "16:00",
  durationMinutes: "120",
  timeForm: "tzid",
  allDay: "no",
  recurrence: "none",
  weekdays: "mon",
  until: "",
  count: "",
  interval: "1",
  excludedDates: "",
  overrides: "",
  organizerName: "School of Gaming",
  organizerEmail: "sogverse@sog.gg",
  attendeeName: "Attendee",
  attendeeEmail: "attendee@example.com",
  rsvp: "yes",
  attendeeRole: "REQ-PARTICIPANT",
  partstat: "NEEDS-ACTION",
  includeAttendee: "yes",
  summary: "Calendar invite explorer",
  description: "",
  location: "Helsinki, Finland",
  url: "",
  alert1Offset: "15",
  alert1Action: "display",
  alert1RelativeTo: "start",
  alert2Offset: "1440",
  alert2Action: "display",
  alert2RelativeTo: "start",
  alert3Offset: "none",
  alert3Action: "display",
  alert3RelativeTo: "start",
  showAs: "free",
} satisfies Record<string, string | boolean | null>;

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
      ...PRODUCT_CONFIRMATION_SCHEDULE,
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

    /**
     * The calendar half of the form. It is the same document the live send
     * attaches, composed from typed fields instead of a product row — so this
     * is where the parsing of those fields is pinned, and where the mail's
     * three artifacts are checked to agree with each other.
     */
    describe("the calendar invitation it composes", () => {
      it("attaches invite.ics and states the schedule when the form names slots", () => {
        const { html, text, attachments } = templateRegistry.productConfirmation.render(
          { ...signup, isSelfSeat: false },
          t,
          "en",
        );

        expect(html).toContain("Session times");
        expect(html).toContain("Every Monday, 16:00–17:00");
        expect(html).toContain("Kallion kirjasto");
        expect(attachments?.[0].name).toBe("invite.ics");
        expect(attachments?.[0].text).toContain("BEGIN:VCALENDAR");
        expect(attachments?.[0].text).toContain(
          `UID:${PRODUCT_CONFIRMATION_SCHEDULE.participationId}@sogverse`,
        );
        expect(text).toContain("Every Monday, 16:00–17:00");
      });

      /**
       * An untouched schedule textarea posts nothing, and nothing means a
       * product with no slots — which is the mail this template sent before the
       * invitation existed. All three artifacts have to disappear together.
       */
      it("sends the plain mail, with no file and no text body, when the schedule is empty", () => {
        const { html, text, attachments } = templateRegistry.productConfirmation.render(
          { ...signup, isSelfSeat: false, slots: "" },
          t,
          "en",
        );

        expect(html).not.toContain("Session times");
        expect(text).toBeUndefined();
        expect(attachments).toBeUndefined();
      });

      it("mints an identifier when the form names none", () => {
        const { attachments } = templateRegistry.productConfirmation.render(
          { ...signup, isSelfSeat: false, participationId: "" },
          t,
          "en",
        );

        expect(attachments?.[0].text).toMatch(/UID:[0-9a-f-]{36}@sogverse/);
      });

      it("names the field when a schedule line cannot be read", () => {
        expect(() =>
          templateRegistry.productConfirmation.render(
            { ...signup, isSelfSeat: false, slots: "funday 16:00 60" },
            t,
            "en",
          ),
        ).toThrow(/^Schedule: expected one of mon, tue/);
      });

      it("names the field when a date cannot be read", () => {
        expect(() =>
          templateRegistry.productConfirmation.render(
            { ...signup, isSelfSeat: false, startDate: "2027-02-31" },
            t,
            "en",
          ),
        ).toThrow(/^Start date: expected a real calendar date/);
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
   * And the default is the send — pinned where it can actually be told apart.
   *
   * The two cases above and below both pass a context or have no origin to build
   * from, so neither would notice the default drifting to `preview`. A reachable-
   * looking loopback origin with **no context argument at all** is the one shape
   * that separates them: as a send it drops the photos, as a preview it would
   * keep them. A caller who has not thought about where the mail is going is
   * sending it, which is the conservative half of the pair.
   */
  it("defaults to the send, so an unstated context drops a loopback origin's photos", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    try {
      const { html } = templateRegistry.sessionReport.render(
        { ...params, photoCount: "5" },
        t,
        "en",
      );
      expect(html).not.toContain("Photos from this session");
      expect(html).not.toContain("/preview-art/");
    } finally {
      vi.unstubAllEnvs();
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
 * The one template that carries a file, and the half of it a unit test can
 * settle.
 *
 * What no test can settle is the thing the template exists for — what a client
 * *does* with each property — so what is pinned here is the boundary between
 * the form and the document: that the form's untouched values compose a
 * baseline invitation, that the file travels as `invite.ics` in both the form
 * a send takes and the form a preview shows, that one render mints one
 * identifier, and that a mistyped field earns a sentence naming it rather than
 * a stack trace.
 */
describe("templateRegistry calendarInvitation", () => {
  const params = CALENDAR_INVITATION_FIXTURE;

  function icsOf(rendered: { attachments?: { name: string; text?: string }[] }): string {
    const invite = rendered.attachments?.find((file) => file.name === "invite.ics");
    if (invite?.text === undefined) throw new Error("no invite.ics on the render");
    return invite.text;
  }

  function render(overrides: Record<string, string> = {}) {
    return templateRegistry.calendarInvitation.render({ ...params, ...overrides }, t, "en");
  }

  it("carries the calendar as invite.ics, decoded for the preview and encoded for the send", () => {
    const [invite] = render().attachments ?? [];

    expect(invite.name).toBe("invite.ics");
    expect(invite.text?.startsWith("BEGIN:VCALENDAR")).toBe(true);
    // The two halves are the same bytes: the name and the base64 are what
    // leaves the building, the text is only ever shown on screen.
    expect(Buffer.from(invite.contentBase64, "base64").toString("utf8")).toBe(invite.text);
  });

  /**
   * The whole method the template exists for: an untouched form is a document
   * with nothing surprising in it, so a client that mangles the *next* send has
   * told you which single property it mangled.
   */
  it("composes a baseline invitation from an untouched form", () => {
    const ics = icsOf(render());

    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("TRANSP:TRANSPARENT");
    expect(ics).toContain("DTSTART;TZID=Europe/Helsinki:");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    // The two alarms the two defaulted selects ask for, and no third.
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    // Nothing the form left blank. Scoped to the event, because the zone block
    // carries an `RRULE` of its own describing the daylight-saving transitions
    // — a search over the whole document finds that one and asserts nothing.
    const event = ics.slice(ics.indexOf("BEGIN:VEVENT"), ics.indexOf("END:VEVENT"));
    // `DESCRIPTION` is not on this list, and cannot be: a display alarm carries
    // one of its own, so its absence from the *event* is the builder suite's
    // assertion to make, where a component can be picked out on its own.
    for (const absent of ["RRULE", "EXDATE", "RECURRENCE-ID", "URL"]) {
      expect(event, `${absent} was written from a blank field`).not.toContain(`\r\n${absent}`);
    }
  });

  /**
   * The mail is incidental and says so: the subject and the body are the two
   * fields, unchanged, and nothing about the calendar leaks into either.
   */
  it("states the typed subject and body, and falls back to the neutral one", () => {
    const typed = render({ subject: "One field changed", body: "Watch the DTSTART." });
    expect(typed.subject).toBe("One field changed");
    expect(typed.text).toBe("Watch the DTSTART.");
    expect(typed.html).toContain("Watch the DTSTART.");

    // An untouched textarea posts nothing, and a mail with no words in it is
    // not a baseline mail — so this one field reads its own placeholder back.
    expect(render().text).toBe(CALENDAR_EXPLORER_BODY);
  });

  /** The plain-text part is the mail's own words, with no markup in it. */
  it("states a plain-text body, which is where Exchange reads the entry's notes", () => {
    const { text } = render();
    if (text === undefined) throw new Error("no text body on the render");
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
  });

  /**
   * The identifier is what makes a second message land on the first one's
   * entry, so the form's two states are the whole of the thread mechanism: an
   * empty field mints one, and a typed one is used exactly as typed.
   */
  it("mints an identifier when the form names none and uses a typed one verbatim", () => {
    expect(icsOf(render())).toMatch(/UID:[0-9a-f-]{36}@sogverse/);

    const named = icsOf(render({ uid: "explorer-1@sogverse", sequence: "3" }));
    expect(named).toContain("UID:explorer-1@sogverse");
    expect(named).toContain("SEQUENCE:3");
  });

  /**
   * The identifier is minted per *render*, and one render has to mint exactly
   * one: the file the reader gets and the copy the admin reads back after a
   * send both state it, and an admin who cannot read the identifier a send used
   * cannot send an update against it. Three parts each resolving their own
   * params is how that broke, and each part was correct on its own — so the
   * count is what has to be asserted.
   */
  it("mints one identifier per render, however many parts read it", () => {
    const minted = vi.spyOn(crypto, "randomUUID");
    try {
      const rendered = render();
      expect(minted).toHaveBeenCalledTimes(1);
      expect(icsOf(rendered)).toContain(`UID:${minted.mock.results[0].value}@sogverse`);
    } finally {
      minted.mockRestore();
    }
  });

  /**
   * Every knob is a field, so every field is somewhere a typo can land — and
   * the person typing is looking at fifty of them. A refusal therefore names
   * the field and what it wanted, because the testing page shows a thrown
   * message verbatim and the send route answers with it.
   */
  it.each([
    ["startDate", { startDate: "7.9.2026" }, /Start date: expected a date as YYYY-MM-DD/],
    ["startDate", { startDate: "2026-02-31" }, /Start date: expected a real calendar date/],
    ["startTime", { startTime: "16.00" }, /Start time: expected a 24-hour clock time/],
    ["durationMinutes", { durationMinutes: "two hours" }, /Duration: expected a whole number/],
    ["url", { url: "sogverse.sog.gg" }, /URL: expected an absolute URL/],
    ["url", { url: "javascript:alert(1)" }, /URL: expected an http or https URL/],
    ["attendeeEmail", { attendeeEmail: "nobody" }, /Attendee email: expected an email address/],
    ["organizerEmail", { organizerEmail: "nobody" }, /Organizer email: expected an email address/],
    ["sequence", { sequence: "-1" }, /SEQUENCE: expected a whole number/],
    // The two shapes each parse fields the other never looks at, so each case
    // has to select its own shape or the field it is about is never read.
    ["interval", { recurrence: "weekly", interval: "0" }, /INTERVAL: expected a whole number of at least 1/],
    ["until", { recurrence: "weekly", until: "31-10-2026" }, /UNTIL: expected a date as YYYY-MM-DD/],
    ["count", { recurrence: "weekly", count: "many" }, /COUNT: expected a whole number/],
    ["excludedDates", { excludedDates: "next Tuesday" }, /Excluded dates: expected a date as YYYY-MM-DD/],
    // A run that ends before it begins. Nothing downstream refuses it — the
    // start is an occurrence whatever the rule says — so the document would go
    // out stating a rule that produces exactly one day.
    [
      "until before the start",
      { recurrence: "weekly", until: "2020-01-06" },
      /UNTIL: the end date is before the start date/,
    ],
    // A title of three spaces is not a title: SUMMARY is the only line a client
    // has to name the entry by, so blank and whitespace arrive at the same
    // untitled entry and are refused together.
    ["summary", { summary: "   " }, /nothing but whitespace/],
  ])("refuses a malformed %s with a message naming it", (_field, overrides, message) => {
    expect(() => render(overrides)).toThrow(message);
  });

  /**
   * The attendee's address is read by the `ATTENDEE` line and by an email
   * alarm, and by nothing else — so a publish that writes neither never looks
   * at the field, and refusing a send over an address no line of the document
   * states is a refusal about nothing.
   */
  it("validates the attendee address only where the document reads it", () => {
    const published = icsOf(render({ includeAttendee: "no", attendeeEmail: "not an address" }));
    expect(published).toContain("BEGIN:VCALENDAR");
    expect(published).not.toContain("ATTENDEE");

    expect(() =>
      render({ includeAttendee: "no", attendeeEmail: "not an address", alert1Action: "email" }),
    ).toThrow(/Attendee email: expected an email address/);
  });

  /**
   * A document with nothing in it is refused rather than sent: a calendar
   * describing no occurrence still opens a conversation the reader's calendar
   * has no entry for.
   */
  it("refuses an object whose every occurrence is excluded", () => {
    expect(() => render({ excludedDates: params.startDate })).toThrow(
      /states no occurrence at all/,
    );
  });

  /**
   * The override lines, which are the one field whose validity depends on the
   * *rest* of the form: a date the rule never produces is a `RECURRENCE-ID`
   * matching nothing, and a client answers that by creating a second entry
   * beside the one that was meant to move. By the time anybody notices there
   * are two, so it is refused here.
   */
  describe("the override lines", () => {
    /** A Monday rule, so a Monday override lands and any other weekday does not. */
    const weekly = { recurrence: "weekly", weekdays: "mon" };

    /**
     * The Monday `weeks` after the start, as `YYYY-MM-DD`.
     *
     * UTC-pinned end to end — built from a `…Z` string and stepped and read
     * through the UTC accessors alone — so the arithmetic never meets a
     * daylight-saving transition, whatever zone the suite runs in.
     */
    function mondayAfter(weeks: number): string {
      const day = new Date(`${params.startDate}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + weeks * 7);
      return day.toISOString().slice(0, 10);
    }

    const secondMonday = mondayAfter(1);

    it("emits an exception component under the same identifier", () => {
      const ics = icsOf(render({ ...weekly, overrides: `${secondMonday} 14:00 90` }));

      expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(ics).toContain(`RECURRENCE-ID;TZID=Europe/Helsinki:${secondMonday.replace(/-/g, "")}T160000`);
      expect(ics).toContain(`DTSTART;TZID=Europe/Helsinki:${secondMonday.replace(/-/g, "")}T140000`);
      expect(ics).toContain("DURATION:PT90M");
    });

    it.each([
      [
        "a weekday the rule never produces",
        { ...weekly, weekdays: "tue", overrides: `${secondMonday} 14:00` },
        /Overrides: expected a date the rule's BYDAY covers/,
      ],
      [
        "a date before the run starts",
        { ...weekly, overrides: "2020-01-06 14:00" },
        /Overrides: expected a date on or after the start date/,
      ],
      [
        "a date that is also excluded",
        { ...weekly, excludedDates: secondMonday, overrides: `${secondMonday} 14:00` },
        /Overrides: expected a date that is not also on the excluded list/,
      ],
      [
        "a line that is not a date and a time",
        { ...weekly, overrides: secondMonday },
        /Overrides: expected a date, a time, and optionally a duration/,
      ],
      [
        "a duration that is not a number",
        { ...weekly, overrides: `${secondMonday} 14:00 ninety` },
        /Override duration: expected a whole number/,
      ],
      [
        "a schedule with no occurrences to except",
        { recurrence: "none", overrides: `${secondMonday} 14:00` },
        /Overrides: only the weekly rule has occurrences to override/,
      ],
    ])("refuses %s", (_case, overrides, message) => {
      expect(() => render(overrides)).toThrow(message);
    });

    /**
     * The other end of the same check the start date makes, and the end no
     * field can answer on its own: an `UNTIL` names a day the run may not pass
     * rather than the day it stops on, and a `COUNT` names no day at all. Both
     * rules below state three Mondays — the start and the two after it — so the
     * third Monday after it is past the end of both, and the second is the last
     * occurrence itself, which is a date an override may legitimately name.
     */
    it.each([
      ["an UNTIL-bounded rule", { until: mondayAfter(2) }],
      ["a COUNT-bounded rule", { count: "3" }],
    ])("refuses an override past the last occurrence of %s", (_case, bound) => {
      expect(() =>
        render({ ...weekly, ...bound, overrides: `${mondayAfter(3)} 14:00` }),
      ).toThrow(/Overrides: expected a date on or before/);

      expect(icsOf(render({ ...weekly, ...bound, overrides: `${mondayAfter(2)} 14:00` }))).toContain(
        `RECURRENCE-ID;TZID=Europe/Helsinki:${mondayAfter(2).replace(/-/g, "")}T160000`,
      );
    });
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
      // With a schedule, so the locale sweep also reaches the session-times
      // section, the attached-invitation sentence and — through the invitation
      // itself — every key the calendar entry's own notes are written from.
      ...PRODUCT_CONFIRMATION_SCHEDULE,
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
    calendarInvitation: CALENDAR_INVITATION_FIXTURE,
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
        const { subject, html, text, replyTo, attachments } = templateRegistry[
          key
        ].render(params, translator, locale);

        expect(subject.trim()).not.toBe("");
        expect(subject).not.toContain(`email.${key}`);
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain(`lang="${locale}"`);
        expect(html).not.toContain(`email.${key}`);
        expect(replyTo).toContain("@");
        // The other two artifacts a render can produce. A missing key resolves
        // to its own path, so the same check catches an English fallback that
        // leaked into a calendar entry's notes or into the text body — neither
        // of which the HTML sweep above can see.
        expect(text ?? "").not.toContain(`email.${key}`);
        for (const attachment of attachments ?? []) {
          expect(attachment.text ?? "").not.toContain(`email.${key}`);
        }
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
