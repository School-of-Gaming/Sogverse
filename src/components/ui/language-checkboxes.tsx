"use client";

import type { LanguageRow } from "@/types";

// If languages are added beyond 3, update PLACEHOLDER_COUNT to match
// so the layout doesn't shift on load.
const PLACEHOLDER_COUNT = 3;

export function LanguageCheckboxes({
  languages,
  selected,
  onChange,
  disabled,
}: {
  languages: LanguageRow[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}) {
  const loaded = languages.length > 0;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">Languages</legend>
      <div className="flex flex-col gap-2">
        {loaded
          ? languages.map((lang) => (
              <label key={lang.code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(lang.code)}
                  onChange={(e) => {
                    onChange(
                      e.target.checked
                        ? [...selected, lang.code]
                        : selected.filter((l) => l !== lang.code)
                    );
                  }}
                  disabled={disabled}
                  className="h-4 w-4 accent-primary"
                />
                {lang.name}
              </label>
            ))
          : Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
              <label key={i} className="invisible flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" />
                &nbsp;
              </label>
            ))}
      </div>
    </fieldset>
  );
}
