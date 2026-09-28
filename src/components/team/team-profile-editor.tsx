"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TeamProfileEditorBody } from "@/components/team/team-profile-editor-body";
import {
  profileWithContent,
  type TeamProfileContent,
} from "@/components/team/team-profile-form";
import {
  isTeamProfileIncompleteError,
  useSaveGeduTeamProfile,
  useSaveOwnTeamProfile,
  useUploadTeamPhoto,
  type TeamProfile,
  type TeamProfilePhoto,
  type TeamProfileRecord,
  type TeamProfileSaveInput,
} from "@/services/team-profiles";

/** A save that could not go out because the photo it names never uploaded. */
class PhotoUploadError extends Error {}

/** What the last save in this visit wrote, or nothing yet. */
interface LastSave {
  content: TeamProfileContent;
  on: boolean;
  photoPath: string | null;
}

/**
 * The profile editor's data shell: the photo uploads and the save, over the
 * record the page opened on.
 *
 * **What was saved becomes the page's saved state, locally.** A save sends the
 * content the form was showing, so once it lands that content *is* the saved
 * profile, and handing it back to the body as the baseline is what disables
 * Save and Discard. A refetch would say the same with one difference that
 * matters: the photo would come back under a fresh signed URL rather than the
 * one the form holds, and the form would read as changed. So the editor never
 * re-reads what it has just written.
 *
 * **A photo is uploaded the moment it is cropped, and saved by its path.** The
 * form knows only the URL it shows the photo through; the save names the
 * object in the bucket. The saved photo's path is known, and a newly cropped
 * one's is whatever its upload resolves to, so a save waits for the latest
 * upload, and a failed upload fails the save that needed it.
 */
function useTeamProfileEditor(
  record: TeamProfileRecord,
  write: (input: TeamProfileSaveInput, on: boolean) => Promise<void>,
) {
  const t = useTranslations("team.edit.errors");
  const upload = useUploadTeamPhoto();
  const [lastSave, setLastSave] = useState<LastSave | null>(null);
  // Set before the write starts, so Save cannot be pressed twice between the
  // click and the first render the write causes; cleared once it settles
  // either way, because the page stays put through both.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The latest crop's upload, resolving to its path. */
  const latestUpload = useRef<Promise<string> | null>(null);

  const savedPhotoSrc = lastSave
    ? lastSave.content.photo?.src
    : record.profile.photo?.src;
  const savedPhotoPath = lastSave ? lastSave.photoPath : record.photoPath;

  function onUploadPhoto(photo: Blob) {
    const path = upload
      .mutateAsync({ ownerId: record.profile.id, photo })
      .then((uploaded) => uploaded.path);
    // Nothing waits on it until a save does, and that is where a failure is
    // told; left unhandled until then, it would be reported as uncaught.
    path.catch(() => {});
    latestUpload.current = path;
  }

  async function photoPathFor(
    photo: TeamProfilePhoto | null,
  ): Promise<string | null> {
    if (photo === null) return null;
    if (photo.src === savedPhotoSrc || latestUpload.current === null) {
      return savedPhotoPath;
    }
    try {
      return await latestUpload.current;
    } catch (error) {
      throw new PhotoUploadError("The photo did not upload", { cause: error });
    }
  }

  async function onSave(content: TeamProfileContent, on: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      const photoPath = await photoPathFor(content.photo);
      await write(
        {
          nickname: content.nickname,
          title: content.title,
          pick: content.pick,
          photoPath,
          translations: content.translations,
        },
        on,
      );
      setLastSave({ content, on, photoPath });
    } catch (error) {
      // The reader gets a translated line; the server's own words go to the
      // console for whoever is debugging it.
      console.error("[team-profile] save failed:", error);
      setSaveError(
        error instanceof PhotoUploadError
          ? t("photoUpload")
          : isTeamProfileIncompleteError(error)
            ? t("incomplete")
            : t("save"),
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    /** The saved profile the body compares the form against. */
    savedProfile<P extends TeamProfile>(opened: P): P {
      return lastSave ? profileWithContent(opened, lastSave.content) : opened;
    },
    /** The saved checkbox, as last saved in this visit or as opened. */
    savedOn(opened: boolean): boolean {
      return lastSave ? lastSave.on : opened;
    },
    saving,
    saveError,
    actions: { onUploadPhoto, onSave },
  };
}

/** `/settings/team-profile`: an admin or a Gedu editing their own profile. */
export function OwnTeamProfileEditor({ record }: { record: TeamProfileRecord }) {
  const save = useSaveOwnTeamProfile();
  const editor = useTeamProfileEditor(record, (input, on) =>
    save.mutateAsync({ userId: record.profile.id, input, on }),
  );
  return record.role === "admin" ? (
    <TeamProfileEditorBody
      role="admin"
      profile={editor.savedProfile(record.profile)}
      shown={editor.savedOn(record.shown)}
      actions={editor.actions}
      saving={editor.saving}
      saveError={editor.saveError}
    />
  ) : (
    <TeamProfileEditorBody
      role="gedu"
      profile={editor.savedProfile(record.profile)}
      ready={editor.savedOn(record.ready)}
      approval={record.approval}
      actions={editor.actions}
      saving={editor.saving}
      saveError={editor.saveError}
    />
  );
}

/**
 * `/admin/users/[id]/team-profile`: an admin editing a Gedu's content. The
 * Gedu's checkbox is theirs: the save never writes it, and the body shows it
 * as a status.
 */
export function AdminGeduTeamProfileEditor({
  record,
}: {
  record: Extract<TeamProfileRecord, { role: "gedu" }>;
}) {
  const save = useSaveGeduTeamProfile();
  const editor = useTeamProfileEditor(record, (input) =>
    save.mutateAsync({ geduId: record.profile.id, input }),
  );
  return (
    <TeamProfileEditorBody
      role="gedu"
      editedByAdmin
      profile={editor.savedProfile(record.profile)}
      ready={record.ready}
      approval={record.approval}
      actions={editor.actions}
      saving={editor.saving}
      saveError={editor.saveError}
    />
  );
}
