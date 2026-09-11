import { vi } from "vitest";

// jsdom implements no layout, so it ships no `ResizeObserver` at all — a
// component that measures itself throws on mount rather than measuring
// something wrong. An inert stand-in is the honest stub: every element in jsdom
// reports a zero box, so a real implementation would have nothing to report and
// a callback that never fires is exactly what these tests should see. The
// components that use one are written to render correctly before their first
// measurement (a sticky inset that starts at its unmeasured default, a scroll
// affordance that starts hidden), which is what makes that safe.
class InertResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", InertResizeObserver);

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// The same mock for the app's own navigation module, which is what components
// import now that hrefs are locale-aware. Without it every test rendering a
// link would drag in next-intl's routing context and fail on the missing
// locale — the wrapped hooks read one, where `next/navigation`'s do not.
//
// `Link` renders a real anchor so the existing `getByRole("link")` queries and
// `toHaveAttribute("href")` assertions keep working: an href object is resolved
// the way the router resolves it, by filling the pathname's dynamic segments
// from `params` and appending `query`. The locale prefix is deliberately
// absent — a test asserting on `/shop/abc` is asserting about the route, not
// about which language the reader is in.
vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  type Href =
    | string
    | {
        pathname: string;
        params?: Record<string, string | number>;
        query?: Record<string, string | number | boolean>;
      };

  function resolve(href: Href): string {
    if (typeof href === "string") return href;
    let pathname = href.pathname;
    for (const [key, value] of Object.entries(href.params ?? {})) {
      pathname = pathname.replace(`[${key}]`, String(value));
    }
    const query = Object.entries(href.query ?? {});
    if (query.length === 0) return pathname;
    const search = new URLSearchParams(
      query.map(([key, value]) => [key, String(value)]),
    );
    return `${pathname}?${search.toString()}`;
  }

  return {
    Link: ({ href, ...props }: { href: Href } & Record<string, unknown>) =>
      // Props first, `href` last: React emits attributes in key order, and
      // the real `Link` puts `class` before `href` — a test asserting on
      // rendered HTML should not have to know which mock produced it.
      createElement("a", { ...props, href: resolve(href) }),
    usePathname: () => "/",
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
    redirect: vi.fn(),
    getPathname: ({ href }: { href: Href }) => resolve(href),
  };
});

// Mock Supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
  getClient: vi.fn(() => mockSupabaseClient),
}));

// Create a mock Supabase client
const mockSupabaseClient = {
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    verifyOtp: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
        order: vi.fn(() => ({
          limit: vi.fn(),
        })),
      })),
      order: vi.fn(),
      or: vi.fn(),
      contains: vi.fn(),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(),
    })),
  })),
  rpc: vi.fn(),
};

export { mockSupabaseClient };
