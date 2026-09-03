import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../src/server.js";
import { JsonStore } from "../src/store.js";

async function withServer(callback, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "rsi-agent-test-"));
  const server = createAppServer({
    store: new JsonStore(join(directory, "state.json")),
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

async function postFeedback(baseUrl, eventId, sessionId) {
  return fetch(`${baseUrl}/api/integrations/deepseek/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId,
      sessionId,
      project: "rsi-agent",
      text: "missing_verification | run targeted tests before finishing",
    }),
  });
}

test("ingests idempotent Harness feedback and serves adopted habits", async () => {
  await withServer(async (baseUrl) => {
    for (const [index, sessionId] of ["session-1", "session-2", "session-3"].entries()) {
      const response = await postFeedback(baseUrl, `${sessionId}:4`, sessionId);
      assert.equal(response.status, 201);
      if (index === 0) {
        const duplicate = await postFeedback(baseUrl, `${sessionId}:4`, sessionId);
        assert.equal(duplicate.status, 200);
        assert.equal((await duplicate.json()).created, false);
      }
    }

    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    assert.equal(state.feedback.length, 3);
    assert.equal(state.proposals.length, 1);

    await fetch(`${baseUrl}/api/proposals/${state.proposals[0].id}/adopted`, { method: "POST" });
    const habits = await (await fetch(`${baseUrl}/api/integrations/deepseek/habits?project=rsi-agent`)).json();
    assert.equal(habits.habits.length, 1);
    assert.equal(habits.habits[0].id, state.proposals[0].id);
  });
});

test("protects integration endpoints when a token is configured", async () => {
  await withServer(async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/integrations/deepseek/habits?project=rsi-agent`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${baseUrl}/api/integrations/deepseek/habits?project=rsi-agent`, {
      headers: { authorization: "Bearer secret" },
    });
    assert.equal(allowed.status, 200);
  }, { integrationToken: "secret" });
});
