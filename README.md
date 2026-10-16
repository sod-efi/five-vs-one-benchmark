# Are five AI agents better than one? Not always.

Data and code for the pilot study of the same name by Efi Ben Dor (October 2026). The paper is in [`paper/five-vs-one.pdf`](paper/five-vs-one.pdf), with its LaTeX source beside it.

Five models (Claude, GPT, Gemini, Grok and Muse, through OpenRouter) answered 200 known-answer questions the way [Kickaround](https://kickaround.app) runs a question: each answers alone, each reads the others and answers again, then one writes a verdict. 196 questions met the inclusion rule. The verdict scored 78.6%, the best single model 82.7%.

## What's here

| Path | What it is |
|---|---|
| `paper/` | The paper (PDF and LaTeX). |
| `dev/benchmark/README.md` | The decision rule written before the first paid call, the method, and the results as first reported. |
| `dev/benchmark/data/` | The 200 sampled questions with their gold answers: 100 from MMLU-Pro, 100 from SimpleQA (seed 20261012). |
| `dev/benchmark/results/*.jsonl` | One line per question run: each model's reply in both rounds, the verdict, the parsed answers, grades, cost and time. Two verdict texts are withheld (see below); everything else is as saved. A question run more than once has several lines; the last one counts. |
| `dev/benchmark/results/*.before-regrade.jsonl` | The first pass, before the answer parser was widened. Kept so the change can be checked. |
| `dev/benchmark/results/summary.md` | The summary tables as first generated. |
| `dev/benchmark/paper-analysis.mjs` | Recomputes every table and test in the paper from the saved results. No network, no dependencies. |
| `dev/benchmark/lib.ts`, `run.ts`, `regrade.ts`, `summarize.ts` | The harness that ran the study (Bun), with stand-in prompts (see below). |

## Check the numbers (no API key, no cost)

```sh
node dev/benchmark/paper-analysis.mjs
```

It prints JSON with each table's counts, the exact McNemar tests, the Wilson intervals and the sensitivity checks.

## Future experiments (v2 dispatch)

Needs Bun and an OpenRouter key supplied through `OPENROUTER_API_KEY`. These calls cost money; set a provider spending limit first. The automatic dispatch loop is the default for new experiments:

```sh
bun experiments/v2/run.mjs --set all --out future-results/run-001
bun dev/benchmark/summarize.ts --out future-results/run-001
```

Use a fresh, explicit output directory each time. Existing directories require explicit `--resume`; published source/results paths and symlinks are always refused before any provider request. To continue an interrupted v2 run, repeat the exact original command with `--resume`. The marker must match the v2 protocol, archived SHA, arguments, provider and learning-state path; completed questions are skipped automatically. The archived runner's checkpoint files all go into the supplied directory. Existing result bytes and the original marker are preserved; each resume writes a separate aggregate summary. Only incomplete questions are retried, so partial calls within an unfinished question can repeat under the archived checkpoint semantics.

V2 learns a bounded concurrency and inter-request delay for each hashed provider-origin/model pair. Successful queued calls form eight-call throughput windows; a small trial is retained only after a saturated window improves completed calls per second by more than 5%. Slower, unsuccessful or insufficient-demand trials roll back. Actual overload/errors lower concurrency and increase delay; provider `Retry-After` is respected. It adds no requests or retries: the frozen runner retains its own retry policy. Answer quality is not the optimization target.

Last accepted settings persist automatically in ignored `experiments/v2/.runtime/learning.json` (at most 32 profiles). This file holds only scope hashes and bounded numeric settings. Prompts, questions, replies, credentials and raw model IDs never enter learner state. Experiment result files still contain the original runner's question/reply data: keep those private if using private inputs. `dispatch-summary.json` records aggregate trial outcomes; `experiment-protocol.json` marks the changed protocol. No live throughput benefit has been measured; tests use synthetic providers.

Reset by moving the local learning file aside, or pass `--learning-state <separate-local-file>` for isolated experiments. Inside this repo, state is allowed only beneath `experiments/v2/.runtime/`; outside it, an explicit non-symlink path is allowed. Never share state between concurrent processes: it is a single-process cache. Missing state starts conservatively. Existing state must carry the exact V2 protocol tag and bounded schema; corrupt or unrelated files stop startup before network access and remain untouched. Preserve that file and choose a new state path to recover. Storage failures during an active run never replay a call. To disable adaptation for an archived reproduction, use the pinned original command below.

**V2 timings are not comparable to the published study.** Scheduling has changed; prompts, questions, grading, archived results and paper have not. Closed models also change over time.

## Archived research protocol

The original command is frozen at commit `8974089727fc1714179f88cdd8f6cdec85ddfe1b`. In a separate checkout of that commit, with an explicit fresh output path outside that checkout:

```sh
bun dev/benchmark/run.ts --set all --out /absolute/path/to/fresh-archived-results
```

That archived protocol has fixed retries and no adaptive loop. Its published files remain byte-for-byte unchanged. The model IDs are in `dev/benchmark/lib.ts` and the paper.

## Things to know

- **When the rule was written.** The decision rule in `dev/benchmark/README.md` was committed privately on October 12, 2026 (23:43 Pacific), before the paid run, and reached the project's main branch through a later squash merge. This public release does not independently establish that chronology, so read it as pre-specified, not as independently registered.
- **Choices made after seeing the data** are marked in the paper: ignoring "I don't know" in the vote, and the wider answer parser.
- **Grading.** SimpleQA answers were graded by one model (Gemini 3.8 Flash), one of the five being tested.
- **Not Kickaround's application or prompts.** The study ran on Kickaround's own prompts and flow. The benchmark logic is derived from the product, and the flow is reproduced here; the exact prompt wording is not. `lib.ts` holds stand-in prompts, structural approximations of the elements summarized in the paper's Appendix A, so a rerun tests a similar flow with different wording and may score differently. Two saved verdicts that quoted the original prompt have their text withheld; their answers and grades are unchanged, so every number in the paper still reproduces. The product application (site, accounts, payments, database) is not in this repository.

## Sources and terms

- Questions come from [MMLU-Pro](https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro) (Wang et al., 2024) and [SimpleQA](https://openai.com/index/introducing-simpleqa/) (Wei et al., 2024). They remain under their original licences; cite those works if you use them.
- The model replies were generated through OpenRouter and remain subject to each model provider's terms. They are shared so the study can be checked and repeated, not as a training dataset.
- The code (`*.ts`, `*.mjs`) is released under the MIT licence.

## Citation

Efi Ben Dor. *Are Five AI Agents Better Than One? Not Always. A Pilot of Multi-Model Deliberation with a Pre-Specified Test.* October 2026. https://github.com/sod-efi/five-vs-one-benchmark

The V2 wrapper verifies SHA256 of the archived runner, its only local code dependency (`lib.ts`) and both question JSON files before importing the runner or accessing the network. CRLF is normalized to LF so platform checkout line endings do not change identity; all other bytes are bound to the pinned release. The manifest is included in the run marker and checked on resume.
