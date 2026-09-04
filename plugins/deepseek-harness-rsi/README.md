# DeepSeek Harness RSI plugin

This installable Cordis bundle connects the official DeepSeek Harness feedback stream to the RSI Agent control plane.

It has two deliberately asymmetric responsibilities:

- Forward the official, human-only `feedback/record` Session event to the control plane, retrying failed deliveries and replaying non-inherited records when a session resumes.
- Fetch only `adopted` project habits and expose them as logged dynamic prompt context.

It cannot create, approve, promote, or hide proposals.

## Session command

The bundle registers a human command that appears in Harness command discovery and runs without a model turn:

```text
/rsi
/rsi status
/rsi refresh
/rsi improve <improvement content>
```

`status` shows the control-plane connection, project scope, loaded approved habits, pending feedback, and last refresh. `refresh` synchronizes immediately before showing the same report. No `/rsi` action can approve or mutate a proposal.

The package also ships a Web client companion. It shows an RSI Agent card above the composer by default, lets the user close that card for the current view, and mirrors each `/rsi` result into the composer notice area. This keeps status visible even in a brand-new session, where Harness may not yet display persistent command lifecycle rows.

`/rsi improve <content>` resolves the existing `DEEPSEEK_API_KEY` credential through Harness, asks DeepSeek for a constrained prompt-plugin specification, validates it, creates deterministic local plugin code, and loads it immediately. Generated improvements appear as child cards in the RSI card and can be loaded or unloaded at any time.

The DeepSeek model never supplies executable JavaScript. Only its validated prompt text is embedded in a fixed plugin template, and credential values are neither logged nor persisted by this plugin.

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
