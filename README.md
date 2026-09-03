# RSI Agent

RSI Agent is a human-guided adaptation layer for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It turns repeated corrections from normal agent use into scoped, explainable habit proposals. Nothing changes until a person approves it.

This repository contains a product demo of the core loop plus an installable Cordis bundle for DeepSeek Harness:

```text
human feedback -> repeated-pattern detection -> proposal -> trial -> adoption or rollback
```

## Run the demo

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm start
```

Open <http://127.0.0.1:4173>. The demo stores state in `.data/state.json`; it sends nothing to third parties.

Run tests with:

```bash
pnpm test
```

## What to try

1. Add the same kind of correction three times across at least two tasks.
2. Inspect the generated proposal, its evidence, scope, and tradeoff.
3. Approve a trial, then adopt or undo the habit.
4. Use **Load sample week** to see several product states at once.

## Connect DeepSeek Harness

The plugin reuses Harness's built-in, human-only `/feedback` command. It forwards the resulting durable `feedback/record` events to this control plane, then polls back only habits that a person has adopted:

```bash
dsh plugin --profile web add ./plugins/deepseek-harness-rsi
RSI_PROJECT=rsi-agent RSI_CONTROL_PLANE_URL=http://127.0.0.1:4173 dsh web
```

Inside Harness:

```text
/feedback missing_verification | Please run targeted tests before finishing
```

See [plugins/deepseek-harness-rsi/README.md](plugins/deepseek-harness-rsi/README.md) for configuration and the shared-token option.

## Trust boundary

The control plane still works without a DeepSeek API key. The plugin follows DeepSeek Harness's current Cordis bundle, dynamic prompt-context, and append-only Session event interfaces; see [docs/deepseek-integration.md](docs/deepseek-integration.md).

Approval rules live outside evolvable configuration. The agent may propose a change, but it cannot approve, promote, or hide it.
