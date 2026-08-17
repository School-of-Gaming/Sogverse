/* eslint-disable i18next/no-literal-string -- design-mock phase: this body is
   still being judged as a layout, and its copy is deliberately literal English
   so the wording can be argued with in place. Every string here moves into
   `messages/` when the body is promoted onto `/admin`, which is the change that
   settles the wording; keys written now would be keys rewritten then, in five
   locales. */
import Link from "next/link";
import {
  Coins,
  Building2,
  UserRoundX,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRODUCT_ISSUE_KINDS,
  type ProductAttention,
  type ProductIssue,
  type ProductIssueKind,
} from "./admin-dashboard-data";
import { PRODUCT_TYPE_PRESENTATION } from "./product-type-presentation";

/**
 * The queue, one card per product.
 *
 * The hierarchy is the admin's own: **which product needs me → what in it → who
 * it concerns.** So a card is a product, its lines are that product's problems
 * in priority order, and a group or a person is named inside the line rather
 * than being the thing you have to find first. The earlier design inverted that
 * — ten category lists, one product's three problems scattered across three of
 * them — and every fix started with the admin reassembling a product from its
 * pieces.
 *
 * **Nothing folds.** There is no "show all", no cap and no collapsed remainder:
 * an admin who does not see a row does not do the work, and the goal of the
 * panel is an empty one. A queue long enough to be uncomfortable is a queue
 * telling the truth about the platform, and hiding its tail would only make the
 * page feel better than the platform is.
 *
 * The grid is why this section is now the full width of the page. Cards tile two
 * and three across on the viewports admins actually work at, which is what makes
 * "no truncated names, nothing folded" affordable — the same content in a
 * two-thirds column was a single tall stack.
 */

interface IssuePresentation {
  icon: LucideIcon;
  /**
   * `warning` for work, `muted` for a missing configuration value. A missing fee
   * is real and has to be fixed, but painting it the same colour as a child
   * nobody is teaching would flatten the ranking the card just spent its
   * ordering on.
   */
  tone: "warning" | "muted";
}

const ISSUE_PRESENTATION: Record<ProductIssueKind, IssuePresentation> = {
  "unassigned-gamers": { icon: UserRoundX, tone: "warning" },
  "group-without-gedu": { icon: UserX, tone: "warning" },
  "waitlist-open-seats": { icon: Users, tone: "warning" },
  "missing-gedu-fee": { icon: Coins, tone: "muted" },
  "missing-municipality-fee": { icon: Building2, tone: "muted" },
};

/** Rank of an issue kind — lower is worse. Drives both sorts on this page. */
function severityOf(kind: ProductIssueKind): number {
  return PRODUCT_ISSUE_KINDS.indexOf(kind);
}

/**
 * Worst problem first; then the product with more of them; then by name so the
 * order is stable between two products in identical trouble.
 */
function compareProducts(a: ProductAttention, b: ProductAttention): number {
  const worstA = Math.min(...a.issues.map((issue) => severityOf(issue.kind)));
  const worstB = Math.min(...b.issues.map((issue) => severityOf(issue.kind)));
  if (worstA !== worstB) return worstA - worstB;
  if (a.issues.length !== b.issues.length) return b.issues.length - a.issues.length;
  return a.name.localeCompare(b.name);
}

export function ProductAttentionGrid({
  products,
}: {
  products: readonly ProductAttention[];
}) {
  // Sorted here rather than trusted from the feed: the ranking is a property of
  // the design, so a shell handing the products over in a different order would
  // silently change what the page means.
  const ordered = [...products].sort(compareProducts);

  return (
    <section aria-label="Products needing attention" className="space-y-3">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        Products
        <span className="text-xs font-normal text-muted-foreground">
          {ordered.length}
        </span>
      </h3>
      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {ordered.map((product) => (
          <li key={product.productId}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductCard({ product }: { product: ProductAttention }) {
  const presentation = PRODUCT_TYPE_PRESENTATION[product.productType];
  const Icon = presentation.icon;
  const issues = [...product.issues].sort(
    (a, b) => severityOf(a.kind) - severityOf(b.kind),
  );

  return (
    <Link
      href={product.href}
      title={`${presentation.label} · ${product.name}`}
      className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/30 hover:bg-accent"
    >
      <span className="flex items-start gap-2">
        {/* The same tinted sidebar glyph the schedule chips and the key wear.
            The card used to carry a bare colour bar, which meant the one section
            an admin reads first was the one section whose colour nothing on the
            page explained. `mt-0.5` lines it up with the first line of a name
            that wraps to two. */}
        <Icon
          className={cn("mt-0.5 h-4 w-4 shrink-0", presentation.text)}
          aria-hidden
        />
        {/* Wraps rather than truncates. A product's name is how an admin knows
            which of five Minecraft clubs this is, so it is the last thing on the
            card that may be shortened — and since it may not be, the card grows
            instead. */}
        <span className="text-sm font-medium leading-snug">{product.name}</span>
      </span>

      <ul className="space-y-1">
        {issues.map((issue) => (
          <li key={issue.id}>
            <IssueLine issue={issue} />
          </li>
        ))}
      </ul>
    </Link>
  );
}

function IssueLine({ issue }: { issue: ProductIssue }) {
  const presentation = ISSUE_PRESENTATION[issue.kind];
  const Icon = presentation.icon;

  return (
    <span className="flex items-start gap-1.5 text-xs leading-snug">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          presentation.tone === "warning"
            ? "text-warning"
            : "text-muted-foreground",
        )}
        aria-hidden
      />
      <span
        className={
          presentation.tone === "warning"
            ? "text-foreground"
            : "text-muted-foreground"
        }
      >
        {issue.label}
      </span>
    </span>
  );
}
