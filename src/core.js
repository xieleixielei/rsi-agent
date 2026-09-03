import { HABIT_CATALOG } from "./catalog.js";

export const PROPOSAL_STATUS = Object.freeze({
  PROPOSED: "proposed",
  TRIAL: "trial",
  ADOPTED: "adopted",
  IGNORED: "ignored",
  UNDONE: "undone",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  proposed: new Set(["trial", "adopted", "ignored"]),
  trial: new Set(["adopted", "undone"]),
  adopted: new Set(["undone"]),
  ignored: new Set(),
  undone: new Set(),
});

function unique(values) {
  return [...new Set(values)];
}

export function emptyState() {
  return { version: 1, feedback: [], proposals: [], audit: [] };
}

export function makeFeedback(input, now = new Date()) {
  if (input.category !== "unclassified" && !HABIT_CATALOG[input.category]) {
    throw new Error(`Unknown feedback category: ${input.category}`);
  }
  if (!input.project?.trim()) throw new Error("Project is required");
  if (!input.runId?.trim()) throw new Error("Run id is required");

  return {
    id: input.id ?? crypto.randomUUID(),
    createdAt: now.toISOString(),
    source: input.source ?? "human_correction",
    explicit: input.explicit ?? true,
    project: input.project.trim(),
    runId: input.runId.trim(),
    category: input.category,
    note: input.note?.trim() ?? "",
  };
}

export function addFeedback(state, input, now = new Date()) {
  if (input.id && state.feedback.some((item) => item.id === input.id)) return state;
  const feedback = makeFeedback(input, now);
  const next = structuredClone(state);
  next.feedback.push(feedback);
  next.audit.push({
    id: crypto.randomUUID(),
    at: now.toISOString(),
    actor: "human",
    action: "feedback.recorded",
    target: feedback.id,
  });
  next.proposals.push(...mineNewProposals(next, now));
  return next;
}

export function mineNewProposals(state, now = new Date(), thresholds = {}) {
  const minOccurrences = thresholds.minOccurrences ?? 3;
  const minDistinctTasks = thresholds.minDistinctTasks ?? 2;
  const groups = new Map();

  for (const item of state.feedback) {
    const key = `${item.project}:${item.category}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const existingKeys = new Set(state.proposals.map((proposal) => proposal.patternKey));
  const proposals = [];

  for (const [patternKey, evidence] of groups) {
    if (existingKeys.has(patternKey)) continue;
    const taskCount = unique(evidence.map((item) => item.runId)).length;
    if (evidence.length < minOccurrences || taskCount < minDistinctTasks) continue;

    const latest = evidence.at(-1);
    const catalog = HABIT_CATALOG[latest.category];
    if (!catalog) continue;
    const explicitRatio = evidence.filter((item) => item.explicit).length / evidence.length;
    const confidence = Math.min(0.95, 0.55 + evidence.length * 0.07 + taskCount * 0.04 + explicitRatio * 0.08);

    proposals.push({
      id: `proposal-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: now.toISOString(),
      patternKey,
      project: latest.project,
      category: latest.category,
      title: catalog.title,
      summary: catalog.summary,
      trigger: catalog.trigger,
      behavior: catalog.behavior,
      benefit: catalog.benefit,
      tradeoff: catalog.tradeoff,
      component: catalog.component,
      status: PROPOSAL_STATUS.PROPOSED,
      evidenceIds: evidence.map((item) => item.id),
      occurrences: evidence.length,
      distinctTasks: taskCount,
      confidence: Number(confidence.toFixed(2)),
      trialRuns: 0,
    });
  }

  return proposals;
}

export function transitionProposal(state, proposalId, targetStatus, now = new Date()) {
  const next = structuredClone(state);
  const proposal = next.proposals.find((item) => item.id === proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (!ALLOWED_TRANSITIONS[proposal.status]?.has(targetStatus)) {
    throw new Error(`Cannot transition ${proposal.status} to ${targetStatus}`);
  }

  const previous = proposal.status;
  proposal.status = targetStatus;
  proposal.updatedAt = now.toISOString();
  if (targetStatus === PROPOSAL_STATUS.TRIAL) proposal.trialStartedAt = now.toISOString();
  if (targetStatus === PROPOSAL_STATUS.ADOPTED) proposal.adoptedAt = now.toISOString();
  if (targetStatus === PROPOSAL_STATUS.UNDONE) proposal.undoneAt = now.toISOString();

  next.audit.push({
    id: crypto.randomUUID(),
    at: now.toISOString(),
    actor: "human",
    action: `proposal.${targetStatus}`,
    target: proposal.id,
    from: previous,
  });
  return next;
}

export function summarizeState(state) {
  return {
    corrections: state.feedback.length,
    proposed: state.proposals.filter((item) => item.status === "proposed").length,
    trial: state.proposals.filter((item) => item.status === "trial").length,
    adopted: state.proposals.filter((item) => item.status === "adopted").length,
  };
}

export function publicState(state) {
  return { ...state, metrics: summarizeState(state) };
}

export function adoptedHabits(state, project) {
  if (!project?.trim()) throw new Error("Project is required");
  return state.proposals
    .filter((proposal) => proposal.project === project.trim() && proposal.status === PROPOSAL_STATUS.ADOPTED)
    .map(({ id, title, trigger, behavior, component, adoptedAt, updatedAt }) => ({
      id,
      title,
      trigger,
      behavior,
      component,
      adoptedAt,
      updatedAt,
    }));
}
