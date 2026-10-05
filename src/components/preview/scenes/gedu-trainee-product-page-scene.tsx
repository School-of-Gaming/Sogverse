"use client";

import { useState } from "react";
import { TraineeWorkspace } from "@/components/gedu/session-details/TraineeProductPage";
import { buildTraineeWorkspaceFixture } from "@/components/gedu/session-details/mock-trainee-fixtures";
import { useNow } from "@/providers";

/**
 * The group workspace as a **trainee** meets it: the real trainee shell over the
 * club scenario's fixture, redacted as the trainee reads redact it.
 *
 * Nothing here is faked beyond the documents: every private field is filler
 * under a blur, every write is the locked control that explains itself, and
 * every editor still opens and takes typing — which is the page the owner's
 * rule describes. Compare it with the club scenario, which is the same group
 * as its assigned gedu sees it.
 *
 * Built once from the first `useNow()`, like the other workspace scenes, so a
 * tick does not rebuild the term under somebody reading it.
 */
export function GeduTraineeProductPageScene() {
  const now = useNow();
  const [fixture] = useState(() => buildTraineeWorkspaceFixture(now));
  return <TraineeWorkspace product={fixture.product} feed={fixture.feed} />;
}
