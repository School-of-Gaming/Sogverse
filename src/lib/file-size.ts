import { formattingLocale } from "@/lib/constants/locales";

const KB = 1024;
const MB = 1024 * KB;

/**
 * A file's size as a reader reads it: whole kilobytes under a megabyte, one
 * decimal of megabytes from there, in the app locale's number conventions and
 * unit abbreviation (`2.4 MB`, `2,4 Mt`, `2,4 Mo`). Counted in 1024s, the way
 * the upload caps are. Pure arithmetic over `Intl`, so a server render and the
 * first client render agree.
 */
export function formatFileSize(bytes: number, locale: string): string {
  if (bytes < MB) {
    return new Intl.NumberFormat(formattingLocale(locale), {
      style: "unit",
      unit: "kilobyte",
      maximumFractionDigits: 0,
    }).format(Math.max(1, Math.round(bytes / KB)));
  }
  return new Intl.NumberFormat(formattingLocale(locale), {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(bytes / MB);
}
