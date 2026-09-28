"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TeamProfileEditorBody } from "@/components/team/team-profile-editor-body";
import {
  profileWithContent,
  type TeamProfileContent,
} from "@/components/team/team-profile-form";
import {
  TeamPhotoUploadError,
  isTeamProfileIncompleteError,
  isTeamProfilePhotoGoneError,
  useSaveTeamProfile,
  type TeamPhotoToSave,
  type TeamProfilePhoto,
  type TeamProfileRecord,
  type TeamProfileSaveInput,
} from "@/services/team-profiles";

/** What the last save in this visit wrote, or nothing yet. */
interface LastSave {
  content: TeamProfileContent;
  on: boolean;
  /** Whether it is public after that save, which an admin decides elsewhere. */
  approved: boolean;
  photoPath: string | null;
}

/**
 * The profile editor's data shell: the save, over the record the page opened
 * on.
 *
 * **What was saved becomes the page's saved state, locally.** A save sends the
 * content the form was showing, so once it lands that content *is* the saved
 * profile, and handing it back to the body as the baseline is what disables
 * Save and Discard. A refetch would say the same with one difference that
 * matters: the photo would come back under a fresh signed URL rather than the
 * one the form holds, and the form would read as changed. So the editor never
 * re-reads what it has just written.
 *
 * **A cropped photo stays in the browser until Save.** The form shows it
 * through a local URL and the body hands its bytes to the save; the save
 * stores them and names the stored object, and a refused save takes the
 * object back out. The saved photo goes back by its known path, so an
 * unchanged photo is never stored twice. Saving, Save stays busy through the
 * upload as well as the write.
 */
function useTeamProfileEditor(
  record: TeamProfileRecord,
  write: (input: TeamProfileSaveInput, on: boolean) => Promise<string | null>,
) {
  const t = useTranslations("team.edit.errors");
  const [lastSave, setLastSave] = useState<LastSave | null>(null);
  // Set before the write starts, so Save cannot be pressed twice between the
  // click and the first render the write causes; cleared once it settles
  // either way, because the page stays put through both.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedPhotoSrc = lastSave
    ? lastSave.content.photo?.src
    : record.profile.photo?.src;
  const savedPhotoPath = lastSave ? lastSave.photoPath : record.photoPath;

  function photoToSave(
    photo: TeamProfilePhoto | null,
    crop: Blob | null,
  ): TeamPhotoToSave {
    if (photo === null) return null;
    if (photo.src === savedPhotoSrc) {
      return savedPhotoPath === null ? null : { path: savedPhotoPath };
    }
    if (crop === null) {
      throw new TeamPhotoUploadError("A new photo reached the save without its bytes");
    }
    return { crop };
  }

  async function onSave(
    content: TeamProfileContent,
    on: boolean,
    crop: Blob | null,
  ) {
    setSaving(true);
    setSaveError(null);
    try {
      const photoPath = await write(
        {
          nickname: content.nickname,
          title: content.title,
          pick: content.pick,
          photo: photoToSave(content.photo, crop),
          translations: content.translations,
        },
        on,
      );
      // As the database does: a save that leaves it not ready hides it.
      setLastSave({
        content,
        on,
        approved: (lastSave ? lastSave.approved : record.approved) && on,
        photoPath,
      });
    } catch (error) {
      // The reader gets a translated line; the server's own words go to the
      // console for whoever is debugging it.
      console.error("[team-profile] save failed:", error);
      setSaveError(
        error instanceof TeamPhotoUploadError
          ? t("photoUpload")
          : isTeamProfileIncompleteError(error)
            ? t("incomplete")
            : isTeamProfilePhotoGoneError(error)
              ? t("photoGone")
              : t("save"),
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    /** The saved profile the body compares the form against. */
    profile: lastSave
      ? profileWithContent(record.profile, lastSave.content)
      : record.profile,
    /** The saved checkbox, as last saved in this visit or as opened. */
    ready: lastSave ? lastSave.on : record.ready,
    /** Whether it is public, as the last save in this visit left it or as opened. */
    approved: lastSave ? lastSave.approved : record.approved,
    saving,
    saveError,
    actions: { onSave },
  };
}

/**
 * `/settings/profile`, an admin or a Gedu editing their own profile, and
 * `/admin/users/[id]/profile`, an admin editing someone else's
 * (`editedByAdmin`). The save is the same either way, checkbox included.
 */
export function TeamProfileEditor({
  record,
  editedByAdmin = false,
}: {
  record: TeamProfileRecord;
  editedByAdmin?: boolean;
}) {
  const save = useSaveTeamProfile();
  const editor = useTeamProfileEditor(record, (input, on) =>
    save.mutateAsync({ userId: record.profile.id, input, on }),
  );
  return (
    <TeamProfileEditorBody
      editedByAdmin={editedByAdmin}
      profile={editor.profile}
      ready={editor.ready}
      approved={editor.approved}
      actions={editor.actions}
      saving={editor.saving}
      saveError={editor.saveError}
    />
  );
}
