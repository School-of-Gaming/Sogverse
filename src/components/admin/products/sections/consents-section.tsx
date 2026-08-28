"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CONSENT_DOCUMENTS,
  consentDocumentMeta,
} from "@/lib/constants/consent-documents";
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
 * **The checkboxes do not wait on the network.** Registry rows arrive by
 * migration and `CONSENT_DOCUMENTS` ships in the same deploy, so the slug, the
 * name and the link of every document this deploy can offer are known before
 * the page renders — and the rows are rendered from that map, immediately.
 * Deriving them from the query instead put two rows on screen a round trip
 * after first paint, which pushed the Listing section and the submit button
 * down the page on data's own schedule: exactly the shift the layout rule
 * forbids. The query is still made, and it still contributes the one thing the
 * bundle genuinely cannot know — which revision of each document is current
 * right now.
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
  const { data: documents } = useConsentDocuments();

  // Slug → current version, once the query lands. `undefined` for a slug means
  // "nothing to say about its version": either the read has not landed yet, or
  // the database has no such document at all. Both render the same — no caption
  // — because both are the absence of a fact rather than a fact worth stating.
  const versions =
    documents === undefined
      ? undefined
      : new Map(documents.map((doc) => [doc.slug, doc.currentVersion]));

  // The map's own order, which is the order the documents are meant to be read
  // in, followed by any slug the database knows and this deploy does not.
  //
  // **Appending the drift rows at the END is load-bearing, not cosmetic.** They
  // can only appear once the query resolves, and a late row inserted anywhere
  // but the end of the run moves every row after it — plus the Listing section
  // and the submit button below. At the end it grows into the slack the form
  // already has beneath the list and nothing painted moves. A later tidy-up
  // that sorts this list alphabetically would reintroduce the shift silently,
  // and would look like an improvement.
  const knownSlugs = Object.keys(CONSENT_DOCUMENTS);
  const driftSlugs = (documents ?? [])
    .map((doc) => doc.slug)
    .filter((slug) => consentDocumentMeta(slug) === null);

  return (
    <FormSection
      title={t("sections.consents")}
      description={t("sections.consentsDescription")}
    >
      <div className="space-y-2">
        {[...knownSlugs, ...driftSlugs].map((slug) => {
          const meta = consentDocumentMeta(slug);
          const checked = state.requiredConsentSlugs.has(slug);
          const version = versions?.get(slug);
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
                  setState({ ...state, requiredConsentSlugs: next });
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
                {/* The current version is the one thing here that has to come
                    from the database, so it lands a round trip after the row
                    does. `ml-auto` puts it at the trailing end of a row that
                    already has its final height, so its arrival grows leftward
                    into that row's own slack and nothing on screen moves. Its
                    position is therefore load-bearing: moved ahead of the name,
                    it would shove the name sideways when it appeared. */}
                {version !== undefined && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {version === null
                      ? t("consents.noVersion")
                      : t("consents.version", { version })}
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
