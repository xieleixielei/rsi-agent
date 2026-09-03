# DeepSeek Harness integration

DeepSeek Harness is the execution plane; RSI Agent is the trusted adaptation control plane.

## Implemented event ingestion

DeepSeek Harness already ships a human-facing `/feedback` command. It appends this official, log-only event without starting a model turn:

```json
{
  "type": "feedback/record",
  "seq": 14,
  "data": {
    "text": "missing_verification | I had to run pytest after completion"
  }
}
```

`plugins/deepseek-harness-rsi` listens only for `feedback/record`, sends an idempotency key of `{sessionId}:{seq}`, retries failed deliveries in memory, and replays non-inherited feedback when a session resumes. Fork-inherited feedback is not counted again. It never imports assistant output. `src/deepseek-adapter.js` accepts the official event plus the original prototype event for migration. Assistant messages cannot approve changes or masquerade as human feedback.

Structured feedback uses `<category> | <note>`. Unknown free text is preserved as `unclassified` and excluded from automatic proposal mining.

## Implemented habit application

The plugin polls `GET /api/integrations/deepseek/habits?project=...`. The endpoint returns only adopted habits for that project. The plugin renders them through `ctx.systemPrompt.context`, so Harness logs changed model-visible snapshots through its normal request reconstruction path. Trial habits still belong in a separate DeepSeek Harness home/profile so they cannot mutate the stable profile.

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

## Control-plane API

- `POST /api/integrations/deepseek/feedback` accepts `{ eventId, sessionId, project, text, category? }` and is idempotent by `eventId`.
- `GET /api/integrations/deepseek/habits?project=<name>` returns adopted habits only.
- Set `RSI_PLUGIN_TOKEN` on both processes to require a bearer token for these endpoints.
