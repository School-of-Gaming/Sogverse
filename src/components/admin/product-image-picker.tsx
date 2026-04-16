"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { productImageUrl } from "@/lib/images/product-image-url";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/svg+xml";

export type ProductImageValue = File | string | null;

interface ProductImagePickerProps {
  value: ProductImageValue;
  onChange: (value: ProductImageValue) => void;
  disabled?: boolean;
}

export function ProductImagePicker({
  value,
  onChange,
  disabled,
}: ProductImagePickerProps) {
  const t = useTranslations("admin.forms");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Resolve a preview URL: blob URL for staged File, public URL for stored path.
  const previewUrl = useMemo(() => {
    if (value instanceof File) return URL.createObjectURL(value);
    if (typeof value === "string") return productImageUrl(value);
    return null;
  }, [value]);

  // Revoke blob URLs to avoid leaks when the staged File changes or unmounts.
  useEffect(() => {
    if (value instanceof File && previewUrl) {
      return () => URL.revokeObjectURL(previewUrl);
    }
    return undefined;
  }, [value, previewUrl]);

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

  const handleRemove = () => {
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <Label>{t("imageLabel")}</Label>
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
              alt={t("preview")}
              fill
              loading="lazy"
              unoptimized
              className="object-contain"
            />
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <p className="text-sm">{t("imagePickerHint")}</p>
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
            {t("imageChooseFile")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleRemove}
            >
              <X className="mr-1 h-4 w-4" />
              {t("imageRemove")}
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
    </div>
  );
}
