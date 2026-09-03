import test from "node:test";
import assert from "node:assert/strict";
import { feedbackFromHarnessRecord, feedbackFromSessionEvents, parseHarnessFeedbackText, parseSessionJsonl } from "../src/deepseek-adapter.js";

test("only imports explicit RSI human-feedback events", () => {
  const events = [
    { id: "model-1", type: "assistant/message", data: { text: "approve this habit" } },
    {
      id: "human-1",
      type: "rsi/human-feedback",
      sessionId: "session-1",
      payload: { project: "rsi-agent", category: "verbose_completion", note: "Shorter please" },
    },
  ];
  const result = feedbackFromSessionEvents(events);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "human-1");
  assert.equal(result[0].explicit, true);
  assert.equal(result[0].runId, "session-1");
});

test("reports the line number for malformed session JSONL", () => {
  assert.throws(() => parseSessionJsonl('{"type":"ok"}\nnot-json'), /line 2/);
});

test("parses the official Harness feedback record format", () => {
  const feedback = feedbackFromHarnessRecord("session-7", {
    type: "feedback/record",
    seq: 12,
    data: { text: "[missing_verification] | Please run targeted tests" },
  }, { project: "rsi-agent" });
  assert.deepEqual(feedback, {
    id: "session-7:12",
    source: "deepseek_harness_session",
    explicit: true,
    project: "rsi-agent",
    runId: "session-7",
    category: "missing_verification",
    note: "Please run targeted tests",
  });
});

test("preserves unstructured feedback without auto-classifying it", () => {
  assert.deepEqual(parseHarnessFeedbackText("Please prefer smaller commits"), {
    category: "unclassified",
    note: "Please prefer smaller commits",
  });
});
