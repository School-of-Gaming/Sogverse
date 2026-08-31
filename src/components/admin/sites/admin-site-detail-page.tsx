"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import { ProductStatusChip } from "@/components/admin/products/product-status-chip";
import {
  SitePanel,
  type SiteNotesDraft,
} from "@/components/group-workspace/SitePanel";
import { createSiteDetailsSave } from "@/components/group-workspace/site-details-save";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  useLocationsByIds,
  useUpdateLocation,
  type LocationWithChain,
} from "@/services/locations";
import { useUpdateSiteNotes } from "@/services/products";
import {
  useProductsAtSite,
  useSiteNotes,
  type SiteNotes,
  type SiteProductRow,
} from "@/services/sites";
import { sitePlacePath } from "./site-place-path";

/**
 * How many times each of this page's three reads is retried before it gives up.
 *
 * React Query's default of three, with backoff, is roughly seven seconds — and
 * this page's body renders *nothing at all* until every read has settled, so
 * every one of those seconds is a blank page under a URL the admin can see they
 * opened. Worse, a malformed uuid in the path is a 400 that will never succeed
 * and gets retried anyway. One retry covers the flaky hop these reads actually
 * meet and reaches the notice fast enough that the page stops looking broken.
 *
 * The same budget the public municipality directory's index arm sets, for the
 * same reason: how long a failure may take is decided by what the call site
 * renders while it waits, so it is decided here rather than in the hooks.
 */
const DETAIL_RETRIES = 1;

/**
 * One site, as the person who owns the platform's site records works it: the
 * place it sits in, the products connected to it, and the four fields anybody
 * is allowed to change about it.
 *
 * **What this page deliberately cannot do is as much of its shape as what it
 * can.** A site is never created here — creation is the site picker dialog,
 * wherever it is opened from, because naming a building means first saying which
 * municipality it stands in — and a site is never re-parented or deleted: the
 * tree's own `parent_id` is `ON DELETE RESTRICT`, `authenticated` holds no
 * DELETE on `locations` at all, and re-parenting a row leaves nothing to fix
 * here that the picker did not already get right. So the editable fields are
 * exactly four: the name, the street address, the note families read and the
 * note only staff do.
 *
 * **All four sit in one panel behind one Save**, though they are stored in two
 * tables and written by two routes — a seam in the schema is not a reason to
 * ask an admin to save one building twice. This page carried them in two cards
 * before, and the split showed: the address was editable in the details card
 * *and* printed again a card below, so one value appeared twice on one screen
 * with only one of them writable.
 *
 * **That panel is the same one the group workspace renders**, not a copy of it.
 * A site belongs to the building rather than to any product running in it, so a
 * gedu prepping a session there and an admin on this page are looking at one
 * set of fields; a second editor with its own copy and its own layout would be
 * a second way to say the same thing, free to drift. What this page adds is
 * only that its viewer owns the site record, which it says by supplying the
 * details save — never by the panel asking who is looking.
 */
export function AdminSiteDetailPage({ siteId }: { siteId: string }) {
  const t = useTranslations("admin.sites");
  const locale = useLocale();

  // The keyed read answers the row *and* its chain in one request, which is
  // both halves of this page's header. A key with no row is a resolved answer
  // (no such site), never "not fetched yet" — that distinction is what lets the
  // guard below tell a bad id from a read still in flight.
  const keyed = useLocationsByIds([siteId], { retry: DETAIL_RETRIES });
  const site = keyed.data?.[0];
  const isSite = site?.type === "site";

  // All three fly at once rather than waiting on the keyed read to say this id
  // is a site. Gating them bought nothing — an id that turns out not to be one
  // answers with three empty fields and no products, which the guard below
  // discards anyway — and cost a second round trip on every visit that *is* a
  // site, which is every real one.
  const notes = useSiteNotes(siteId, { retry: DETAIL_RETRIES });
  const products = useProductsAtSite(siteId, { retry: DETAIL_RETRIES });

  const path = site ? sitePlacePath(site.ancestors, locale) : "";
  const name = site ? localizedLocationName(site, locale) : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-reserve-scroll-gutter>
      {/* Hardcoded destination and translated copy with nothing to wait for, so
          it is readable and clickable from the first frame and lands on the
          pixel it will still be on once every read has settled. */}
      <Link
        href={ROUTES.admin.sites}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToSites")}
      </Link>

      {/* Both lines keep their final height from the first frame and fill in —
          a single line of text each, so reserving the height is exact rather
          than a guess, and nothing below them moves when the row lands. */}
      <div className="space-y-1">
        <p className="min-h-5 truncate text-sm text-muted-foreground">{path}</p>
        <h1 className="min-h-9 text-3xl font-bold">{name}</h1>
      </div>

      <SiteBody
        siteId={siteId}
        site={site}
        // `isPending` rather than "no data": an unresolved read must never be
        // read as an answer, which is exactly what would turn one slow frame
        // into "there is no such site".
        pending={keyed.isPending}
        failed={keyed.isError}
        isSite={isSite}
        notes={notes.isPending ? undefined : notes.data}
        notesFailed={notes.isError}
        products={products.isPending ? undefined : products.data}
        productsFailed={products.isError}
      />
    </div>
  );
}

/**
 * Everything under the header, and the one place this page decides what it is
 * looking at.
 *
 * **The whole body waits for every read rather than filling in section by
 * section.** All of them are small indexed lookups that land in a frame or two,
 * so there is no skeleton and no spinner — but on a narrow viewport the columns
 * stack, and a section that arrived late would push the one under it down the
 * page on data's own schedule. Waiting makes the body one insertion beneath a
 * header that never moves.
 */
function SiteBody({
  siteId,
  site,
  pending,
  failed,
  isSite,
  notes,
  notesFailed,
  products,
  productsFailed,
}: {
  siteId: string;
  site: LocationWithChain | undefined;
  pending: boolean;
  failed: boolean;
  isSite: boolean;
  /** `undefined` while the read is in flight, and after a failed one. */
  notes: SiteNotes | undefined;
  notesFailed: boolean;
  products: SiteProductRow[] | undefined;
  productsFailed: boolean;
}) {
  const t = useTranslations("admin.sites");
  const c = useTranslations("common");

  if (pending) return null;
  if (failed) return <Notice>{c("somethingWentWrong")}</Notice>;
  if (site === undefined) return <Notice>{t("notFound")}</Notice>;
  // A location that is not a site — a municipality id typed into the URL, or a
  // stored pick that was never a site. It resolves perfectly well; it simply
  // has no editors here, and saying so is better than showing the wrong ones.
  if (!isSite) return <Notice>{t("notASite")}</Notice>;
  if (notes === undefined && !notesFailed) return null;
  if (products === undefined && !productsFailed) return null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <Card>
          <CardContent className="pt-6">
            {notes === undefined ? (
              // The read failed, so the panel is not rendered at all. Showing it
              // with empty fields would invite a save that blanks an address and
              // two paragraphs somebody wrote — the panel sends what its editor
              // holds, and it would be sending the emptiness this page invented.
              <p className="text-sm text-muted-foreground">
                {c("somethingWentWrong")}
              </p>
            ) : (
              <SiteEditor siteId={siteId} name={site.name} notes={notes} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">{t("productsHeading")}</CardTitle>
        </CardHeader>
        <CardContent>
          {products === undefined ? (
            <p className="text-sm text-muted-foreground">
              {c("somethingWentWrong")}
            </p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noProducts")}</p>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <ConnectedProductRow key={product.id} product={product} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * The whole of the site, in the panel every staff surface showing one renders —
 * name, address and both notes, behind one pencil and one Save.
 *
 * **What this page adds to that panel is the details save, and nothing else.**
 * Supplying it is how a surface says "my viewer owns this record"; the panel
 * turns it into two more fields inside the editor it already had. The gedu
 * workspace rendering the same panel supplies no such thing and gets the same
 * four fields with two of them read-only. There is no variant, no role flag and
 * no second layout — which is exactly what stops this page and that one from
 * drifting into two different ways to edit one building.
 *
 * **The two saves stay separate because their writes are.** The notes travel on
 * one RPC that takes no name and no address; the details travel on two other
 * routes. Each leaves a field it was not given alone, which is what stops one
 * of them from carrying the other's stale value back over a correction somebody
 * made a moment earlier.
 *
 * `name` is the canonical, native-language column — not the localized display
 * name — because that is the value being written. A site carries no
 * `name_i18n` (nothing upstream models one, and nothing here authors
 * alternates), so on this row the two are the same string; using the stored one
 * is what keeps that a fact about the data rather than a coincidence the editor
 * depends on.
 */
function SiteEditor({
  siteId,
  name,
  notes,
}: {
  siteId: string;
  name: string;
  notes: SiteNotes;
}) {
  const [editing, setEditing] = useState(false);
  const updateNotes = useUpdateSiteNotes();
  const rename = useUpdateLocation();

  const handleSaveNotes = async (draft: SiteNotesDraft) => {
    await updateNotes.mutateAsync({
      location_id: siteId,
      member: { notes: draft.publicNote },
      staff: { notes: draft.staffNote },
    });
  };

  /**
   * **This is the only page that binds the details save**, and the module it
   * comes from is where the rules live: which route each field travels on, and
   * what a half-failed save leaves behind. Two product-scoped surfaces used to
   * bind it as well and no longer may — a site's name and address are the
   * building's, and a page scoped to one product renames it for all of them
   * while looking like it changed one. They link here instead, which is why this
   * page is worth being the single editor rather than a duplicate of one.
   */
  const handleSaveDetails = createSiteDetailsSave({
    locationId: siteId,
    rename,
    updateAddress: updateNotes,
  });

  return (
    <SitePanel
      siteName={name}
      address={notes.address}
      publicNote={notes.memberNote}
      staffNote={notes.staffNote}
      editing={editing}
      onEditingChange={setEditing}
      onSaveNotes={handleSaveNotes}
      onSaveDetails={handleSaveDetails}
    />
  );
}

/**
 * One product connected to this site, linking to its own admin page.
 *
 * The chip carries the **stored** status rather than the effective one. This
 * page is a reference list, not a lifecycle surface: deriving "expired" needs
 * the product's dates, its timezone and its live sign-up count, none of which
 * this read carries and all of which the product's own page already resolves.
 */
function ConnectedProductRow({ product }: { product: SiteProductRow }) {
  const p = useTranslations("admin.products");
  const locale = useLocale();

  const config = PRODUCT_TYPE_CONFIG[product.product_type];
  // Every product is guaranteed at least one translation, so the fallback is
  // for a name that is present and blank rather than for a missing row.
  const name =
    resolveTranslation(
      product.product_translations,
      resolveLocale(locale),
    )?.name.trim() || p("list.untitled");

  return (
    <Link
      href={ROUTES.admin.product(product.product_type, product.id)}
      className="group flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {p(`types.${config.i18nKey}.label`)}
          {!product.is_visible && ` · ${p("list.unlisted")}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ProductStatusChip status={product.status} />
        <NavChevron size="sm" />
      </div>
    </Link>
  );
}
