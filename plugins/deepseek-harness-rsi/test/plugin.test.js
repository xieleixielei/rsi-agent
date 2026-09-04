import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RsiBridge, executeRsiCommand, formatHabitsContext, formatRsiStatus } from "../index.js";
import { ImprovementManager, createPluginApi, renderGeneratedPlugin, validateImprovementSpec } from "../improvement-manager.js";

const config = {
  controlPlaneUrl: "http://127.0.0.1:4173/",
  project: "rsi-agent",
  authToken: "secret",
  pollIntervalMs: 15000,
  promptOrder: 900,
  apiKeyEnv: "DEEPSEEK_API_KEY",
  deepSeekApiBaseUrl: "https://api.deepseek.com",
  deepSeekModel: "deepseek-v4-flash",
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
    text: "Usage: /rsi [status|refresh|improve <content>]",
  });
});

test("uses the improvement manager for proactive improvements", async () => {
  const calls = [];
  const bridge = new RsiBridge({}, config, undefined, { generate: async (content) => {
    calls.push(content);
    return { id: "targeted-tests-1", title: "Run targeted tests" };
  } });
  const result = await executeRsiCommand(
    bridge,
    "improve run targeted tests first",
    new AbortController().signal,
    { commandId: "cmd-7", agent: { session: { id: "session-3" } } },
  );
  assert.equal(result.kind, "success");
  assert.match(result.text, /created and loaded/);
  assert.deepEqual(calls, ["run targeted tests first"]);
});

test("validates specifications and renders prompt as inert source text", () => {
  const spec = validateImprovementSpec({ slug: "verify-first", title: "Verify first", description: "Runs verification", prompt: "Verify before finishing. ` ${danger}" });
  const source = renderGeneratedPlugin(spec);
  assert.match(source, /rsi-generated-verify-first/);
  assert.match(source, /Verify before finishing/);
  assert.doesNotMatch(source, /text: \(\) => `Verify/);
  assert.throws(() => validateImprovementSpec({ slug: "../bad", title: "Bad", description: "Bad", prompt: "Bad" }), /slug/);
});

test("reuses Harness credentials and can load and unload generated plugins", async () => {
  const managedPluginDir = await mkdtemp(path.join(tmpdir(), "rsi-generated-test-"));
  const loaderCalls = [];
  const ctx = {
    credentials: { resolve: async (ref) => {
      assert.equal(String(ref), "DEEPSEEK_API_KEY");
      return { value: "configured-secret", source: "test" };
    } },
    loader: {
      create: async ({ name }) => { loaderCalls.push(["create", name]); return "entry-1"; },
      remove: async (id) => { loaderCalls.push(["remove", id]); },
    },
    logger: { warn() {} },
  };
  const manager = new ImprovementManager(ctx, { ...config, managedPluginDir }, async (url, options) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal(options.headers.authorization, "Bearer configured-secret");
    assert.equal(JSON.parse(options.body).model, "deepseek-v4-flash");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ slug: "verify-first", title: "Verify first", description: "Verify results before completion", prompt: "Always verify relevant results before completion." }) } }] });
  });
  await manager.initialize();
  const plugin = await manager.generate("verify before completion");
  assert.equal(plugin.enabled, true);
  assert.equal(loaderCalls[0][0], "create");
  assert.match(await readFile(path.join(managedPluginDir, plugin.id, "index.js"), "utf8"), /Always verify/);
  assert.equal((await manager.setEnabled(plugin.id, false)).enabled, false);
  assert.deepEqual(loaderCalls.at(-1), ["remove", "entry-1"]);
});

test("serves generated plugin metadata and toggle actions", async () => {
  const manager = {
    list: () => [{ id: "one", enabled: true }],
    setEnabled: async (id, enabled) => ({ id, enabled }),
  };
  const api = createPluginApi(manager);
  assert.deepEqual(await (await api(new Request("http://localhost/api/rsi/plugins"))).json(), { plugins: [{ id: "one", enabled: true }] });
  const response = await api(new Request("http://localhost/api/rsi/plugins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "one", enabled: false }) }));
  assert.deepEqual(await response.json(), { plugin: { id: "one", enabled: false } });
});

test("ships a Web client companion for visible command acknowledgements", async () => {
  const source = await readFile(new URL("../client.js", import.meta.url), "utf8");
  assert.match(source, /command\/executed/);
  assert.match(source, /conversation\.input\.for\(sessionScope\)\.notify/);
  assert.match(source, /data-rsi-card/);
  assert.match(source, /关闭 RSI Agent 卡片/);
  assert.match(source, /data-rsi-child-card/);
  assert.match(source, /卸载/);
  assert.match(source, /\/api\/rsi\/plugins/);
});
