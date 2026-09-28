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
 * the status all behave. The upload is inert — the crop runs for real and the
 * form shows the result, but no bytes go anywhere. An admin's approval is the
 * fixture's and does not move here. The admin page also carries the one it
 * edits a Gedu's profile on, whose switch is the Gedu's and so never moves.
 */
export function GeduTeamProfileEditorScene({
  scenario,
}: {
  scenario: GeduTeamProfileEditorScenario;
}) {
  const fixture = GEDU_TEAM_PROFILE_EDITOR_FIXTURES[scenario];
  const [profile, setProfile] = useState(fixture.profile);
  const [ready, setReady] = useState(fixture.ready);
  return (
    <TeamProfileEditorBody
      role="gedu"
      profile={profile}
      ready={ready}
      approval={fixture.approval}
      actions={localActions(profile, setProfile, setReady)}
    />
  );
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
    <GeduEditedByAdmin fixture={fixture.gedu} />
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

/** A Gedu's profile from the admin panel: the save never moves their switch. */
function GeduEditedByAdmin({ fixture }: { fixture: GeduTeamProfileEditorFixture }) {
  const [profile, setProfile] = useState(fixture.profile);
  return (
    <TeamProfileEditorBody
      role="gedu"
      editedByAdmin
      profile={profile}
      ready={fixture.ready}
      approval={fixture.approval}
      actions={localActions(profile, setProfile, noop)}
    />
  );
}

function localActions<P extends TeamProfile>(
  profile: P,
  setProfile: (profile: P) => void,
  setSwitch: (on: boolean) => void,
): TeamProfileActions {
  return {
    onUploadPhoto: noop,
    onSave: (content, on) => {
      setProfile(profileWithContent(profile, content));
      setSwitch(on);
    },
  };
}

function noop() {}
