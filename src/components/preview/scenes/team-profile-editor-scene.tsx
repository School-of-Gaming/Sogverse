"use client";

import { useState } from "react";
import {
  TeamProfileEditorBody,
  type TeamProfileActions,
} from "@/components/team/team-profile-editor-body";
import { profileWithContent } from "@/components/team/team-profile-form";
import {
  ADMIN_TEAM_PROFILE_EDITOR_FIXTURES,
  GEDU_TEAM_PROFILE_EDITOR_FIXTURES,
  type AdminTeamProfileEditorScenario,
  type GeduTeamProfileEditorFixture,
  type GeduTeamProfileEditorScenario,
} from "@/components/team/mock-team-fixtures";
import type {
  AdminTeamProfile,
  TeamProfile,
} from "@/services/team-profiles/team-profiles.types";

/**
 * The page a person edits their own public profile on, over fixtures — once
 * as a Gedu meets it and once as office staff do, because the two are
 * different chrome (an admin's page carries the sidebar) and a different
 * checkbox.
 *
 * The scene stands in for the route's data shell: saving updates the profile
 * and the checkbox it hands the body, as a refetch would, so save, discard and
 * the status all behave. The crop runs for real and the form shows the
 * result, but a save sends its bytes nowhere. Whether an admin has made a
 * Gedu's profile public is the fixture's, and moves here only as the database
 * moves it: saving not ready hides it. The admin page also carries the one it
 * edits a Gedu's profile on, checkbox included.
 */
export function GeduTeamProfileEditorScene({
  scenario,
}: {
  scenario: GeduTeamProfileEditorScenario;
}) {
  return <GeduEditor fixture={GEDU_TEAM_PROFILE_EDITOR_FIXTURES[scenario]} />;
}

export function AdminTeamProfileEditorScene({
  scenario,
}: {
  scenario: AdminTeamProfileEditorScenario;
}) {
  const fixture = ADMIN_TEAM_PROFILE_EDITOR_FIXTURES[scenario];
  return fixture.editing === "own" ? (
    <OwnAdminEditor profile={fixture.profile} shown={fixture.shown} />
  ) : (
    <GeduEditor fixture={fixture.gedu} editedByAdmin />
  );
}

function OwnAdminEditor({
  profile: opened,
  shown: openedShown,
}: {
  profile: AdminTeamProfile;
  shown: boolean;
}) {
  const [profile, setProfile] = useState(opened);
  const [shown, setShown] = useState(openedShown);
  return (
    <TeamProfileEditorBody
      role="admin"
      profile={profile}
      shown={shown}
      actions={localActions(profile, setProfile, setShown)}
    />
  );
}

/** A Gedu's profile, as the Gedu meets it or from the admin panel. */
function GeduEditor({
  fixture,
  editedByAdmin = false,
}: {
  fixture: GeduTeamProfileEditorFixture;
  editedByAdmin?: boolean;
}) {
  const [profile, setProfile] = useState(fixture.profile);
  const [ready, setReady] = useState(fixture.ready);
  const [approved, setApproved] = useState(fixture.approved);
  return (
    <TeamProfileEditorBody
      role="gedu"
      editedByAdmin={editedByAdmin}
      profile={profile}
      ready={ready}
      approved={approved}
      actions={localActions(profile, setProfile, (on) => {
        setReady(on);
        // As the database does: saving not ready hides the profile.
        if (!on) setApproved(false);
      })}
    />
  );
}

function localActions<P extends TeamProfile>(
  profile: P,
  setProfile: (profile: P) => void,
  setSwitch: (on: boolean) => void,
): TeamProfileActions {
  return {
    onSave: (content, on) => {
      setProfile(profileWithContent(profile, content));
      setSwitch(on);
    },
  };
}
