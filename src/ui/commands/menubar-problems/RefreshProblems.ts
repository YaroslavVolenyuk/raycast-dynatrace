// No-view command behind the menu bar's Refresh / Retry items (and runnable from
// root search): fetches problems now, ignoring the refresh interval, then
// relaunches the menu bar command so it redraws with the new result.

import { LaunchType, environment, launchCommand, showHUD } from "@raycast/api";
import { loadProblems, problemCountLabel } from "./problemsStore";

export default async function RefreshProblems() {
  const result = await loadProblems(true);

  try {
    await launchCommand({ name: "dt-menubar-problems", type: LaunchType.Background });
  } catch {
    // Menu bar command disabled — nothing to redraw.
  }

  if (environment.launchType !== LaunchType.UserInitiated) return;
  if (result.state === "ok") {
    const count = problemCountLabel(result);
    await showHUD(`Dynatrace: ${count} open problem${count === "1" ? "" : "s"}`);
  } else if (result.state === "error") {
    await showHUD(`Dynatrace: ${result.error.summary}`);
  } else {
    await showHUD("Dynatrace: no tenant configured");
  }
}
