import { addFeedback, emptyState, transitionProposal } from "./core.js";

export function sampleWeek() {
  let state = emptyState();
  const samples = [
    ["run-101", "missing_verification", "I had to run the tests after the agent finished."],
    ["run-104", "missing_verification", "Two failures appeared when I ran pytest."],
    ["run-108", "missing_verification", "Please verify before saying the task is done."],
    ["run-112", "wrong_package_manager", "This repository uses pnpm."],
    ["run-114", "wrong_package_manager", "Replaced npm with pnpm again."],
    ["run-117", "wrong_package_manager", "Do not create package-lock.json."],
    ["run-120", "verbose_completion", "I only need outcome, checks, and risks."],
    ["run-123", "verbose_completion", "The completion note repeats the whole process."],
    ["run-128", "verbose_completion", "Please keep routine summaries short."],
  ];

  samples.forEach(([runId, category, note], index) => {
    state = addFeedback(state, {
      project: "rsi-agent",
      runId,
      category,
      note,
      id: `feedback-${index + 1}`,
    }, new Date(Date.UTC(2026, 8, 1, 9 + index)));
  });

  const verification = state.proposals.find((item) => item.category === "missing_verification");
  state = transitionProposal(state, verification.id, "trial", new Date(Date.UTC(2026, 8, 2, 9)));
  const packageManager = state.proposals.find((item) => item.category === "wrong_package_manager");
  state = transitionProposal(state, packageManager.id, "adopted", new Date(Date.UTC(2026, 8, 2, 10)));
  return state;
}
