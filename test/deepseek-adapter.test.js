import test from "node:test";
import assert from "node:assert/strict";
import { feedbackFromSessionEvents, parseSessionJsonl } from "../src/deepseek-adapter.js";

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
