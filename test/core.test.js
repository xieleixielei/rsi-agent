import test from "node:test";
import assert from "node:assert/strict";
import { addFeedback, adoptedHabits, emptyState, mineNewProposals, transitionProposal } from "../src/core.js";

function correction(runId, overrides = {}) {
  return {
    project: "rsi-agent",
    runId,
    category: "missing_verification",
    note: "Run tests before finishing",
    ...overrides,
  };
}

test("does not propose a habit from isolated feedback", () => {
  let state = emptyState();
  state = addFeedback(state, correction("run-1"));
  state = addFeedback(state, correction("run-2"));
  assert.equal(state.proposals.length, 0);
});

test("proposes a scoped habit after repeated feedback across tasks", () => {
  let state = emptyState();
  state = addFeedback(state, correction("run-1"));
  state = addFeedback(state, correction("run-2"));
  state = addFeedback(state, correction("run-3"));

  assert.equal(state.proposals.length, 1);
  assert.equal(state.proposals[0].project, "rsi-agent");
  assert.equal(state.proposals[0].occurrences, 3);
  assert.equal(state.proposals[0].distinctTasks, 3);
  assert.equal(state.proposals[0].status, "proposed");
});

test("does not merge feedback across project scopes", () => {
  const state = {
    ...emptyState(),
    feedback: [
      { ...correction("run-1"), id: "1", explicit: true },
      { ...correction("run-2"), id: "2", explicit: true },
      { ...correction("run-3", { project: "another-project" }), id: "3", explicit: true },
    ],
  };
  assert.equal(mineNewProposals(state).length, 0);
});

test("requires human-controlled proposal state transitions", () => {
  let state = emptyState();
  state = addFeedback(state, correction("run-1"));
  state = addFeedback(state, correction("run-2"));
  state = addFeedback(state, correction("run-3"));
  const id = state.proposals[0].id;

  assert.throws(() => transitionProposal(state, id, "undone"), /Cannot transition/);
  state = transitionProposal(state, id, "trial");
  assert.equal(state.proposals[0].status, "trial");
  state = transitionProposal(state, id, "adopted");
  assert.equal(state.proposals[0].status, "adopted");
  state = transitionProposal(state, id, "undone");
  assert.equal(state.proposals[0].status, "undone");
});

test("does not recreate an ignored proposal", () => {
  let state = emptyState();
  state = addFeedback(state, correction("run-1"));
  state = addFeedback(state, correction("run-2"));
  state = addFeedback(state, correction("run-3"));
  state = transitionProposal(state, state.proposals[0].id, "ignored");
  state = addFeedback(state, correction("run-4"));
  assert.equal(state.proposals.length, 1);
  assert.equal(state.proposals[0].status, "ignored");
});

test("deduplicates feedback using the Harness event id", () => {
  let state = emptyState();
  state = addFeedback(state, correction("session-1", { id: "session-1:4" }));
  state = addFeedback(state, correction("session-1", { id: "session-1:4" }));
  assert.equal(state.feedback.length, 1);
  assert.equal(state.audit.length, 1);
});

test("only exposes adopted habits for the requested project", () => {
  let state = emptyState();
  state = addFeedback(state, correction("run-1"));
  state = addFeedback(state, correction("run-2"));
  state = addFeedback(state, correction("run-3"));
  state = transitionProposal(state, state.proposals[0].id, "adopted");
  assert.equal(adoptedHabits(state, "rsi-agent").length, 1);
  assert.equal(adoptedHabits(state, "another-project").length, 0);
});

test("keeps unclassified feedback without proposing from it", () => {
  let state = emptyState();
  for (const runId of ["run-1", "run-2", "run-3"]) {
    state = addFeedback(state, correction(runId, { category: "unclassified", note: "Something else" }));
  }
  assert.equal(state.feedback.length, 3);
  assert.equal(state.proposals.length, 0);
});
