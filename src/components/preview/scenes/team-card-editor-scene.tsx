"use client";

import { useState } from "react";
import {
  TeamCardEditorBody,
  type TeamCardActions,
} from "@/components/team/team-card-editor-body";
import { profileWithContent } from "@/components/team/team-card-form";
import {
  ADMIN_TEAM_CARD_FIXTURES,
  GEDU_TEAM_CARD_FIXTURES,
  type AdminTeamCardScenario,
  type GeduTeamCardScenario,
} from "@/components/team/mock-team-fixtures";
import type { TeamProfile } from "@/components/team/team-profile-body";

/**
 * The page a person edits their own team card on, over fixtures — once as a
 * Gedu meets it and once as office staff do, because the two are different
 * chrome (an admin's page carries the sidebar) and a different checkbox.
 *
 * The scene stands in for the route's data shell: saving updates the card and
 * the checkbox it hands the body, as a refetch would, so save, discard and the
 * status all behave. The upload is inert — the
 * crop runs for real and the form shows the result, but no bytes go anywhere.
 * An admin's approval is the fixture's and does not move here.
 */
export function GeduTeamCardScene({
  scenario,
}: {
  scenario: GeduTeamCardScenario;
}) {
  const fixture = GEDU_TEAM_CARD_FIXTURES[scenario];
  const [card, setCard] = useState(fixture.card);
  const [ready, setReady] = useState(fixture.ready);
  return (
    <TeamCardEditorBody
      role="gedu"
      card={card}
      ready={ready}
      approval={fixture.approval}
      actions={localActions(card, setCard, setReady)}
    />
  );
}

export function AdminTeamCardScene({
  scenario,
}: {
  scenario: AdminTeamCardScenario;
}) {
  const fixture = ADMIN_TEAM_CARD_FIXTURES[scenario];
  const [card, setCard] = useState(fixture.card);
  const [shown, setShown] = useState(fixture.shown);
  return (
    <TeamCardEditorBody
      role="admin"
      card={card}
      shown={shown}
      actions={localActions(card, setCard, setShown)}
    />
  );
}

function localActions<P extends TeamProfile>(
  card: P,
  setCard: (card: P) => void,
  setSwitch: (on: boolean) => void,
): TeamCardActions {
  return {
    onUploadPhoto: noop,
    onSave: (content, on) => {
      setCard(profileWithContent(card, content));
      setSwitch(on);
    },
  };
}

function noop() {}
