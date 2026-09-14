/**
 * The session feedback scene's scenarios, in a module with no client
 * directive: the renderer narrows a URL slug on the server, and a guard
 * exported from the client scene file cannot be called there.
 */
export const SESSION_FEEDBACK_SCENARIOS = ["default"] as const;

export type SessionFeedbackSceneScenario =
  (typeof SESSION_FEEDBACK_SCENARIOS)[number];

export function isSessionFeedbackScenario(
  value: string,
): value is SessionFeedbackSceneScenario {
  return SESSION_FEEDBACK_SCENARIOS.some((scenario) => scenario === value);
}
