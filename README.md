# RSI Agent

RSI Agent is a human-guided adaptation layer for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It turns repeated corrections from normal agent use into scoped, explainable habit proposals. Nothing changes until a person approves it.

This repository currently contains a dependency-free product demo of the core loop:

```text
human feedback -> repeated-pattern detection -> proposal -> trial -> adoption or rollback
```

## Run the demo

Requirements: Node.js 20 or newer.

```bash
npm start
```

Open <http://127.0.0.1:4173>. The demo stores state in `.data/state.json` and never sends data over the network.

Run tests with:

```bash
npm test
```

## What to try

1. Add the same kind of correction three times across at least two tasks.
2. Inspect the generated proposal, its evidence, scope, and tradeoff.
3. Approve a trial, then adopt or undo the habit.
4. Use **Load sample week** to see several product states at once.

## Current boundary

The demo uses synthetic task events so it works without a DeepSeek API key. The event model and adapter seam are designed for DeepSeek Harness's append-only session log; see [docs/deepseek-integration.md](docs/deepseek-integration.md).

Approval rules live outside evolvable configuration. The agent may propose a change, but it cannot approve, promote, or hide it.
