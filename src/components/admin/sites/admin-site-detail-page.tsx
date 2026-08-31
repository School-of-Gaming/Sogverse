"use client";

import { useId, useState } from "react";
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
 * **They are grouped by what they are, not by where they are stored.** The name
 * and the address are the site record and share one card with one Save, though
 * they sit in two tables behind two routes — a seam in the schema is not a
 * reason to ask an admin to save one building's details twice. The two notes
 * are a pair of paragraphs with two audiences, and keep the panel that says so.
 *
 * **That notes panel is the same one the product page renders**, not a copy of
 * it. They belong to the building rather than to any product running in it, so
 * a gedu prepping a session at this site and an admin on this page are looking
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
  const locale = useLocale();

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
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detailsHeading")}</CardTitle>
          </CardHeader>
          <CardContent>
            {notes === undefined ? (
              // The card writes the address as well as the name, so it cannot
              // be rendered off a read that failed: an empty box the admin did
              // not empty is an invitation to save the emptiness back.
              <p className="text-sm text-muted-foreground">
                {c("somethingWentWrong")}
              </p>
            ) : (
              <SiteDetailsFields
                siteId={siteId}
                name={site.name}
                address={notes.address}
              />
            )}
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
 * What a site is called and where it is — one card, one Save.
 *
 * **The two fields are stored in two tables and written by two routes, and none
 * of that is the admin's problem.** The name is a `locations` column behind the
 * location update route; the address hangs off `site_details` behind the
 * site-notes route. Splitting the UI along that seam — which is what this
 * replaced — asked somebody editing one building to notice that two of its
 * facts save separately, for a reason visible only in the schema.
 *
 * **Only the fields that changed are written.** A name save and an address save
 * are two requests, so sending both on every Save would put an untouched value
 * back over whatever somebody else changed in between; the site-notes route
 * leaves an absent field alone, which is what makes omitting the untouched half
 * safe rather than merely cheaper. If one write fails and the other lands, the
 * failed one stays dirty and the line under the fields says so: the succeeded
 * field re-seeds from its refetched value, so what is left highlighted is
 * exactly what still needs saving.
 *
 * `name` is the canonical, native-language column — not the localized display
 * name — because that is the value being written. A site carries no
 * `name_i18n` (nothing upstream models one, and nothing here authors
 * alternates), so on this row the two are the same string; using the stored one
 * is what keeps that a fact about the data rather than a coincidence the editor
 * depends on.
 */
function SiteDetailsFields({
  siteId,
  name,
  address,
}: {
  siteId: string;
  name: string;
  /** What is stored. `null` when nobody has filled one in. */
  address: string | null;
}) {
  const t = useTranslations("admin.sites");
  const c = useTranslations("common");
  const rename = useUpdateLocation();
  const updateNotes = useUpdateSiteNotes();

  const nameId = useId();
  const addressId = useId();

  const storedAddress = address ?? "";

  const [nameDraft, setNameDraft] = useState(name);
  const [addressDraft, setAddressDraft] = useState(storedAddress);
  const [error, setError] = useState<string | null>(null);
  /**
   * Flipped synchronously before the first mutation runs and cleared only once
   * both have settled, so no render between the click and the disabled state
   * can leave Save clickable and no gap between the two writes can re-enable
   * it. This editor stays on screen through a success, so the flag is cleared
   * on every outcome — one left set here would strand the button rather than
   * being tidied by an unmount.
   */
  const [committing, setCommitting] = useState(false);

  // Re-seed when a stored value changes underneath — a save landing, or a
  // refetch — with React's adjust-state-during-render pattern, so no frame of a
  // stale draft is ever painted. The two are tracked separately: re-seeding
  // both when one lands would wipe an edit the admin has not saved yet, which
  // is precisely the state a partial failure leaves them in.
  const [seededName, setSeededName] = useState(name);
  if (name !== seededName) {
    setSeededName(name);
    setNameDraft(name);
  }
  const [seededAddress, setSeededAddress] = useState(storedAddress);
  if (storedAddress !== seededAddress) {
    setSeededAddress(storedAddress);
    setAddressDraft(storedAddress);
  }

  const trimmedName = nameDraft.trim();
  const trimmedAddress = addressDraft.trim();
  // A name is required — a blank one is an edit in progress, not an intent —
  // where a blank address is a real value meaning "we do not have one".
  const nameDirty = trimmedName.length > 0 && trimmedName !== name;
  const addressDirty = trimmedAddress !== storedAddress;
  const dirty = nameDirty || addressDirty;

  async function save() {
    setError(null);
    setCommitting(true);
    let failed = false;

    if (nameDirty) {
      try {
        // Resolves only once the reads rendering this name have been refetched
        // — the mutation returns its invalidations — so Save stays disabled
        // until the header above has the name it just wrote.
        await rename.mutateAsync({ id: siteId, updates: { name: trimmedName } });
      } catch {
        failed = true;
      }
    }

    if (addressDirty) {
      try {
        await updateNotes.mutateAsync({
          location_id: siteId,
          member: { address: trimmedAddress },
        });
      } catch {
        failed = true;
      }
    }

    // The thrown messages are English server text written for a log, so one
    // translated line stands in for either, and the drafts stay where they are.
    if (failed) setError(t("saveFailed"));
    setCommitting(false);
  }

  return (
    <div className="space-y-4">
      <Field label={t("nameLabel")} htmlFor={nameId}>
        <Input
          id={nameId}
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          placeholder={t("namePlaceholder")}
          disabled={committing}
        />
      </Field>
      <Field label={t("addressLabel")} htmlFor={addressId} optional>
        <Input
          id={addressId}
          value={addressDraft}
          onChange={(event) => setAddressDraft(event.target.value)}
          placeholder={t("addressPlaceholder")}
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
 * The two standing notes, in the panel every other surface showing them
 * renders — and it renders here exactly as a gedu meets it, with the address
 * shown and no control to change it.
 *
 * **The address is edited in the details card above and nowhere else on this
 * page.** The panel's `addressEditor` slot exists for a surface whose *only*
 * reach into the site record is this section — the admin product page, where
 * the site is a fact about the group being worked on. This page is the site
 * record, so the field belongs beside the name in the card that owns it, and a
 * second control here would be two places to change one value.
 *
 * **The notes save omits the address and the address save omits the notes**,
 * and the route leaves an absent field alone rather than writing it null. That
 * is what stops one control from carrying the other's stale value back over a
 * correction somebody made a moment earlier.
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
