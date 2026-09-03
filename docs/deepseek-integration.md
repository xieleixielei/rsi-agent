# DeepSeek Harness integration

DeepSeek Harness is the execution plane; RSI Agent is the trusted adaptation control plane.

## Event ingestion

A small Cordis plugin should expose feedback actions in the Harness UI and append explicit events to the durable session stream:

```json
{
  "id": "feedback-1042",
  "type": "rsi/human-feedback",
  "sessionId": "session-183",
  "payload": {
    "project": "rsi-agent",
    "category": "missing_verification",
    "note": "I had to run pytest after completion"
  }
}
```

`src/deepseek-adapter.js` demonstrates the trust boundary: it imports only explicit `rsi/human-feedback` events. Assistant messages cannot approve changes or masquerade as human feedback.

## Habit application

In the next slice, adopted habits should be rendered into a project-scoped prompt section through a dedicated plugin. Trial habits should use a separate DeepSeek Harness home/profile so they cannot mutate the stable profile.

```text
stable profile + adopted habits -> normal sessions
stable profile + trial patch    -> isolated trial sessions
```

## Components that remain trusted

- feedback event authentication
- proposal state machine
- approval UI
- audit log
- sandbox and permission policy
- evaluation and promotion rules

The evolver may propose changes to prompt, skills, tools, middleware, and eventually the agent loop. It cannot change these trusted components.
