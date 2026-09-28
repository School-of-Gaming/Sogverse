import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type {
  CreateParticipationResponse,
  JoinWaitlistResponse,
} from "@/services/participations/participations.contracts";

/**
 * **Which signup outcomes the panel reports, and what it says about them.**
 *
 * The transport is not the subject here — whether a container was loaded, armed
 * or consented to is decided inside `pushGtmEvent` and has its own coverage. The
 * subject is the decision this panel makes before calling it, which is the half
 * no vendor can fix afterwards: an outcome reported once too often is a family
 * counted twice, and an outcome reported under the wrong word is an ad platform
 * taught to look for the wrong people.
 *
 * Four decisions, one per outcome:
 *
 *   * a Stripe handoff is `begin_checkout`, never the enrolment — nothing has
 *     been paid;
 *   * a free seat is an `enrolment`, and so is a municipality registration
 *     invoiced off-platform — the two differ only in how the council is
 *     invoiced, and an advertising platform is told about neither;
 *   * a place in the queue is an `enrolment` too, but only when this call is the
 *     one that took it: the join RPC answers a replay with the existing row,
 *     shape for shape, and `idempotent` is the only thing that separates them.
 *
 * And one that rides on all of them: `advertised` travels with the event and
 * never suppresses it, so a product nobody advertises is still counted — it is
 * counted with the flag that tells an advertising tag to leave it alone.
 */

vi.mock("next-intl", async () => {
  const { createElement, Fragment } = await import("react");
  type TagFn = (chunks: unknown) => import("react").ReactNode;
  type PlainValue = string | number;
  const echo = (key: string, values?: Record<string, PlainValue>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  const t = (key: string, values?: Record<string, PlainValue>) =>
    echo(key, values);
  t.rich = (key: string, values?: Record<string, PlainValue | TagFn>) => {
    const plain: Record<string, PlainValue> = {};
    const tags: [string, TagFn][] = [];
    for (const [name, value] of Object.entries(values ?? {})) {
      if (typeof value === "function") tags.push([name, value]);
      else plain[name] = value;
    }
    return createElement(
      Fragment,
      null,
      echo(key, plain),
      ...tags.map(([name, tag]) =>
        createElement(Fragment, { key: name }, tag(name)),
      ),
    );
  };
  return { useTranslations: () => t, useLocale: () => "en" };
});

vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-01-05T12:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    refreshProfile: () => {},
  }),
}));

vi.mock("@/components/family", () => ({ AddGamerDialog: () => null }));
vi.mock("@/components/public/products/region-lock/set-location-dialog", () => ({
  SetLocationDialog: () => null,
}));

/**
 * What React Query hands a mutation's caller back. Typed here rather than
 * asserted off `any` at the call site, so a case that answers with a shape the
 * route cannot produce fails to compile instead of passing.
 */
interface Handlers<TResponse> {
  onSuccess: (response: TResponse) => void;
  onError: (error: unknown) => void;
}

const createMutate =
  vi.fn<
    (input: unknown, handlers: Handlers<CreateParticipationResponse>) => void
  >();
const waitlistMutate =
  vi.fn<(input: unknown, handlers: Handlers<JoinWaitlistResponse>) => void>();

vi.mock("@/services/participations", () => ({
  useCreateParticipation: () => ({ mutate: createMutate }),
  useJoinWaitlist: () => ({ mutate: waitlistMutate }),
}));

vi.mock("@/services/users", () => ({
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/services/marketing-consents", () => ({
  useSetMarketingConsent: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/services/gamer-photo-consents", () => ({
  useSetGamerPhotoConsent: () => ({ mutate: vi.fn() }),
}));

// The one call the panel makes. Everything past it — the container, the consent
// gate, the queue — belongs to the pusher and is asserted where that lives.
const pushed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gtm", () => ({
  pushGtmEvent: (event: unknown) => pushed(event),
}));

import { SignupPanel } from "@/components/public/products/signup-panel";
import type { AuthState } from "@/components/public/products/signup-panel-view";

const PRODUCT_ID = "7c9e1f42-3a55-4c8e-b1d6-9f0a2e4c7b83";
const CHILD_ID = "0a4e3f21-6c8d-4f0b-9a17-2b5e8c1d4f60";
const PARTICIPATION_ID = "2d6a9c80-5b31-4e7f-a920-8c4d1e6f3b07";

/** The concrete product page, which is what every event must name. */
const PRODUCT_PATH = `/shop/${PRODUCT_ID}`;

const PRODUCT = {
  id: PRODUCT_ID,
  product_type: "consumer_club" as const,
  billing_mode: "free" as const,
  product_prices: [],
  for_gamers: true,
  start_date: "2026-01-12",
  timezone: "Europe/Helsinki",
};

/**
 * A club a council arranged and nobody is billed for. Its `product_type` is the
 * only difference from the product above, and that alone is enough to make it
 * one we do not advertise.
 */
const MUNICIPALITY_PRODUCT = {
  ...PRODUCT,
  product_type: "municipality_club" as const,
};

/**
 * The same club, invoiced to the council off-platform — the other half of the
 * pair, and the outcome it produces is the `external_confirmed` one. Its
 * billing mode disqualifies it from advertising a second time over, which is
 * the schema's own arrangement: only a municipality club may be contracted this
 * way.
 */
const EXTERNAL_PRODUCT = {
  ...MUNICIPALITY_PRODUCT,
  billing_mode: "external_contract" as const,
};

const AUTH: AuthState = {
  kind: "ready",
  participants: [{ id: CHILD_ID, name: "Aino", age: 11 }],
  gamerCount: 1,
};

const OPEN = {
  kind: "open",
  seatCount: null,
  seatsLeft: null,
  waitlistEnabled: false,
} as const;

const FULL = { kind: "full_waitlist", seatCount: 8 } as const;

// The Stripe branch ends in `window.location.href = …`, which jsdom refuses to
// navigate. Swapped for a stand-in that records each assignment together with
// how many events had already been pushed when it happened — the assignment
// unloads the document, so "pushed first" is a correctness claim rather than a
// stylistic one, and nothing else in the test can observe it.
let href = "http://localhost/";
const navigations: { to: string; pushesBefore: number }[] = [];
const realLocation = window.location;
Object.defineProperty(window, "location", {
  configurable: true,
  writable: true,
  value: {
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
      navigations.push({ to: value, pushesBefore: pushed.mock.calls.length });
    },
  },
});
afterAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

function panel({
  product = PRODUCT,
  state = OPEN,
}: {
  product?: React.ComponentProps<typeof SignupPanel>["product"];
  state?: React.ComponentProps<typeof SignupPanel>["state"];
} = {}) {
  return (
    <SignupPanel
      product={product}
      requiredConsentSlugs={[]}
      marketingConsentTypes={[]}
      gamerPhotoConsentTypes={[]}
      state={state}
      authState={AUTH}
      regionGate={{ kind: "unlocked" }}
      homeLocationName={null}
      onLocationConfirmed={() => {}}
    />
  );
}

const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

/**
 * Take the panel all the way to a submitted mutation: tick the one required
 * box (our rules) and press the button the state offers.
 */
function submit(container: HTMLElement) {
  const rules = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!rules) throw new Error("no agreement box");
  fireEvent.click(rules);
  fireEvent.click(cta(container));
}

/** Hand the mutation the answer the server would have given. */
function answerCreate(response: CreateParticipationResponse) {
  const { onSuccess } = createMutate.mock.calls[0][1];
  act(() => onSuccess(response));
}

function answerWaitlist(response: JoinWaitlistResponse) {
  const { onSuccess } = waitlistMutate.mock.calls[0][1];
  act(() => onSuccess(response));
}

/** The single event the panel pushed. */
const onlyEvent = () => pushed.mock.calls[0][0];

beforeEach(() => {
  createMutate.mockReset();
  waitlistMutate.mockReset();
  pushed.mockReset();
  href = "http://localhost/";
  navigations.length = 0;
});

describe("a paid signup is a checkout, not an enrolment", () => {
  it("pushes begin_checkout, and pushes it before the document is sent away", () => {
    const { container } = render(panel());
    submit(container);

    answerCreate({
      status: "redirect",
      checkoutUrl: "https://checkout.stripe.test/session",
    });

    // The parent has been handed to Stripe and has paid nothing. Reporting this
    // as an enrolment would teach an ad platform to find people who *start*
    // paying, and an abandoned checkout would train it as hard as a sale.
    expect(onlyEvent()).toEqual({
      event: "begin_checkout",
      outcome: "sent_to_checkout",
      advertised: true,
      page_path: PRODUCT_PATH,
    });
    // Ordering, not decoration: the assignment unloads the document, so a push
    // made after it would never reach the queue at all.
    expect(navigations).toEqual([
      { to: "https://checkout.stripe.test/session", pushesBefore: 1 },
    ]);
  });
});

describe("a seat taken without paying is an enrolment", () => {
  it("pushes the enrolment for a free seat", () => {
    const { container } = render(panel());
    submit(container);

    answerCreate({
      status: "free_confirmed",
      participationId: PARTICIPATION_ID,
    });

    expect(onlyEvent()).toEqual({
      event: "enrolment",
      outcome: "enrolled",
      advertised: true,
      page_path: PRODUCT_PATH,
    });
  });

  it("pushes a municipality club too, with the flag that says not to bid on it", () => {
    const { container } = render(panel({ product: MUNICIPALITY_PRODUCT }));
    submit(container);

    answerCreate({
      status: "free_confirmed",
      participationId: PARTICIPATION_ID,
    });

    // Not suppressed — suppression is an advertising rule, and leaving these
    // out would make the analytics numbers disagree with our own database. The
    // decision travels as a field, and the container decides which tags read it.
    expect(onlyEvent()).toMatchObject({
      event: "enrolment",
      outcome: "enrolled",
      advertised: false,
    });
  });

  it("pushes the off-platform twin on the same terms", () => {
    const { container } = render(panel({ product: EXTERNAL_PRODUCT }));
    submit(container);

    answerCreate({
      status: "external_confirmed",
      participationId: PARTICIPATION_ID,
    });

    // It differs from the free municipality club above only in how the council
    // is invoiced. Reporting one and not the other would under-count
    // municipality enrolments against our own database for a reason no reader
    // of the numbers could ever find — which is exactly the divergence the flag
    // exists to prevent, and why the discriminant does not gate this push.
    expect(onlyEvent()).toMatchObject({
      event: "enrolment",
      outcome: "enrolled",
      advertised: false,
    });
  });

  it("reports nothing when the seat went between the click and the check", () => {
    const { container } = render(panel());
    submit(container);

    answerCreate({ status: "full" });

    // Nobody enrolled. The panel swaps to the waitlist door instead.
    expect(pushed).not.toHaveBeenCalled();
  });
});

describe("a place in the queue counts once", () => {
  it("pushes the waitlisted enrolment when this call took the place", () => {
    const { container } = render(panel({ state: FULL }));
    submit(container);

    answerWaitlist({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
      idempotent: false,
    });

    expect(onlyEvent()).toEqual({
      event: "enrolment",
      outcome: "waitlisted",
      advertised: true,
      page_path: PRODUCT_PATH,
    });
  });

  it("reports nothing for a replay", () => {
    const { container } = render(panel({ state: FULL }));
    submit(container);

    // A stale tab resubmitting, a browser retrying, a second parent joining a
    // gamer who already holds the place: the RPC hands back the existing row,
    // identical in every other field, and the flag is the only difference.
    answerWaitlist({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
      idempotent: true,
    });

    expect(pushed).not.toHaveBeenCalled();
  });

  it("reports nothing when the join came back as a seat rather than a queue place", () => {
    const { container } = render(panel({ state: FULL }));
    submit(container);

    // The server's other half of the same gate: a fresh row that is not
    // `waitlisted` is a seat, and must not be reported as a place in line.
    answerWaitlist({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 0,
      status: "active",
      idempotent: false,
    });

    expect(pushed).not.toHaveBeenCalled();
  });
});
