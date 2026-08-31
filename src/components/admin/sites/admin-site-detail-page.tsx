"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NavChevron } from "@/components/ui/nav-chevron";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import { ProductStatusChip } from "@/components/admin/products/product-status-chip";
import { SiteAddressField } from "@/components/admin/products/group-details/site-address-field";
import {
  SiteNotesPanel,
  type SiteNotesDraft,
} from "@/components/group-workspace/SiteNotesPanel";
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
 * One site, as the person who owns the platform's venue records works it: the
 * place it sits in, the products connected to it, and the four fields anybody
 * is allowed to change about it.
 *
 * **What this page deliberately cannot do is as much of its shape as what it
 * can.** A site is never created here — creation stays inside a product's site
 * picker, which is the flow that has somewhere to put it and a reason to name
 * it — and it is never re-parented or deleted: the tree's own `parent_id` is
 * `ON DELETE RESTRICT`, `authenticated` holds no DELETE on `locations` at all,
 * and re-parenting a row leaves nothing to fix here that the picker did not
 * already get right. So the editors are exactly four: the name, the street
 * address, the note families read and the note only staff do.
 *
 * **The two notes are the same panel the product page renders**, not a copy of
 * it. They belong to the building rather than to any product running in it, so
 * a gedu prepping a session at this venue and an admin on this page are looking
 * at one pair of paragraphs; a second editor with its own copy would be a
 * second way to say the same thing, free to drift.
 */
export function AdminSiteDetailPage({ siteId }: { siteId: string }) {
  const t = useTranslations("admin.sites");
  const locale = useLocale();

  // The keyed read answers the row *and* its chain in one request, which is
  // both halves of this page's header. A key with no row is a resolved answer
  // (no such site), never "not fetched yet" — that distinction is what lets the
  // guard below tell a bad id from a read still in flight.
  const keyed = useLocationsByIds([siteId]);
  const site = keyed.data?.[0];
  const isSite = site?.type === "site";

  const notes = useSiteNotes(isSite ? siteId : null);
  const products = useProductsAtSite(isSite ? siteId : null);

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
  const locale = useLocale();

  if (pending) return null;
  if (failed) return <Notice>{c("somethingWentWrong")}</Notice>;
  if (site === undefined) return <Notice>{t("notFound")}</Notice>;
  // A location that is not a venue — a municipality id typed into the URL, or a
  // stored pick that was never a site. It resolves perfectly well; it simply
  // has no editors here, and saying so is better than showing the wrong ones.
  if (!isSite) return <Notice>{t("notASite")}</Notice>;
  if (notes === undefined && !notesFailed) return null;
  if (products === undefined && !productsFailed) return null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detailsHeading")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SiteNameField siteId={siteId} name={site.name} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {notes === undefined ? (
              // The read failed, so the panel is not rendered at all. Showing it
              // with empty fields would invite a save that blanks two paragraphs
              // somebody wrote — the panel sends both notes, and it would be
              // sending the emptiness this page invented.
              <p className="text-sm text-muted-foreground">
                {c("somethingWentWrong")}
              </p>
            ) : (
              <SiteNotesEditor
                siteId={siteId}
                siteName={localizedLocationName(site, locale)}
                notes={notes}
              />
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
 * The rename.
 *
 * `name` is the canonical, native-language column — not the localized display
 * name — because that is the value being written. A site carries no
 * `name_i18n` (nothing upstream models one, and nothing here authors
 * alternates), so on this row the two are the same string; using the stored one
 * is what keeps that a fact about the data rather than a coincidence the editor
 * depends on.
 */
function SiteNameField({ siteId, name }: { siteId: string; name: string }) {
  const t = useTranslations("admin.sites");
  const c = useTranslations("common");
  const update = useUpdateLocation();

  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  /**
   * Flipped synchronously before the mutation runs, so no render between the
   * click and the disabled state can leave Save clickable. This editor stays on
   * screen through a success, so it is cleared on both outcomes — a flag left
   * set here would strand the button rather than being tidied by an unmount.
   */
  const [committing, setCommitting] = useState(false);

  // Re-seed when the stored name changes underneath — a save landing, or a
  // refetch — with React's adjust-state-during-render pattern, so no frame of
  // the stale draft is ever painted.
  const [seeded, setSeeded] = useState(name);
  if (name !== seeded) {
    setSeeded(name);
    setDraft(name);
    setError(null);
  }

  const trimmed = draft.trim();
  const dirty = trimmed.length > 0 && trimmed !== name;

  async function save() {
    setError(null);
    setCommitting(true);
    try {
      await update.mutateAsync({ id: siteId, updates: { name: trimmed } });
    } catch {
      // The thrown message is English server text written for a log, so one
      // translated line stands in for it and the draft stays where it is.
      setError(t("renameFailed"));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label={t("nameLabel")} htmlFor="site-name">
        <Input
          id="site-name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("namePlaceholder")}
          disabled={committing}
        />
      </Field>
      {error !== null && (
        <p role="alert" className="text-right text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || committing}
          onClick={() => void save()}
          className="gap-1.5"
        >
          {committing && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          )}
          {c("save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The address and the two standing notes, in the panel every other surface
 * showing them renders.
 *
 * **The notes save omits the address and the address save omits the notes**,
 * and the route leaves an absent field alone rather than writing it null. That
 * is what stops one control from carrying the other's stale value back over a
 * correction somebody made a moment earlier — the same split the product page
 * makes, for the same reason.
 */
function SiteNotesEditor({
  siteId,
  siteName,
  notes,
}: {
  siteId: string;
  siteName: string;
  notes: SiteNotes;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateSiteNotes();

  const handleSave = async (draft: SiteNotesDraft) => {
    await update.mutateAsync({
      location_id: siteId,
      member: { notes: draft.publicNote },
      staff: { notes: draft.staffNote },
    });
  };

  return (
    <SiteNotesPanel
      siteName={siteName}
      address={notes.address}
      publicNote={notes.memberNote}
      staffNote={notes.staffNote}
      editing={editing}
      onEditingChange={setEditing}
      onSave={handleSave}
      addressEditor={
        <SiteAddressField locationId={siteId} address={notes.address} />
      }
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
