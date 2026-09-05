/**
 * Question 3 — the greys.
 *
 * Two of Sogverse's greys are real values the library does not have: `muted`
 * #262626 and `accent` #212121, 241 uses between them. Everything else here is
 * a second name for a colour the library already ships, and the whole
 * `sidebar-*` set is deleted rather than renamed — the rail is chrome and
 * composes from the general neutrals like any other chrome.
 *
 * **The rename pairs are drawn twice on purpose.** The claim is that nothing
 * moves, and a claim like that is checked by eye or not at all: the same
 * construct, once naming today's token and once naming the proposed one, and
 * the two pictures are identical because the two values are.
 *
 * **The sidebar has one question left**, its ground, so it is drawn on the page
 * ground and on the card ground with everything else already taken from the
 * general tokens. Today's #171717 is kept small beside them as the picture to
 * judge the change against.
 *
 * **Accent measures barely above 1:1 against the card it lifts from**, which is
 * why the hover row is drawn on accent and then on muted rather than measured:
 * if the lift cannot be seen in the row, the number would not have helped.
 */

import { AppCard, AppField, AppMenu, AppPills, AppRow, AppSidebar, AppSkeleton, RENAMED, TODAY } from "./recipes";
import {
  CARD,
  Caps,
  Case,
  Compare,
  EDGE,
  Exemplar,
  GROUND,
  Panel,
  Question,
  Swatch,
} from "./parts";

const MUTED = "#262626";
const ACCENT = "#212121";
const SIDEBAR_TODAY = "#171717";

/**
 * The sidebar palette after the `sidebar-*` set is deleted: general neutrals
 * only. `sidebar-accent` held #262626, which is `muted`, so the hovered and
 * current items reach the same value by the general name.
 */
const SIDEBAR_NEUTRAL = { ...RENAMED, muted: MUTED };

/** A framed exemplar, on the card ground most of these constructs really sit on. */
function Framed({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: EDGE, backgroundColor: CARD }}
    >
      {children}
    </div>
  );
}

export function GreysSection() {
  return (
    <Question n={3} title="The greys">
      <Case title="The sidebar's ground">
        <div className="space-y-6">
          <Compare columns={2}>
            <Panel label="On the page ground — #121212">
              <Exemplar
                file="layout/sidebar.tsx"
                page="every admin and gedu page, through dashboard-layout.tsx"
              >
                <AppSidebar palette={SIDEBAR_NEUTRAL} ground={GROUND} />
              </Exemplar>
            </Panel>
            <Panel label="On the card ground — #1A1A1A">
              <Exemplar
                file="layout/sidebar.tsx"
                page="every admin and gedu page, through dashboard-layout.tsx"
              >
                <AppSidebar palette={SIDEBAR_NEUTRAL} ground={CARD} />
              </Exemplar>
            </Panel>
          </Compare>

          <div>
            <Caps>Today — #171717</Caps>
            <div className="mt-3 max-w-md">
              <Exemplar file="layout/sidebar.tsx" page="the rail on its own ground">
                <AppSidebar palette={TODAY} ground={SIDEBAR_TODAY} />
              </Exemplar>
            </div>
          </div>
        </div>
      </Case>

      <Case title="Muted">
        <Compare columns={2}>
          <Panel label="In use">
            <div className="space-y-6">
              <Exemplar
                file="admin/users/page.tsx"
                page="/admin/users, while the list loads"
              >
                <AppSkeleton palette={TODAY} />
              </Exemplar>
              <Exemplar
                file="admin/users/page.tsx"
                page="/admin/users, the role filter strip"
              >
                <Framed>
                  <AppPills palette={TODAY} />
                </Framed>
              </Exemplar>
            </div>
          </Panel>
          <Panel label="Proposed — admitted unchanged">
            <div className="grid gap-4 sm:grid-cols-2">
              <Swatch hex={MUTED} name="Muted" />
              <Swatch hex={ACCENT} name="Accent" />
            </div>
          </Panel>
        </Compare>
      </Case>

      <Case title="Accent, as a hover">
        <Compare columns={2}>
          <Panel label="Today — hover on accent">
            <Exemplar
              file="admin/users/[id]/page.tsx"
              page="/admin/users/[id], the assigned-products list"
            >
              <Framed>
                <div className="space-y-2">
                  <AppRow palette={TODAY} state="rest" />
                  <AppRow palette={TODAY} state="hover" />
                </div>
              </Framed>
            </Exemplar>
          </Panel>
          <Panel label="Alternative — hover on muted">
            <Exemplar
              file="admin/users/[id]/page.tsx"
              page="the same list, with the hover fill swapped"
            >
              <Framed>
                <div className="space-y-2">
                  <AppRow palette={TODAY} state="rest" />
                  <AppRow palette={{ ...TODAY, accent: MUTED }} state="hover" />
                </div>
              </Framed>
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="popover, popover-foreground → card, foreground">
        <Compare columns={2}>
          <Panel label="Today">
            <Exemplar
              file="ui/filter-dropdown.tsx"
              page="/admin/products, the club filter row"
            >
              <Framed>
                <AppMenu palette={TODAY} />
              </Framed>
            </Exemplar>
          </Panel>
          <Panel label="Proposed">
            <Exemplar
              file="ui/filter-dropdown.tsx"
              page="the same menu, naming card and foreground"
            >
              <Framed>
                <AppMenu palette={RENAMED} />
              </Framed>
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="input → border, ring → primary">
        <Compare columns={2}>
          <Panel label="Today">
            <Exemplar file="ui/input.tsx" page="/login, the email field">
              <Framed>
                <div className="space-y-5">
                  <AppField palette={TODAY} focused={false} empty={false} />
                  <AppField palette={TODAY} focused empty />
                </div>
              </Framed>
            </Exemplar>
          </Panel>
          <Panel label="Proposed">
            <Exemplar
              file="ui/input.tsx"
              page="the same fields, naming border and primary"
            >
              <Framed>
                <div className="space-y-5">
                  <AppField palette={RENAMED} focused={false} empty={false} />
                  <AppField palette={RENAMED} focused empty />
                </div>
              </Framed>
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="card-foreground, accent-foreground → foreground">
        <Compare columns={2}>
          <Panel label="Today">
            <Exemplar file="ui/card.tsx" page="every dashboard section">
              <AppCard palette={TODAY} />
            </Exemplar>
          </Panel>
          <Panel label="Proposed">
            <Exemplar
              file="ui/card.tsx"
              page="the same card, naming foreground"
            >
              <AppCard palette={RENAMED} />
            </Exemplar>
          </Panel>
        </Compare>
      </Case>
    </Question>
  );
}
