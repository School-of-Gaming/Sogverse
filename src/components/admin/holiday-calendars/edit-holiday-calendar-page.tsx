"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { FormSection } from "@/components/admin/products/form-primitives";
import { ROUTES } from "@/lib/constants/routes";
import {
  formattingLocale,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  useHolidayCalendar,
  usePreviewHolidayCalendarChange,
  useUpdateHolidayCalendar,
} from "@/services/holiday-calendars/holiday-calendars.queries";
import {
  type HolidayCalendarProduct,
} from "@/services/holiday-calendars/holiday-calendars.service";
import { holidayCalendarDraft } from "./holiday-calendar-draft";
import { HolidayCalendarForm } from "./holiday-calendar-form";
import { summariseHolidayImpact } from "./holiday-calendar-impact";
import { HolidayCalendarPageShell } from "./holiday-calendar-page-shell";
import { useViewerToday } from "./use-viewer-today";

/** The clubs following the calendar, by their name in the reader's locale. */
function namedProducts(
  products: readonly HolidayCalendarProduct[],
  uiLocale: SupportedLocale,
) {
  return products
    .map((product) => ({
      ...product,
      name:
        resolveTranslation(product.translations, uiLocale)?.name ??
        "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, formattingLocale(uiLocale)));
}

/**
 * `/admin/holiday-calendars/[id]` — one calendar: its edit form, with the
 * clubs following it as the form's last section, just above Save, since they
 * are what an edit reaches: every one of them gains or loses the dates the
 * moment the form is saved. Each links to its admin page, where the calendar
 * is attached or detached.
 *
 * **A save asks first only where a club follows the calendar.** The preview is
 * handed to the form only then, so an unfollowed calendar saves straight away.
 *
 * The form is keyed on the calendar and rendered only once it is read, like the
 * invoice customer page: `useState` seeds once, and the read is one row by
 * primary key with its breaks, landing in a frame or two under a heading and a
 * back link already painted.
 */
export function EditHolidayCalendarPage({ calendarId }: { calendarId: string }) {
  const t = useTranslations("admin.holidayCalendars");
  const c = useTranslations("common");
  const router = useRouter();
  const uiLocale = resolveLocale(useLocale());
  const today = useViewerToday();
  const { data: calendar, isPending } = useHolidayCalendar(calendarId);
  const updateCalendar = useUpdateHolidayCalendar();
  const previewChange = usePreviewHolidayCalendarChange();

  return (
    <HolidayCalendarPageShell title={t("editPage.title")}>
      {calendar && (
        <HolidayCalendarForm
          key={calendar.id}
          initialDraft={holidayCalendarDraft(calendar, uiLocale)}
          submitLabel={c("saveChanges")}
          today={today}
          onCancel={() => router.push(ROUTES.admin.holidayCalendars)}
          preview={
            calendar.products.length === 0
              ? undefined
              : async (input) =>
                  summariseHolidayImpact(
                    await previewChange.mutateAsync({
                      id: calendar.id,
                      breaks: input.breaks,
                    }),
                    uiLocale,
                  )
          }
          onSubmit={async (input) => {
            await updateCalendar.mutateAsync({ id: calendar.id, input });
            router.push(ROUTES.admin.holidayCalendars);
          }}
        >
          <FormSection
            title={t("sections.products")}
            description={t("sections.productsDescription")}
          >
            {calendar.products.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noProducts")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {namedProducts(calendar.products, uiLocale).map((product) => (
                  <li key={product.id}>
                    <Link
                      href={ROUTES.admin.product(product.productType, product.id)}
                      className="flex items-center justify-between gap-3 rounded py-2 text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                    >
                      <span className="font-medium">{product.name}</span>
                      <NavChevron size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        </HolidayCalendarForm>
      )}

      {!isPending && !calendar && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("notFound")}
          </CardContent>
        </Card>
      )}
    </HolidayCalendarPageShell>
  );
}
