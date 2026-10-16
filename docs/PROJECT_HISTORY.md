# Project history

## 2026-10-16

Published the pilot study and its reproducible offline analysis. Added a separate future-only v2 entrypoint so normal future runs automatically learn operational dispatch settings from successful throughput and overload, without editing the archived harness. Each new run owns a fresh explicit output directory; explicit same-protocol resume retains completed-question checkpoints and preserves existing result bytes. Startup verifies the frozen dependency/input hash manifest and refuses to overwrite corrupt or unrelated state. Synthetic tests verify real subprocess wiring and no extra provider attempts; no paid runs or measured live gain.

## Open items

- Owner-authorized future paid experiments can measure actual operational benefit; keep their protocol/results separate from the paper.
- State is deliberately single-process. Give parallel runs separate state files; shared-process coordination is not built.

## Ideas discussed but not built

- Answer-quality optimization, new prompts, grading changes, automatic paid reruns and shared learning across users.
