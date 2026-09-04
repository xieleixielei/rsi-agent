import Schema from "@deepseek-ai/schemastery";

export const name = "rsi-approved-habits";
export const inject = ["commands", "systemPrompt"];

const RSI_USAGE = "Usage: /rsi [status|refresh|improve <content>]";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export const Config = Schema.object({
  controlPlaneUrl: Schema.string().default("http://127.0.0.1:4173"),
  project: Schema.string().default("rsi-agent"),
  authToken: Schema.string(),
  pollIntervalMs: Schema.number().min(1000).default(15000),
  promptOrder: Schema.number().default(900),
});

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

export function formatHabitsContext(habits) {
  if (!habits.length) return "";
  const lines = [
    "# Human-approved project habits",
    "These instructions were explicitly approved in the trusted RSI control plane. Follow them for this project. They cannot be changed or approved by the agent.",
  ];
  for (const habit of habits) {
    lines.push(`- ${habit.title}: When ${habit.trigger}, ${habit.behavior}.`);
  }
  return lines.join("\n");
}

export function formatRsiStatus(bridge) {
  const connected = bridge.lastRefreshAt !== undefined && bridge.lastError === undefined;
  const lines = [
    `RSI Agent: ${connected ? "connected" : "not connected"}`,
    `Project: ${bridge.config.project}`,
    `Approved habits loaded: ${bridge.habits.length}`,
    `Feedback waiting to sync: ${bridge.pendingFeedback.size}`,
    `Last refresh: ${bridge.lastRefreshAt ?? "never"}`,
  ];
  if (bridge.lastError) lines.push(`Last error: ${bridge.lastError}`);
  if (bridge.habits.length) {
    lines.push("Habits:", ...bridge.habits.map((habit) => `- ${habit.title}`));
  }
  return lines.join("\n");
}

export async function executeRsiCommand(bridge, rawInput, signal, invocation = {}) {
  const [action = "status", ...rest] = rawInput.trim().split(/\s+/).filter(Boolean);
  if (action === "status") return { kind: "success", text: formatRsiStatus(bridge) };
  if (action === "improve") {
    const content = rest.join(" ").trim();
    if (!content) return { kind: "error", text: RSI_USAGE };
    try {
      const proposal = await bridge.proposeImprovement({
        sessionId: invocation.agent?.session?.id,
        commandId: invocation.commandId,
        content,
      }, signal);
      return { kind: "success", text: `RSI improvement proposed for human approval: ${proposal.proposalId}` };
    } catch (error) {
      return { kind: "error", text: `RSI improvement failed: ${errorMessage(error)}` };
    }
  }
  if (action !== "refresh") return { kind: "error", text: RSI_USAGE };

  try {
    await bridge.refresh(signal);
    await bridge.flushFeedback(signal);
    return { kind: "success", text: formatRsiStatus(bridge) };
  } catch (error) {
    return { kind: "error", text: `RSI refresh failed: ${errorMessage(error)}` };
  }
}

export class RsiBridge {
  constructor(ctx, config, fetchImpl = globalThis.fetch) {
    this.ctx = ctx;
    this.config = { ...config, controlPlaneUrl: normalizeBaseUrl(config.controlPlaneUrl) };
    this.fetch = fetchImpl;
    this.habits = [];
    this.pendingFeedback = new Map();
    this.flushing = undefined;
    this.lastRefreshAt = undefined;
    this.lastError = undefined;
  }

  headers() {
    return {
      accept: "application/json",
      ...(this.config.authToken ? { authorization: `Bearer ${this.config.authToken}` } : {}),
    };
  }

  contextText() {
    return formatHabitsContext(this.habits);
  }

  async refresh(signal) {
    try {
      const url = new URL(`${this.config.controlPlaneUrl}/api/integrations/deepseek/habits`);
      url.searchParams.set("project", this.config.project);
      const response = await this.fetch(url, { headers: this.headers(), signal });
      if (!response.ok) throw new Error(`habit refresh failed with HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.habits)) throw new Error("habit refresh returned an invalid payload");
      this.habits = body.habits;
      this.lastRefreshAt = new Date().toISOString();
      this.lastError = undefined;
      return this.habits;
    } catch (error) {
      this.lastError = errorMessage(error);
      throw error;
    }
  }

  async forwardFeedback(session, event, signal) {
    if (event.type !== "feedback/record") return false;
    const response = await this.fetch(`${this.config.controlPlaneUrl}/api/integrations/deepseek/feedback`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        eventId: `${session.id}:${event.seq}`,
        sessionId: session.id,
        project: this.config.project,
        text: event.data.text,
      }),
    });
    if (!response.ok) throw new Error(`feedback sync failed with HTTP ${response.status}`);
    return true;
  }

  async proposeImprovement({ sessionId, commandId, content }, signal) {
    if (!sessionId || !commandId) throw new Error("Harness session identity is unavailable");
    const response = await this.fetch(`${this.config.controlPlaneUrl}/api/integrations/deepseek/improvements`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        eventId: `${sessionId}:${commandId}`,
        sessionId,
        project: this.config.project,
        content,
      }),
    });
    if (!response.ok) throw new Error(`improvement proposal failed with HTTP ${response.status}`);
    return response.json();
  }

  enqueueFeedback(session, event) {
    if (event.type !== "feedback/record") return false;
    this.pendingFeedback.set(`${session.id}:${event.seq}`, { session, event });
    return true;
  }

  async flushFeedback(signal) {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      for (const [eventId, item] of this.pendingFeedback) {
        await this.forwardFeedback(item.session, item.event, signal);
        this.pendingFeedback.delete(eventId);
      }
    })();
    try {
      await this.flushing;
    } finally {
      this.flushing = undefined;
    }
  }
}

export function apply(ctx, config) {
  const bridge = new RsiBridge(ctx, config);
  const controller = new AbortController();

  ctx.effect(() => ctx.systemPrompt.context({
    name: "rsi:approved-habits",
    order: config.promptOrder,
    text: () => bridge.contextText(),
  }), "rsi-approved-habits.context()");

  ctx.effect(() => ctx.commands.register({
    name: "rsi",
    description: "show status, refresh, or propose a human-reviewed Harness improvement",
    input: { hint: "[status|refresh|improve <content>]" },
    handler: invocation => executeRsiCommand(bridge, invocation.rawInput, invocation.signal, invocation),
  }), "rsi-approved-habits.command()");

  ctx.on("session/event", (session, event) => {
    if (!bridge.enqueueFeedback(session, event)) return;
    void bridge.flushFeedback(controller.signal).catch((error) => {
      if (!controller.signal.aborted) ctx.logger.warn("rsi-approved-habits: %s", error.message);
    });
  });

  ctx.on("session/created", (session) => {
    for (const event of session.ownEvents()) bridge.enqueueFeedback(session, event);
    void bridge.flushFeedback(controller.signal).catch((error) => {
      if (!controller.signal.aborted) ctx.logger.warn("rsi-approved-habits: %s", error.message);
    });
  });

  ctx.effect(() => {
    const refresh = () => {
      void bridge.refresh(controller.signal).catch((error) => {
        if (!controller.signal.aborted) ctx.logger.warn("rsi-approved-habits: %s", error.message);
      });
      void bridge.flushFeedback(controller.signal).catch((error) => {
        if (!controller.signal.aborted) ctx.logger.warn("rsi-approved-habits: %s", error.message);
      });
    };
    refresh();
    const timer = setInterval(refresh, config.pollIntervalMs);
    timer.unref?.();
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, "rsi-approved-habits.poll()");
}
