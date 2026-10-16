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

## Run it again

Needs [Bun](https://bun.sh) and an OpenRouter key with a spending limit. The first run cost about $15.

```sh
OPENROUTER_API_KEY=sk-or-... bun dev/benchmark/run.ts --set all --out my-results
bun dev/benchmark/summarize.ts --out my-results
```

Closed models change over time, so a new run measures today's models, not the ones in the paper. The model IDs used are in `lib.ts` and in the paper.

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
