import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RsiBridge, executeRsiCommand, formatHabitsContext, formatRsiStatus } from "../index.js";

const config = {
  controlPlaneUrl: "http://127.0.0.1:4173/",
  project: "rsi-agent",
  authToken: "secret",
  pollIntervalMs: 15000,
  promptOrder: 900,
};

test("renders only controller-returned approved habits", () => {
  const text = formatHabitsContext([{
    title: "Run tests",
    trigger: "finishing code changes",
    behavior: "run targeted tests first",
  }]);
  assert.match(text, /Human-approved project habits/);
  assert.match(text, /Run tests: When finishing code changes, run targeted tests first/);
  assert.equal(formatHabitsContext([]), "");
});

test("refreshes scoped habits and forwards official feedback records", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/habits")) {
      return new Response(JSON.stringify({ habits: [{ title: "Be concise", trigger: "finishing", behavior: "summarize" }] }));
    }
    return new Response(JSON.stringify({ created: true }), { status: 201 });
  };
  const bridge = new RsiBridge({}, config, fetchImpl);
  await bridge.refresh();
  assert.match(bridge.contextText(), /Be concise/);
  assert.match(calls[0].url, /project=rsi-agent/);
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");

  const sent = await bridge.forwardFeedback({ id: "session-1" }, {
    type: "feedback/record",
    seq: 9,
    data: { text: "missing_verification | run tests" },
  });
  assert.equal(sent, true);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    eventId: "session-1:9",
    sessionId: "session-1",
    project: "rsi-agent",
    text: "missing_verification | run tests",
  });
});

test("ignores non-human session events", async () => {
  const bridge = new RsiBridge({}, config, async () => { throw new Error("must not fetch"); });
  assert.equal(await bridge.forwardFeedback({ id: "session-1" }, { type: "assistant/message" }), false);
});

test("retains failed feedback for retry and removes it after delivery", async () => {
  let attempts = 0;
  const bridge = new RsiBridge({}, config, async () => {
    attempts += 1;
    if (attempts === 1) return new Response("offline", { status: 503 });
    return new Response(JSON.stringify({ created: true }), { status: 201 });
  });
  bridge.enqueueFeedback({ id: "session-2" }, {
    type: "feedback/record",
    seq: 3,
    data: { text: "verbose_completion | shorter summaries" },
  });
  await assert.rejects(() => bridge.flushFeedback(), /HTTP 503/);
  assert.equal(bridge.pendingFeedback.size, 1);
  await bridge.flushFeedback();
  assert.equal(bridge.pendingFeedback.size, 0);
});

test("reports visible connection and approved-habit status", async () => {
  const bridge = new RsiBridge({}, config, async () => new Response(JSON.stringify({
    habits: [{ title: "Run tests", trigger: "finishing", behavior: "test" }],
  })));
  assert.match(formatRsiStatus(bridge), /RSI Agent: not connected/);
  const result = await executeRsiCommand(bridge, " refresh ", new AbortController().signal);
  assert.equal(result.kind, "success");
  assert.match(result.text, /RSI Agent: connected/);
  assert.match(result.text, /Approved habits loaded: 1/);
  assert.match(result.text, /- Run tests/);
});

test("rejects unknown RSI command actions without model work", async () => {
  const bridge = new RsiBridge({}, config, async () => { throw new Error("must not fetch"); });
  assert.deepEqual(await executeRsiCommand(bridge, "approve", new AbortController().signal), {
    kind: "error",
    text: "Usage: /rsi [status|refresh]",
  });
});

test("ships a Web client companion for visible command acknowledgements", async () => {
  const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
  assert.match(source, /command\/executed/);
  assert.match(source, /conversation\.input\.for\(sessionScope\)\.notify/);
});
