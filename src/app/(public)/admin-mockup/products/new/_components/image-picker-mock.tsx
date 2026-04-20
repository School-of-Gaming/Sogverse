"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Mockup: only ever holds a File (freshly picked) or null. The real picker
// also accepts a string bucket path for edit mode, but that doesn't apply
// here since nothing persists.

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/svg+xml";

interface ImagePickerMockProps {
  value: File | null;
  onChange: (value: File | null) => void;
  disabled?: boolean;
}

export function ImagePickerMock({ value, onChange, disabled }: ImagePickerMockProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
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
        Image <span className="text-destructive">*</span>
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
          disabled && "opacity-60",
        )}
      >
        {previewUrl ? (
          <div className="relative h-40 w-full overflow-hidden rounded-md border bg-muted">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              loading="lazy"
              unoptimized
              className="object-contain"
            />
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <p className="text-sm">Drop an image here or click to choose.</p>
            <p className="text-xs">JPG, PNG, WebP, AVIF, or SVG.</p>
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
            Choose file
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
              Remove
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
      <p className="text-xs text-muted-foreground">
        Shown on the product card when parents are browsing.
      </p>
    </div>
  );
}
