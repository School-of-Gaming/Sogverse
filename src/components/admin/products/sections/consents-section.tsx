"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { consentDocumentMeta } from "@/lib/constants/consent-documents";
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
 * The list is the registry itself: rows arrive by migration, so what is offered
 * is what is published, and there is nothing here to create or edit.
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

  return (
    <FormSection
      title={t("sections.consents")}
      description={t("sections.consentsDescription")}
    >
      {/* The registry is seeded by migration and is never empty in practice; the
          line exists so an empty read reads as an empty registry rather than as
          a section that failed to render. */}
      {documents !== undefined && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("consents.empty")}</p>
      )}
      <div className="space-y-2">
        {documents?.map((doc) => {
          const meta = consentDocumentMeta(doc.slug);
          const checked = state.requiredConsentSlugs.has(doc.slug);
          return (
            <label
              key={doc.slug}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-input hover:border-foreground/30",
              )}
            >
              <Checkbox
                className="mt-1"
                checked={checked}
                onChange={() => {
                  const next = new Set(state.requiredConsentSlugs);
                  if (next.has(doc.slug)) next.delete(doc.slug);
                  else next.add(doc.slug);
                  setState({ ...state, requiredConsentSlugs: next });
                }}
              />
              <div className="min-w-0 flex-1">
                {/* A slug this deploy cannot name shows the slug itself: loud
                    rather than broken, and it tells whoever sees it exactly
                    what to report. Registry rows arrive by migration and the
                    name map ships in the same deploy, so this can only be a
                    defect in the change that added the row. */}
                <div className="font-medium">
                  {meta === null ? doc.slug : tNames(meta.nameKey)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {doc.currentVersion === null
                    ? t("consents.noVersion")
                    : t("consents.version", { version: doc.currentVersion })}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </FormSection>
  );
}
