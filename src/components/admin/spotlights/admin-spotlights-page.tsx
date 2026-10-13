"use client";

import { useState } from "react";
import { Clock, Languages, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FramedImage } from "@/components/ui/framed-image";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn, formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  spotlightWriteFailure,
  type AdminSpotlight,
} from "@/services/spotlights";

/** The write the list makes. It resolves once the list has been read again, and throws on refusal. */
export interface AdminSpotlightsActions {
  remove: (id: string) => Promise<void>;
}

/**
 * Every spotlight, switched on or not, newest first — the order the session
 * report email appends them in — each with its picture, its title in the
 * admin's own language, whether it is in session report emails, and the
 * way to edit or delete it.
 *
 * **Presentational**: the rows and the writes arrive as props, and the live
 * page hands it a read and the mutations. The read's status is separate from
 * the rows because "no spotlights yet", "the read has not answered" and "the
 * read failed" all arrive as no rows, and only the first may print an empty
 * state.
 *
 * **No loading affordance.** The read is one walk over a handful of rows an
 * office writes by hand, and lands in a frame or two. Until it does, nothing
 * renders under the heading.
 *
 * **Whether it is in the emails is read here and changed in the editor**,
 * where it is saved with the picture it depends on.
 */
export function AdminSpotlightsPage({
  spotlights,
  status,
  actions,
}: {
  /** Newest first — the order the read delivers. */
  spotlights: readonly AdminSpotlight[];
  /** The read's state. Only a read that succeeded may print the empty state. */
  status: "pending" | "error" | "success";
  actions: AdminSpotlightsActions;
}) {
  const t = useTranslations("admin.spotlights");
  const [deleting, setDeleting] = useState<AdminSpotlight | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="max-w-3xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href={ROUTES.admin.spotlightNew} className={buttonVariants()}>
          <Plus className="mr-1 h-4 w-4" />
          {t("newSpotlight")}
        </Link>
      </div>

      {/* A failed refetch under a painted list keeps the rows it had, so the
          line is only for a page that has nothing to show. */}
      {status === "error" && spotlights.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>{t("listLoadError")}</AlertDescription>
        </Alert>
      )}

      {status === "success" && spotlights.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {spotlights.length > 0 && (
        <ul className="space-y-2">
          {spotlights.map((spotlight) => (
            <li key={spotlight.id}>
              <SpotlightRow
                spotlight={spotlight}
                onDelete={() => setDeleting(spotlight)}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteConfirm.title")}
        description={
          deleting?.enabled
            ? t("deleteConfirm.descriptionOn")
            : t("deleteConfirm.descriptionOff")
        }
        confirmLabel={t("deleteConfirm.confirm")}
        cancelLabel={t("actions.cancel")}
        confirmVariant="destructive"
        holdWhileCommitting
        onConfirm={async () => {
          if (deleting !== null) await actions.remove(deleting.id);
        }}
        describeError={(failure) => {
          const reason = spotlightWriteFailure(failure);
          return reason.kind === "reason"
            ? t("errors.deleteFailedWithReason", { reason: reason.reason })
            : t("errors.deleteFailed");
        }}
      />
    </div>
  );
}

/**
 * Whether a spotlight is in session report emails — the Library status chip's
 * shape: a neutral edge, no fill, the word in the state's colour. On is
 * success, the state where the spotlight is doing its job; off spends no
 * colour.
 */
function SpotlightStatusChip({ enabled }: { enabled: boolean }) {
  const t = useTranslations("admin.spotlights.status");

  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium",
        enabled ? "text-success" : "text-muted-foreground",
      )}
    >
      {enabled ? t("on") : t("off")}
    </span>
  );
}

/**
 * One spotlight: its picture at the frame the email sets it in, its title and
 * whether it is in the emails, the languages it is written in and when it was
 * made, and the way to delete it.
 *
 * **The whole card opens the spotlight's editor**, through the stretched-link
 * shape the admin sites and invoice-customer rows use: the title is the anchor
 * and its `::after` covers the card, so the link's accessible name is the
 * title, with no second link duplicating it. The focus ring is drawn on that
 * `::after`, around the whole card, as the Library's article card draws it.
 * Delete owns its clicks, so it is lifted above the stretched link with
 * `relative z-10` — the shape the gedu assignment and family enrolment cards
 * use for their controls — and nothing else is: text takes no lift, so the
 * rest of the card stays a way into the editor. No control sits inside the
 * anchor.
 */
function SpotlightRow({
  spotlight,
  onDelete,
}: {
  spotlight: AdminSpotlight;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.spotlights");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();

  const title = resolveTranslation(spotlight.versions, uiLocale)?.title ?? "";

  return (
    // `relative` is what the title link's `::after` is positioned against;
    // `group` is what the chevron's nudge reads, on hover and on focus alike.
    <div className="group relative flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-hover">
      {/* The picture at its purpose's 2:1, the frame the email sets it in. No
          picture paints NO IMAGE in the same frame, so rows line up. */}
      <FramedImage
        purpose="spotlight_image"
        src={catalogueImageSrc("spotlight_image", spotlight.imagePath)}
        className="w-32 shrink-0 rounded-md"
        sizes="128px"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={ROUTES.admin.spotlight(spotlight.id)}
            className="truncate font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
          >
            {title}
          </Link>
          <SpotlightStatusChip enabled={spotlight.enabled} />
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Languages className="h-3 w-3" aria-hidden />
            <span className="sr-only">{t("languagesLabel")}</span>
            {spotlight.versions.map((version) => (
              <span key={version.locale} className="uppercase">
                {version.locale}
              </span>
            ))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            <time dateTime={spotlight.createdAt}>
              {t("created", {
                date: formatDate(spotlight.createdAt, locale, {
                  dateStyle: "medium",
                  timeZone,
                }),
              })}
            </time>
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="relative z-10 shrink-0"
        onClick={onDelete}
      >
        <Trash2 aria-hidden />
        {t("actions.delete")}
      </Button>
      <NavChevron />
    </div>
  );
}
