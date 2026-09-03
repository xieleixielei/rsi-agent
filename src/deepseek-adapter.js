import { HABIT_CATALOG } from "./catalog.js";

// Maps the durable DeepSeek Harness session event stream into RSI feedback.
// The adapter is deliberately narrow: it accepts only explicit human feedback
// events and never treats arbitrary model text as approval or feedback.
const CATEGORY_ALIASES = Object.freeze({
  test: "missing_verification",
  tests: "missing_verification",
  verification: "missing_verification",
  package_manager: "wrong_package_manager",
  package: "wrong_package_manager",
  concise: "verbose_completion",
  verbosity: "verbose_completion",
});

export function parseHarnessFeedbackText(text) {
  const normalized = text.trim();
  const structured = /^(?:\[([^\]]+)\]|([a-z][a-z0-9_-]*))\s*(?:\||:|-)\s*(.*)$/s.exec(normalized);
  if (!structured) return { category: "unclassified", note: normalized };

  const requested = (structured[1] ?? structured[2]).trim().toLowerCase().replaceAll("-", "_");
  const category = HABIT_CATALOG[requested] ? requested : CATEGORY_ALIASES[requested];
  if (!category) return { category: "unclassified", note: normalized };
  return { category, note: structured[3].trim() || normalized };
}

export function feedbackFromHarnessRecord(sessionId, event, defaults = {}) {
  if (event.type !== "feedback/record") return undefined;
  const parsed = parseHarnessFeedbackText(event.data?.text ?? "");
  return {
    id: defaults.id ?? `${sessionId}:${event.seq}`,
    source: "deepseek_harness_session",
    explicit: true,
    project: defaults.project,
    runId: sessionId,
    category: defaults.category ?? parsed.category,
    note: parsed.note,
  };
}

export function feedbackFromSessionEvents(events, defaults = {}) {
  return events
    .filter((event) => event.type === "rsi/human-feedback" || event.type === "feedback/record")
    .map((event) => {
      if (event.type === "feedback/record") {
        return feedbackFromHarnessRecord(event.sessionId ?? defaults.runId, event, defaults);
      }
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
