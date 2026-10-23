"use client";

import { useLocale, useTranslations } from "next-intl";
import { GUIDE_UPLOAD_MAX_BYTES } from "@/services/guides/guides.contracts";
import { formatFileSize } from "@/lib/file-size";
import { GuideUploadError } from "./guide-upload";

/**
 * Why an upload did not store, in the admin's words. A file over the cap is
 * told its own size, the limit, and how to export it smaller — the whole of
 * the remedy for a too-large guide today.
 */
export function useDescribeGuideUploadFailure(): (error: unknown, file: File) => string {
  const t = useTranslations("admin.guides.errors");
  const locale = useLocale();

  return (error, file) => {
    const failure = error instanceof GuideUploadError ? error.failure : { kind: "unknown" as const };
    switch (failure.kind) {
      case "reason":
        return t("uploadFailedWithReason", { reason: failure.reason });
      case "unknown":
        return t("uploadFailed");
      case "refused":
        switch (failure.code) {
          case "too_large":
            return t("tooLarge", {
              size: formatFileSize(file.size, locale),
              limit: formatFileSize(GUIDE_UPLOAD_MAX_BYTES, locale),
            });
          case "not_pdf":
            return t("notPdf");
          case "empty":
            return t("empty");
          case "label":
            return t("labelMissing");
        }
    }
  };
}
