// Maps the durable DeepSeek Harness session event stream into RSI feedback.
// The adapter is deliberately narrow: it only accepts explicit, user-originated
// annotations emitted by an RSI UI/plugin and never treats arbitrary model text
// as approval or feedback.
export function feedbackFromSessionEvents(events, defaults = {}) {
  return events
    .filter((event) => event.type === "rsi/human-feedback")
    .map((event) => {
      const payload = event.payload ?? event.data ?? {};
      return {
        id: event.id,
        source: "deepseek_harness_session",
        explicit: true,
        project: payload.project ?? defaults.project,
        runId: payload.runId ?? event.sessionId ?? defaults.runId,
        category: payload.category,
        note: payload.note ?? "",
      };
    });
}

export function parseSessionJsonl(jsonl, defaults = {}) {
  const events = jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSONL at line ${index + 1}`);
      }
    });
  return feedbackFromSessionEvents(events, defaults);
}
