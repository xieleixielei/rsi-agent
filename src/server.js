import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addFeedback, adoptedHabits, emptyState, publicState, transitionProposal } from "./core.js";
import { FEEDBACK_LABELS } from "./catalog.js";
import { parseHarnessFeedbackText } from "./deepseek-adapter.js";
import { sampleWeek } from "./sample.js";
import { JsonStore } from "./store.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(root, "public");
const defaultStore = new JsonStore(process.env.RSI_STATE_PATH ?? join(root, ".data/state.json"));
const port = Number(process.env.PORT ?? 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(pathname, response) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(publicDir, relative);
  if (!path.startsWith(`${publicDir}/`)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  try {
    const content = await readFile(path);
    response.writeHead(200, { "content-type": mimeTypes[extname(path)] ?? "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") sendJson(response, 404, { error: "Not found" });
    else throw error;
  }
}

export function createAppServer(options = {}) {
  const store = options.store ?? defaultStore;
  const integrationToken = options.integrationToken ?? process.env.RSI_PLUGIN_TOKEN;
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, { ...publicState(await store.read()), feedbackLabels: FEEDBACK_LABELS });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/feedback") {
        const input = await readJson(request);
        const state = await store.update((current) => addFeedback(current, input));
        sendJson(response, 201, publicState(state));
        return;
      }

      if (url.pathname.startsWith("/api/integrations/deepseek/")) {
        const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
        if (integrationToken && supplied !== integrationToken) {
          sendJson(response, 401, { error: "Invalid integration token" });
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/api/integrations/deepseek/feedback") {
        const input = await readJson(request);
        if (!input.eventId?.trim()) throw new Error("Event id is required");
        if (!input.sessionId?.trim()) throw new Error("Session id is required");
        if (!input.text?.trim()) throw new Error("Feedback text is required");
        const parsed = parseHarnessFeedbackText(input.text);
        const feedback = {
          id: input.eventId,
          source: "deepseek_harness_session",
          explicit: true,
          project: input.project,
          runId: input.sessionId,
          category: input.category ?? parsed.category,
          note: parsed.note,
        };
        let created = false;
        const state = await store.update((current) => {
          created = !current.feedback.some((item) => item.id === feedback.id);
          return addFeedback(current, feedback);
        });
        sendJson(response, created ? 201 : 200, { created, feedbackId: feedback.id, metrics: publicState(state).metrics });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/integrations/deepseek/habits") {
        const project = url.searchParams.get("project");
        const state = await store.read();
        sendJson(response, 200, { version: state.version, project, habits: adoptedHabits(state, project) });
        return;
      }

      const actionMatch = url.pathname.match(/^\/api\/proposals\/([^/]+)\/([^/]+)$/);
      if (request.method === "POST" && actionMatch) {
        const [, proposalId, action] = actionMatch;
        const state = await store.update((current) => transitionProposal(current, proposalId, action));
        sendJson(response, 200, publicState(state));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/demo/sample") {
        const state = sampleWeek();
        await store.write(state);
        sendJson(response, 200, publicState(state));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/demo/reset") {
        const state = emptyState();
        await store.write(state);
        sendJson(response, 200, publicState(state));
        return;
      }

      if (request.method === "GET") {
        await serveStatic(url.pathname, response);
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`RSI Agent demo: http://127.0.0.1:${port}`);
  });
}
