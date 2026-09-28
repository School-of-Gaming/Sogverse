"use client";

import { TeamCardEditorBody } from "@/components/team/team-card-editor-body";
import {
  ADMIN_TEAM_CARD_FIXTURES,
  GEDU_TEAM_CARD_FIXTURES,
  type AdminTeamCardScenario,
  type GeduTeamCardScenario,
} from "@/components/team/mock-team-fixtures";

/**
 * The page a person edits their own team card on, over fixtures — once as a
 * Gedu meets it and once as office staff do, because the two are different
 * chrome (an admin's page carries the sidebar) and a different workflow.
 *
 * Typing, the photo's removal, the phrases, the topics, the tagline's language,
 * the consent tick and the preview's draft/live toggle all work against local
 * state. Every write — upload, save, submit, withdraw, remove, hide, show — is
 * inert, rendering its real enabled or disabled state and doing nothing; the
 * remove confirmation opens and closes for real.
 */
export function GeduTeamCardScene({
  scenario,
}: {
  scenario: GeduTeamCardScenario;
}) {
  const fixture = GEDU_TEAM_CARD_FIXTURES[scenario];
  return (
    <TeamCardEditorBody
      role="gedu"
      draft={fixture.draft}
      state={fixture.state}
      actions={{
        onChoosePhoto: noop,
        onSaveDraft: noop,
        onSubmit: noop,
        onWithdraw: noop,
        onRemove: noop,
      }}
    />
  );
}

export function AdminTeamCardScene({
  scenario,
}: {
  scenario: AdminTeamCardScenario;
}) {
  const fixture = ADMIN_TEAM_CARD_FIXTURES[scenario];
  return (
    <TeamCardEditorBody
      role="admin"
      card={fixture.card}
      state={fixture.state}
      actions={{
        onChoosePhoto: noop,
        onSave: noop,
        onHide: noop,
        onShow: noop,
      }}
    />
  );
}

function noop() {}
