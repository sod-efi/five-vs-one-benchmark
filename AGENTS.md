# Five-vs-one benchmark

Read `~/coding/_global/AGENTS.md`, global memory, this guide and `memory.md` first. This public repository is a frozen research release plus a separate future experiment entrypoint. No deployment or UI.

## Boundaries

Never modify `dev/benchmark/` or `paper/` to improve future runs. Their canonical source is release commit `8974089727fc1714179f88cdd8f6cdec85ddfe1b`. Preserve published questions, prompts, replies, grading and analysis byte-for-byte. New future defaults belong in `experiments/v2/`.

## Run and test

Normal future use: `bun experiments/v2/run.mjs --set all --out future-results/run-001`; fresh explicit output required for new runs. Append `--resume` to the exact original command to continue a verified v2 directory; marker/scope/argument mismatch or symlinks fail before network access. Completed questions are skipped, incomplete questions may repeat partial calls. Real runs require a provider key and incur cost. Tests must use loopback fakes, never a real key/provider.

Offline checks: `node --test experiments/v2/adaptive-transport.test.mjs`, `node dev/benchmark/paper-analysis.mjs`, `node --check experiments/v2/run.mjs`. Actual process tests require Bun. Verify `git diff 8974089727fc1714179f88cdd8f6cdec85ddfe1b -- dev/benchmark paper` is empty.

## Automatic improvement

`adaptive-transport.mjs` gates the unchanged runner's fetches. Eight-call windows of verified nonempty successes measure completed-call throughput under queued demand. Bounded candidates require >5% improvement; failed/slow/underloaded trials roll back. Overload/errors conservatively reduce load, respecting Retry-After. At most four concurrent calls per origin/model; delays at most 30 seconds (provider cooldown may be longer). No added retry, prompts, answer changes or answer-quality claim.

Only last accepted settings persist, scoped by SHA256(origin + model), at most 32 profiles. Per-run aggregate counters are in fresh output. State is local single-process only; parallel jobs need separate `--learning-state` files. Reset by moving state aside. Existing corrupt/unowned state fails startup closed and is preserved; choose a new state path to recover. Missing state starts conservatively. Storage failures during a run never replay requests. V2 timing protocol differs from the paper. See README and security review.

The V2 wrapper verifies SHA256 of the archived runner, its only local code dependency (`lib.ts`) and both question JSON files before importing the runner or accessing the network. CRLF is normalized to LF so platform checkout line endings do not change identity; all other bytes are bound to the pinned release. The manifest is included in the run marker and checked on resume.
