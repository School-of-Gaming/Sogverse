"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { WithheldText } from "@/components/ui/withheld-text";

/**
 * The gedu-note field of a session editor, for a reader the note is withheld
 * from: the same title, glyph and hint the real field carries, over filler in
 * the box the editor would fill.
 *
 * **Not an editor.** There is nothing to seed one with, and a field that took
 * typing over a note the reader cannot see would be offering to replace it
 * blind. The slot keeps its place and its size, so the editor reads in the same
 * order and at the same length as the one an assigned gedu opens.
 */
export function WithheldStaffNoteField() {
  const t = useTranslations("gedu.sessionFeed");
  const g = useTranslations("gedu.groupWorkspace");
  return (
    <Field label={t("staffNoteTitle")} icon={Lock} hint={t("staffNoteHint")}>
      {() => (
        <WithheldText label={g("staffNoteWithheld")} lines={5} boxed />
      )}
    </Field>
  );
}
