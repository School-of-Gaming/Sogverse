"use client";

import { useState } from "react";
import { TeamProfileEditorBody } from "@/components/team/team-profile-editor-body";
import { profileWithContent } from "@/components/team/team-profile-form";
import {
  ADMIN_TEAM_PROFILE_EDITOR_FIXTURES,
  GEDU_TEAM_PROFILE_EDITOR_FIXTURES,
  type AdminTeamProfileEditorScenario,
  type GeduTeamProfileEditorScenario,
  type TeamProfileEditorFixture,
} from "@/components/team/mock-team-fixtures";

/**
 * The page a person edits their own public profile on, over fixtures — once
 * as a Gedu meets it and once as office staff do, because the two are
 * different chrome (an admin's page carries the sidebar) and an admin's
 * profile has a title field. The checkbox and the states are the same.
 *
 * The scene stands in for the route's data shell: saving updates the profile
 * and the checkbox it hands the body, as a refetch would, so save, discard and
 * the status all behave. The crop runs for real and the form shows the
 * result, but a save sends its bytes nowhere. Whether an admin has made the
 * profile public is the fixture's, and moves here only as the database moves
 * it: saving not ready hides it. The admin page also carries the one it edits
 * a Gedu's profile on, checkbox included.
 */
export function GeduTeamProfileEditorScene({
  scenario,
}: {
  scenario: GeduTeamProfileEditorScenario;
}) {
  return <Editor fixture={GEDU_TEAM_PROFILE_EDITOR_FIXTURES[scenario]} />;
}

export function AdminTeamProfileEditorScene({
  scenario,
}: {
  scenario: AdminTeamProfileEditorScenario;
}) {
  const fixture = ADMIN_TEAM_PROFILE_EDITOR_FIXTURES[scenario];
  return <Editor fixture={fixture} editedByAdmin={fixture.editedByAdmin} />;
}

function Editor({
  fixture,
  editedByAdmin = false,
}: {
  fixture: TeamProfileEditorFixture;
  editedByAdmin?: boolean;
}) {
  const [profile, setProfile] = useState(fixture.profile);
  const [ready, setReady] = useState(fixture.ready);
  const [approved, setApproved] = useState(fixture.approved);
  return (
    <TeamProfileEditorBody
      editedByAdmin={editedByAdmin}
      profile={profile}
      ready={ready}
      approved={approved}
      actions={{
        onSave: (content, on) => {
          setProfile(profileWithContent(profile, content));
          setReady(on);
          // As the database does: saving not ready hides the profile.
          if (!on) setApproved(false);
        },
      }}
    />
  );
}
