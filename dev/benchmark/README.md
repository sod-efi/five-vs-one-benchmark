# Five vs one: does the Kickaround verdict beat one model?

Kickaround's pitch rests on an unproven claim: five models arguing over two rounds land on a better answer than one model answering alone. This benchmark tests it where it can be tested, on questions with known answers, using the product's flow. The original run used the product's own prompts; this release replaces their wording with stand-ins (see "Prompts in this release").

## Pre-registered, before the first paid run (October 12, 2026)

> **October 15 manuscript audit:** the original decision rule below is retained for provenance; method disclosures and result interpretation have been corrected after review. The revised interpretation and method disclosures are in [the paper](../../paper/five-vs-one.tex). This is a source-derived replay with order/retry differences from production and an adapted SimpleQA grader using the evaluated Gemini model ID. The 196-question rule retains two incomplete second rounds; the paper also reports a 194-question sensitivity. Abstention-excluding votes and agreement findings are exploratory; writer identity is confounded with assigned questions. The results do not establish a causal discussion benefit or calibrated confidence. Recompute all three paper tables, paired comparisons, coverage and stopping estimates without API calls using `node dev/benchmark/paper-analysis.mjs`. The original protocol-only commit is `5cafb12d` in the private project repository (October 12, 23:43 Pacific, before the run); it reached the main branch through a later squash merge, and this public release does not independently establish that chronology.

**Question.** On the same questions, how often is the Kickaround verdict right, compared with (a) each of the five models answering alone, and (b) a plain majority vote of the five first answers, which is what a twenty-line script on OpenRouter gives you?

**Decision rule.**
- The verdict must beat the best single model by 5 percentage points or more on the pooled 200 questions, with McNemar's exact test p < 0.05, to count as proof that five beat one.
- If the verdict is within 2 points of the round-1 majority, the two rounds of discussion add nothing a majority vote wouldn't.
- Anything in between is "no proof either way"; it won't be read as a win.

**Conditions**, all from the same run of each question:
1. Each model alone: its round-1 reply (the five replies in round 1 are written without seeing each other, exactly as on the board).
2. Majority of the five round-1 answers; a tie goes to the agent who went first (as the verdict does).
3. Majority after round 2 (for interest; not part of the rule).
4. The Kickaround verdict: written after two rounds by the agent who went first, with the product's verdict prompt.

**Prompts in this release.** The study ran on Kickaround's own prompts. Their exact wording is not released: `lib.ts` here holds stand-in prompts: structural approximations of the elements summarized in the paper's Appendix A, not a line-for-line copy, and two saved verdicts that quoted the original prompt (mmlupro-9680, mmlupro-7144) have their text withheld, with their parsed answers and grades unchanged. A rerun with this harness tests a similar flow with different wording.

**Faithfulness of the original run (clarified October 15).** This describes the harness as it ran for the paper, before the prompts were replaced for release. It was a source-derived replay, not a measurement of production traffic. Model IDs, opine/verdict system text, two concurrent rounds and the 6,000-token cap matched the product. The harness appends replies in invocation order after each round; production stores completion order. The harness repeats a question-index rotation across both rounds; production advances a shared counter each round. The harness retries network exceptions/timeouts and used both 180- and 300-second limits; production returns those exceptions and uses 180 seconds. Production's shared model gates and 60,000-character transcript truncation are absent; saved transcripts inspected were well below that cap. There is no database or app attribution. A final answer line is requested in every condition. SimpleQA's short-answer request and the action-oriented verdict prompt may affect responses differently.

**Question sets** (`data/`, sampled with seed 20261012):
- `mmlupro-100.json`: 100 questions from MMLU-Pro (TIGER-Lab, test split), up to 8 per category across 13 of its 14 categories (the sampling pages missed history). Ten options at most; graded by exact letter.
- `simpleqa-100.json`: 100 questions from OpenAI's SimpleQA (4,326 short factual questions). Graded with a shortened adaptation of SimpleQA's reference grader prompt (CORRECT / INCORRECT / NOT_ATTEMPTED) run on `google/gemini-3.8-flash`; "I don't know" is NOT_ATTEMPTED without a grader call. Only CORRECT counts. The grader uses the same model ID as the evaluated Gemini participant; the adaptation omits reference guidance/examples and has not been independently validated.

**Exclusions.** A question is compared only if all five round-1 replies and the verdict came back without error. The declared rule retains sqa-2246 and sqa-2409 despite four second-round credit failures each; a 194-question sensitivity excludes them. Dropped questions are counted in the summary. A reply with no parseable answer counts as wrong for that condition.

**What this can't show.** Kickaround's real questions are judgment calls with no gold answer. A result here says whether the discussion improves answers that can be checked; it says nothing about taste, and a null result doesn't rule out value on open questions. It also tests one mode (opine) and one judge policy (the agent who went first).

## Running it

```sh
# Real run, both sets, about 2 to 3 hours. The key goes in the environment, never in the repo.
OPENROUTER_API_KEY=sk-or-... bun dev/benchmark/run.ts --set all --out my-results
bun dev/benchmark/summarize.ts --out my-results   # writes my-results/summary.md

# Dry run against any OpenAI-compatible stub server (not included in this release): no cost, checks the plumbing only.
OPENROUTER_BASE_URL=http://localhost:4010/api/v1 OPENROUTER_API_KEY=sk-or-stub bun dev/benchmark/run.ts --set all --n 2 --out stub-results
```

Always pass a fresh `--out` folder: the runner skips questions already complete in the folder it writes to, so running into the shipped `results/` would not be a new replication. Results append to `<out>/<set>.jsonl`, one line per question with every reply's text, answers, grades, costs and times; a stopped run picks up where it was. `--n` limits questions per set, `--concurrency` the questions in flight (default 4), `--grader` the grading model, `--out` the folder.

Expected cost: about eleven model calls a question, roughly $0.15 to $0.40, so $30 to $80 for both sets plus a few dollars of grading. Use a dedicated OpenRouter key with a spending limit.

## Results (October 13, 2026)

Protocol recorded October 12; paid run October 13 Pacific, on the five default models: 200 questions, 196 compared (4 MMLU-Pro dropped: Grok timed out at 300 s on three, Muse returned an empty reply on one). Total spend $15.25 including reruns and grading. Full tables: `results/summary.md`; every reply: `results/*.jsonl`.

| Condition | MMLU-Pro (96) | SimpleQA (100) | Pooled (196) |
|---|---|---|---|
| Best single model, round 1 | GPT 91.7% | Gemini 74.0% | Gemini 82.7% |
| Majority of the five first answers, pre-registered ("I don't know" votes) | 92.7% | 54.0% | 73.0% |
| Same, "I don't know" doesn't vote | 92.7% | 73.0% | 82.7% |
| Majority after round 2, "I don't know" doesn't vote | 92.7% | 80.0% | 86.2% |
| Kickaround verdict | 90.6% | 67.0% | 78.6% |

Against the pre-specified rule: **superiority was not established.** The verdict scored 78.6% versus Gemini's 82.7% (9:17 discordant pairs; exact two-sided McNemar p=0.16864). This does not establish inferiority or equivalence. Gemini was selected by observed first-round accuracy on these same questions.

Exploratory observations:

1. The abstention-excluding round-two vote scored 86.2%, versus the verdict's 78.6% (16:1 discordance; p=0.000275). Its gain over the round-one vote with the same rule was 3.6 points (9:2; p=0.06543). The rule was chosen after seeing the data. These comparisons do not isolate a causal discussion or summarization effect.
2. On SimpleQA, the vote answered 92/100 questions and the verdict 77/100. Accuracy among attempted answers was 87.0% for each, on different subsets. Of 13 cases where the vote was correct and the verdict was not, ten verdicts were graded not attempted and three incorrect.
3. Lexical unanimity in the first round was associated with 89/91 correct votes (97.8%). This group was mostly MMLU-Pro (81/91); agreement has not been calibrated for user decisions. The four-match bin was less accurate than the three-match bin.
4. Writers received different questions, so descriptive differences by writer do not isolate writer quality. MMLU-Pro first-round scores were tightly clustered at 89.6–91.7%.
5. Retained generation cost averaged $0.064 per question excluding grading and earlier/excluded attempts. Recorded stage times averaged 41.66/13.51/12.44 seconds. Omitting round two and verdict on unanimous questions would retrospectively save 51.9% of their cost and 37.4% of stage time.
6. Excluding the two incomplete second rounds leaves 194 questions: vote 168/194 (86.6%), verdict 153/194 (78.9%), Gemini 160/194 (82.5%); vote–verdict discordance remains 16:1.

Limits include the small two-dataset sample, adapted grading, no matched-compute/self-revision controls, one run and one writer policy, post-hoc choices, incomplete dataset provenance and absent resolved-provider/per-call metadata. Exploratory p-values are unadjusted. Sample size alone does not imply a fixed detectable difference.

Reproduce all three paper tables, paired comparisons, coverage, agreement and sensitivity without model calls:

    node dev/benchmark/paper-analysis.mjs

The paper is in `paper/` at the top of this repository.

