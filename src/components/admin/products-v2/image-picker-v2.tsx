"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/svg+xml";

interface ImagePickerV2Props {
  value: File | null;
  onChange: (value: File | null) => void;
  disabled?: boolean;
}

export function ImagePickerV2({ value, onChange, disabled }: ImagePickerV2Props) {
  const t = useTranslations("admin.productsV2.imagePicker");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value]
  );

  useEffect(() => {
    if (previewUrl) {
      return () => URL.revokeObjectURL(previewUrl);
    }
    return undefined;
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onChange(file);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length === 0) return;
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith("image/")) {
      onChange(file);
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        {t("label")} <span className="text-destructive">*</span>
      </Label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-md border border-dashed border-input bg-background p-4",
          isDragging && "border-primary bg-primary/5",
          disabled && "opacity-60"
        )}
      >
        {previewUrl ? (
          <div className="relative h-40 w-full overflow-hidden rounded-md border bg-muted">
            <Image
              src={previewUrl}
              alt={t("previewAlt")}
              fill
              loading="lazy"
              unoptimized
              className="object-contain"
            />
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <p className="text-sm">{t("dropPrompt")}</p>
            <p className="text-xs">{t("formats")}</p>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {t("chooseFile")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <X className="mr-1 h-4 w-4" />
              {t("remove")}
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
