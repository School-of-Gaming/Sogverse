"use client";

import { useTranslations } from "next-intl";
import { CheckboxRow } from "@/components/ui/checkbox-row";
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
 * **What a parent meets on the way through this product's signup: the documents
 * they must agree to, and the marketing they are asked about.**
 *
 * Its own section rather than a field inside another, because it is a third
 * question none of the existing sections asks: Audience says who may hold a
 * seat, Registration timing says when the door opens, and this says what a
 * parent has to agree to — and what they are offered — on the way through it. It
 * sits directly after Registration timing and before Listing; the two of them
 * together are the signup act, in the order a parent meets them.
 *
 * **One section, not two, and what each row SAYS is why.** The conditions and
 * the asks were two headed sections for a while, on the reasoning that a
 * condition and a question are what an admin most needs to be unable to confuse.
 * The rows are now the shared `CheckboxRow`, which wears one bordered shape
 * everywhere — the border marks the click target, not the stakes — so telling
 * the two apart fell to the marketing rows' own caption, which states that
 * ticking one adds an optional question a parent may decline. A required row
 * needs no such line, because in a list of enrolment conditions a condition is
 * the ordinary thing to find and the ask is the exception. With the exception
 * described on the row itself, a second heading was repeating in a title what
 * the row already says, and separating rows that an admin reads as one list:
 * everything this product will put in front of a parent, in the order they will
 * meet it.
 *
 * The difference itself has not softened. A required row is a *condition*: a
 * parent who declines cannot enrol, the agreement is per seat, and it can never
 * be withdrawn. A marketing row is a *question*: declining is a complete
 * answer, the seat is unaffected, the consent is account-level, and the parent
 * can switch it off in settings that evening. That is what a marketing row's
 * caption says in words.
 *
 * **Offered on every product type**, with no `product-type-config` flag gating
 * it. The database has no per-type rule here — any product may point at any
 * published document, and any product may carry any attachable ask — and a flag
 * would be inventing one in the UI that nothing else knows about. Empty is the
 * ordinary state for the required half, so it reads as "no, none" on the
 * overwhelming majority of products, which is exactly what it should say.
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
 * **`school_of_gaming` is deliberately not among the marketing rows**, which is
 * why they come from `ATTACHABLE_MARKETING_CONSENT_TYPES` rather than from the
 * enum. Our own mailing list is asked for at registration, on the account that
 * holds the answer; attaching it to a product would ask an account-level
 * question a second time with nothing new to say.
 *
 * **The rows do not wait on the network.** Registry rows arrive by migration and
 * `CONSENT_DOCUMENTS` ships in the same deploy, so the slug, the name and the
 * link of every document this deploy can offer are known before the page
 * renders — and the rows are rendered from that map, immediately. Deriving them
 * from the query instead put rows on screen a round trip after first paint,
 * which pushed the Listing section and the submit button down the page on
 * data's own schedule: exactly the shift the layout rule forbids. The query is
 * still made, and it still contributes the one thing the bundle genuinely
 * cannot know — which revision of each document is current right now. The
 * marketing rows have no query behind them at all: what a marketing consent is
 * and who it names ships in the bundle.
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
  const tMarketing = useTranslations("admin.products.consents.marketing");
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
  // **These are the only rows in the section that can arrive after first paint,
  // which is why they are rendered LAST — after the marketing rows, not before
  // them.** Everything else here is known from the bundle: the document
  // registry and the marketing asks both ship in the deploy, so their rows are
  // on screen in the first frame. A drift row appears a round trip later, and a
  // late row inserted anywhere but the very end of the section pushes every row
  // after it down — which, when the marketing rows sat below the required run,
  // meant an admin's cursor moving off an optional-ask checkbox on the
  // database's schedule. Rendered last it grows into the slack the form already
  // has beneath the list, and nothing painted moves.
  //
  // So the section's order is: bundles, loose documents, marketing asks, drift.
  // The first three are the reading order an admin wants — conditions, then
  // questions — and the fourth is placed by this rule rather than by that one.
  // A later tidy-up that groups the drift rows back with the other required
  // rows, or sorts this list alphabetically, reintroduces the shift silently and
  // will look like an improvement.
  const driftSlugs = (documents ?? [])
    .map((doc) => doc.slug)
    .filter((slug) => consentDocumentMeta(slug) === null);

  const setSlugs = (next: Set<string>) =>
    setState({ ...state, requiredConsentSlugs: next });

  /**
   * One document offered on its own — a loose slug, or a drift row.
   *
   * A function rather than a component so the two runs render identical rows
   * from one definition while standing in different places in the section: they
   * are the same control and must not be told apart, but only one of them can
   * arrive late, and that is what decides where each goes.
   */
  const documentRow = (slug: string) => {
    const meta = consentDocumentMeta(slug);
    const checked = state.requiredConsentSlugs.has(slug);
    const label = versionLabel(slug);
    return (
      <CheckboxRow
        key={slug}
        checked={checked}
        onCheckedChange={() => {
          const next = new Set(state.requiredConsentSlugs);
          if (next.has(slug)) next.delete(slug);
          else next.add(slug);
          setSlugs(next);
        }}
        label={
          <span className="flex min-w-0 items-baseline gap-3">
            {/* A slug this deploy cannot name shows the slug itself: loud
                rather than broken, and it tells whoever sees it exactly what to
                report. Registry rows arrive by migration and the name map ships
                in the same deploy, so this can only be a defect in the change
                that added the row. */}
            <span className="truncate font-medium">
              {meta === null ? slug : tNames(meta.nameKey)}
            </span>
            {label !== null && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {label}
              </span>
            )}
          </span>
        }
      />
    );
  };

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
            <CheckboxRow
              key={bundle.id}
              checked={checked}
              onCheckedChange={() => {
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
              label={
                <>
                  <span className="block truncate font-medium">
                    {tBundles(bundle.labelKey)}
                  </span>
                  {/* What is actually being attached. One line per document,
                      all of them known at first paint, so this caption's height
                      is settled before the query lands; only the versions
                      arrive late, and they arrive at the trailing end of a line
                      that already has its final height. Moved ahead of the
                      name, a version would shove the name sideways when it
                      appeared. */}
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
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
                </>
              }
            />
          );
        })}
        {looseSlugs.map(documentRow)}
        {/* The optional asks, after every document this deploy can name and
            before the drift run below. Same list, same control, same border —
            the caption under each name is what says a parent may decline these
            and cannot decline the rows above. It stays in the ordinary muted
            description styling rather than borrowing the parent-facing rows'
            info tone: this is an admin reading a form they are filling in, not
            a family being asked to consent to something, and the sentence
            already says what ticking it does. */}
        {ATTACHABLE_MARKETING_CONSENT_TYPES.map((type) => {
          const checked = state.marketingConsentTypes.has(type);
          const { sentenceKey } = MARKETING_CONSENT_ASKS[type];
          return (
            <CheckboxRow
              key={type}
              checked={checked}
              onCheckedChange={() => {
                const next = new Set(state.marketingConsentTypes);
                if (checked) next.delete(type);
                else next.add(type);
                setState({ ...state, marketingConsentTypes: next });
              }}
              label={
                <>
                  <span className="block truncate font-medium">
                    {tMarketing(`${sentenceKey}.label`)}
                  </span>
                  {/* What ticking this actually does, in one line — the admin
                      is turning on a question, not a requirement, and the
                      partner's name alone does not say that. */}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {tMarketing(`${sentenceKey}.description`)}
                  </span>
                </>
              }
            />
          );
        })}
        {/* Last in the section, and see `driftSlugs` above for why: these are
            the only rows here that can arrive after the page has painted. */}
        {driftSlugs.map(documentRow)}
      </div>
    </FormSection>
  );
}
