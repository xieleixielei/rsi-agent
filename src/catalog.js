export const HABIT_CATALOG = Object.freeze({
  missing_verification: {
    title: "Run relevant tests before finishing",
    summary: "After changing code, run the most relevant tests before reporting completion.",
    trigger: "A code-changing task is about to finish",
    behavior: "Detect the project test command and run targeted tests first",
    benefit: "Reduce false completion and follow-up fixes",
    tradeoff: "Tasks may take a little longer",
    component: "verification-policy",
  },
  wrong_package_manager: {
    title: "Use pnpm in this project",
    summary: "Prefer pnpm commands whenever this repository has a pnpm lockfile.",
    trigger: "A JavaScript dependency or script command is needed",
    behavior: "Use pnpm instead of npm when pnpm-lock.yaml is present",
    benefit: "Avoid lockfile churn and repeated command corrections",
    tradeoff: "None when the repository declares pnpm",
    component: "tool-policy",
  },
  verbose_completion: {
    title: "Keep completion notes concise",
    summary: "Report the outcome, verification, and remaining risk without replaying every step.",
    trigger: "A routine task has completed successfully",
    behavior: "Use a compact three-part completion summary",
    benefit: "Make finished work faster to review",
    tradeoff: "Detailed reasoning remains available in the trajectory",
    component: "response-policy",
  },
});

export const FEEDBACK_LABELS = Object.freeze([
  { id: "missing_verification", label: "Tests were missing" },
  { id: "wrong_package_manager", label: "Wrong package manager" },
  { id: "verbose_completion", label: "Completion was too verbose" },
]);
