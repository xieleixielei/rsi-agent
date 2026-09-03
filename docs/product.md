# Product brief

## Promise

RSI Agent helps an agent stop repeating the same correction. It observes only task-scoped feedback, recognizes recurring friction, explains a narrowly scoped habit, and waits for a person to decide whether to try or adopt it.

## Product loop

1. A person works normally with an agent.
2. Explicit corrections are recorded as immutable feedback events.
3. The habit miner looks for recurrence across distinct tasks inside the same scope.
4. The agent proposes a behavior change with evidence, benefit, and tradeoff.
5. A person chooses **Try it**, **Adopt**, or **Ignore**.
6. Every decision is audited and adopted behavior remains reversible.

The demo intentionally triggers proposals only after three matching corrections across at least two tasks. This is a product default, not a claim that three observations are statistically sufficient for every behavior.

## Trust model

- Agent-generated text is never interpreted as approval.
- Only an explicit human UI action changes proposal status.
- Feedback is project-scoped by default.
- State stays local in the demo.
- Approval policy and audit history are outside the evolvable surface.

## North-star metric

Repeated Correction Rate: the share of completed tasks that require a correction the user has already made before.

## Next product slice

Replace synthetic input with a DeepSeek Harness plugin that emits `rsi/human-feedback` session events, then inject adopted habits as scoped system-prompt sections. Keep proposal approval in this trusted control plane.
