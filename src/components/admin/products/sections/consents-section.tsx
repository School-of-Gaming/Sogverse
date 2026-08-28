"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CONSENT_DOCUMENTS,
  CONSENT_DOCUMENT_BUNDLES,
  consentDocumentMeta,
  isBundledConsentSlug,
} from "@/lib/constants/consent-documents";
import {
  ATTACHABLE_MARKETING_CONSENT_TYPES,
  MARKETING_CONSENT_ASKS,
} from "@/lib/constants/marketing-consents";
import { useConsentDocuments } from "@/services/products";
import { FormSection } from "../form-primitives";
import type { FormState } from "../product-form-state";

/**
 * **The enrolment conditions: which published documents a parent must agree to
 * before they can take a seat on this product.**
 *
 * Its own section rather than a field inside another, because it is a third
 * question none of the existing sections asks: Audience says who may hold a
 * seat, Registration timing says when the door opens, and this says what a
 * parent has to agree to on the way through it. It sits directly after
 * Registration timing and before Listing — the two of them together are the
 * signup act, in the order a parent meets them.
 *
 * **Offered on every product type**, with no `product-type-config` flag gating
 * it. The database has no per-type rule here — any product may point at any
 * published document — and a flag would be inventing one in the UI that nothing
 * else knows about. Empty is the ordinary state, so the section reads as "no,
 * none" on the overwhelming majority of products, which is exactly what it
 * should say.
 *
 * **One row per bundle, not per document.** A programme's terms and its privacy
 * policy are published together and a product requiring one without the other
 * is a state nobody wants, so the pair is offered as a single choice and the
 * toggle writes or clears every slug in it. The stored shape is unchanged — the
 * form still hands the RPC individual slugs — so this removes a choice the
 * product owner never had rather than a distinction the record needs. The
 * bundled documents are named in the row's caption, because "which documents am
 * I attaching" is exactly the question a one-line label would stop answering.
 *
 * **The rows do not wait on the network.** Registry rows arrive by migration and
 * `CONSENT_DOCUMENTS` ships in the same deploy, so the slug, the name and the
 * link of every document this deploy can offer are known before the page
 * renders — and the rows are rendered from that map, immediately. Deriving them
 * from the query instead put rows on screen a round trip after first paint,
 * which pushed the Listing section and the submit button down the page on
 * data's own schedule: exactly the shift the layout rule forbids. The query is
 * still made, and it still contributes the one thing the bundle genuinely
 * cannot know — which revision of each document is current right now.
 */
export function ConsentsSection({
  state,
  setState,
}: {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const t = useTranslations("admin.products");
  const tNames = useTranslations("consentDocuments.names");
  const tBundles = useTranslations("consentDocuments.bundles");
  const { data: documents } = useConsentDocuments();

  // Slug → current version, once the query lands. `undefined` for a slug means
  // "nothing to say about its version": either the read has not landed yet, or
  // the database has no such document at all. Both render the same — no caption
  // — because both are the absence of a fact rather than a fact worth stating.
  const versions =
    documents === undefined
      ? undefined
      : new Map(documents.map((doc) => [doc.slug, doc.currentVersion]));

  const versionLabel = (slug: string): string | null => {
    const version = versions?.get(slug);
    if (version === undefined) return null;
    return version === null
      ? t("consents.noVersion")
      : t("consents.version", { version });
  };

  // Every document this deploy can name that no bundle already offers. Empty
  // today and rendered anyway, because the map is what decides — a document
  // added outside a bundle must get a row without anyone remembering to add
  // one.
  const looseSlugs = Object.keys(CONSENT_DOCUMENTS).filter(
    (slug) => !isBundledConsentSlug(slug),
  );

  // Slugs the database knows and this deploy does not.
  //
  // **Appending the drift rows at the END is load-bearing, not cosmetic.** They
  // can only appear once the query resolves, and a late row inserted anywhere
  // but the end of the run moves every row after it — plus the Listing section
  // and the submit button below. At the end it grows into the slack the form
  // already has beneath the list and nothing painted moves. A later tidy-up
  // that sorts this list alphabetically would reintroduce the shift silently,
  // and would look like an improvement.
  const driftSlugs = (documents ?? [])
    .map((doc) => doc.slug)
    .filter((slug) => consentDocumentMeta(slug) === null);

  const setSlugs = (next: Set<string>) =>
    setState({ ...state, requiredConsentSlugs: next });

  return (
    <FormSection
      title={t("sections.consents")}
      description={t("sections.consentsDescription")}
    >
      <div className="space-y-2">
        {CONSENT_DOCUMENT_BUNDLES.map((bundle) => {
          // **Ticked when the product requires ANY of the bundle, not only all
          // of it.** A stored half-bundle should be impossible — this form is
          // the only writer and it writes all-or-nothing — but it can predate
          // the bundle or arrive by hand, and it has to render as something.
          // "Any" is the honest reading of the row's own question, which is
          // whether this product requires the programme's documents: a product
          // holding one of them does. It is also the only reading that heals
          // safely, because the next save from this screen writes the whole
          // bundle rather than dropping the half that was stored. Unticking is
          // still the way to remove them, and it removes all of them.
          const checked = bundle.slugs.some((slug) =>
            state.requiredConsentSlugs.has(slug),
          );
          return (
            <label
              key={bundle.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-foreground/30",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={checked}
                onChange={() => {
                  const next = new Set(state.requiredConsentSlugs);
                  // All or nothing, in both directions — which is what makes a
                  // half-bundle unreachable from this screen and heals one that
                  // somehow already exists.
                  for (const slug of bundle.slugs) {
                    if (checked) next.delete(slug);
                    else next.add(slug);
                  }
                  setSlugs(next);
                }}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <span className="block truncate font-medium">
                  {tBundles(bundle.labelKey)}
                </span>
                {/* What is actually being attached. One line per document, all
                    of them known at first paint, so this caption's height is
                    settled before the query lands; only the versions arrive
                    late, and they arrive at the trailing end of a line that
                    already has its final height. Moved ahead of the name, a
                    version would shove the name sideways when it appeared. */}
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {bundle.slugs.map((slug) => {
                    const meta = consentDocumentMeta(slug);
                    const label = versionLabel(slug);
                    return (
                      <li key={slug} className="flex items-baseline gap-3">
                        <span className="truncate">
                          {meta === null ? slug : tNames(meta.nameKey)}
                        </span>
                        {label !== null && (
                          <span className="ml-auto shrink-0">{label}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </label>
          );
        })}
        {[...looseSlugs, ...driftSlugs].map((slug) => {
          const meta = consentDocumentMeta(slug);
          const checked = state.requiredConsentSlugs.has(slug);
          const label = versionLabel(slug);
          return (
            <label
              key={slug}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-foreground/30",
              )}
            >
              <Checkbox
                checked={checked}
                onChange={() => {
                  const next = new Set(state.requiredConsentSlugs);
                  if (next.has(slug)) next.delete(slug);
                  else next.add(slug);
                  setSlugs(next);
                }}
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-3">
                {/* A slug this deploy cannot name shows the slug itself: loud
                    rather than broken, and it tells whoever sees it exactly
                    what to report. Registry rows arrive by migration and the
                    name map ships in the same deploy, so this can only be a
                    defect in the change that added the row. */}
                <span className="truncate font-medium">
                  {meta === null ? slug : tNames(meta.nameKey)}
                </span>
                {label !== null && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {label}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </FormSection>
  );
}

/**
 * **The optional marketing asks: which partners' mailing lists this product's
 * signup panel offers a parent, on the way past.**
 *
 * Its own section beside the required one, not a group inside it, and the
 * separation is the whole point. The section above holds *conditions*: a parent
 * who declines cannot enrol, the agreement is per seat, and it can never be
 * withdrawn. This holds *questions*: declining is a complete answer, the seat is
 * unaffected, the consent is account-level, and the parent can switch it off in
 * settings that evening. Two headings is how an admin sees which of those they
 * are turning on — a shared heading reading "Consents" would make the most
 * consequential distinction on this page a matter of reading captions.
 *
 * **Offered on every product type**, like the required section and for the same
 * reason: the database has no per-type rule here, and a `product-type-config`
 * flag would be inventing one the rest of the app does not know about.
 *
 * **`school_of_gaming` is deliberately not on this list**, which is why the
 * rows come from `ATTACHABLE_MARKETING_CONSENT_TYPES` rather than from the enum.
 * Our own mailing list is asked for at registration, on the account that holds
 * the answer; attaching it to a product would ask an account-level question a
 * second time with nothing new to say.
 *
 * **The rows do not wait on the network**, and here there is not even a query to
 * wait on: what a marketing consent is and who it names ships in the bundle, so
 * every row is on screen at first paint and nothing below it can be pushed down
 * later.
 */
export function MarketingConsentsSection({
  state,
  setState,
}: {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const t = useTranslations("admin.products");
  const tMarketing = useTranslations("admin.products.consents.marketing");

  return (
    <FormSection
      title={t("sections.marketingConsents")}
      description={t("sections.marketingConsentsDescription")}
    >
      <div className="space-y-2">
        {ATTACHABLE_MARKETING_CONSENT_TYPES.map((type) => {
          const checked = state.marketingConsentTypes.has(type);
          const { sentenceKey } = MARKETING_CONSENT_ASKS[type];
          return (
            <label
              key={type}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-foreground/30",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={checked}
                onChange={() => {
                  const next = new Set(state.marketingConsentTypes);
                  if (checked) next.delete(type);
                  else next.add(type);
                  setState({ ...state, marketingConsentTypes: next });
                }}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <span className="block truncate font-medium">
                  {tMarketing(`${sentenceKey}.label`)}
                </span>
                {/* What the parent will actually be asked, in one line — the
                    question an admin is turning on is the thing they need to
                    read, and a partner's name alone does not say it. */}
                <p className="text-xs text-muted-foreground">
                  {tMarketing(`${sentenceKey}.description`)}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </FormSection>
  );
}
