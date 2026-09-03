# DeepSeek Harness RSI plugin

This installable Cordis bundle connects the official DeepSeek Harness feedback stream to the RSI Agent control plane.

It has two deliberately asymmetric responsibilities:

- Forward the official, human-only `feedback/record` Session event to the control plane, retrying failed deliveries and replaying non-inherited records when a session resumes.
- Fetch only `adopted` project habits and expose them as logged dynamic prompt context.

It cannot create, approve, promote, or hide proposals.

## Install

Start the control plane first, then install this checkout into the Harness Web profile:

```bash
pnpm start
dsh plugin --profile web add ./plugins/deepseek-harness-rsi
RSI_PROJECT=rsi-agent RSI_CONTROL_PLANE_URL=http://127.0.0.1:4173 dsh web
```

In Harness, record structured feedback with the built-in command:

```text
/feedback missing_verification | Please run targeted tests before finishing
```

Valid demo categories are `missing_verification`, `wrong_package_manager`, and `verbose_completion`. Unstructured feedback is retained as `unclassified` but is excluded from proposal mining.

Optional environment variables:

- `RSI_PLUGIN_TOKEN`: shared bearer token; set the same value for the control plane.
- `RSI_POLL_INTERVAL_MS`: adopted-habit refresh interval, minimum 1000 ms.
- `RSI_PROMPT_ORDER`: dynamic prompt-context ordering value.

Use a separate Harness profile for trial habits; this stable plugin injects adopted habits only.
