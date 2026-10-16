# Five vs one: results

Generated 2026-10-13 15:48 UTC from `dev/benchmark/results/*.jsonl`.

## mmlupro

100 questions run, 4 dropped because a first-round reply or the verdict failed, 96 compared.

| Condition | Correct | Accuracy | Said "I don't know" | No parseable answer |
|---|---|---|---|---|
| Claude alone (round 1) | 87 / 96 | 90.6% | 0 | 0 |
| GPT alone (round 1) | 88 / 96 | 91.7% | 0 | 0 |
| Gemini alone (round 1) | 88 / 96 | 91.7% | 0 | 0 |
| Grok alone (round 1) | 87 / 96 | 90.6% | 0 | 0 |
| Muse alone (round 1) | 86 / 96 | 89.6% | 0 | 0 |
| Majority of the five first answers (pre-registered) | 89 / 96 | 92.7% | 0 | 0 |
| Same, but "I don't know" doesn't vote | 89 / 96 | 92.7% | 0 | 0 |
| Majority after round 2 | 89 / 96 | 92.7% | 0 | 0 |
| Same, "I don't know" doesn't vote | 89 / 96 | 92.7% | 0 | 0 |
| Kickaround verdict | 87 / 96 | 90.6% | 0 | 2 |

Best single model: GPT (91.7%).

| Comparison | Difference (points) | Only first right | Only second right | McNemar p |
|---|---|---|---|---|
| Verdict vs best single model | -1.0 | 2 | 3 | 1.000 |
| Verdict vs round-1 majority | -2.1 | 1 | 3 | 0.625 |
| Round-1 majority vs best single model | 1.0 | 2 | 1 | 1.000 |
| Verdict vs round-1 majority, "I don't know" not voting | -2.1 | 1 | 3 | 0.625 |
| That majority vs best single model | 1.0 | 2 | 1 | 1.000 |
| Majority after round 2 ("I don't know" not voting) vs best single model | 1.0 | 2 | 1 | 1.000 |
| Majority after round 2 ("I don't know" not voting) vs verdict | 2.1 | 3 | 1 | 0.625 |

Pre-registered rule: the verdict does NOT beat the best single model by 5 points with p < 0.05: no proof that five beat one here. The verdict differs from the round-1 majority by more than 2 points.

The verdict gave the same answer as the round-1 majority on 92 of 96.
Verdict accuracy by who wrote it: Claude 18/20, GPT 17/20, Gemini 16/19, Grok 18/19, Muse 18/18.

Cost: a full Kickaround run averaged $0.075 a question (round 1 alone $0.038, so a majority vote costs about 51% of a run); grading $0.00 in all. Time: round 1 averaged 68 s, round 2 13 s, verdict 13 s.

Right only in the verdict (vs GPT): mmlupro-5364, mmlupro-1816.
Wrong only in the verdict: mmlupro-12177, mmlupro-9680, mmlupro-7144.

## simpleqa

100 questions run, 0 dropped because a first-round reply or the verdict failed, 100 compared.

| Condition | Correct | Accuracy | Said "I don't know" | No parseable answer |
|---|---|---|---|---|
| Claude alone (round 1) | 38 / 100 | 38.0% | 39 | 0 |
| GPT alone (round 1) | 71 / 100 | 71.0% | 11 | 0 |
| Gemini alone (round 1) | 74 / 100 | 74.0% | 11 | 0 |
| Grok alone (round 1) | 23 / 100 | 23.0% | 65 | 0 |
| Muse alone (round 1) | 48 / 100 | 48.0% | 40 | 0 |
| Majority of the five first answers (pre-registered) | 54 / 100 | 54.0% | 39 | 0 |
| Same, but "I don't know" doesn't vote | 73 / 100 | 73.0% | 7 | 0 |
| Majority after round 2 | 70 / 100 | 70.0% | 26 | 0 |
| Same, "I don't know" doesn't vote | 80 / 100 | 80.0% | 8 | 0 |
| Kickaround verdict | 67 / 100 | 67.0% | 23 | 0 |

Best single model: Gemini (74.0%).

| Comparison | Difference (points) | Only first right | Only second right | McNemar p |
|---|---|---|---|---|
| Verdict vs best single model | -7.0 | 5 | 12 | 0.143 |
| Verdict vs round-1 majority | 13.0 | 14 | 1 | 0.001 |
| Round-1 majority vs best single model | -20.0 | 3 | 23 | 0.000 |
| Verdict vs round-1 majority, "I don't know" not voting | -6.0 | 4 | 10 | 0.180 |
| That majority vs best single model | -1.0 | 8 | 9 | 1.000 |
| Majority after round 2 ("I don't know" not voting) vs best single model | 6.0 | 8 | 2 | 0.109 |
| Majority after round 2 ("I don't know" not voting) vs verdict | 13.0 | 13 | 0 | 0.000 |

Pre-registered rule: the verdict does NOT beat the best single model by 5 points with p < 0.05: no proof that five beat one here. The verdict differs from the round-1 majority by more than 2 points.

The verdict gave the same answer as the round-1 majority on 56 of 100.
Verdict accuracy by who wrote it: Claude 13/20, GPT 15/20, Gemini 16/20, Grok 9/20, Muse 14/20.

Cost: a full Kickaround run averaged $0.054 a question (round 1 alone $0.023, so a majority vote costs about 43% of a run); grading $0.85 in all. Time: round 1 averaged 16 s, round 2 14 s, verdict 12 s.

Right only in the verdict (vs Gemini): sqa-348, sqa-492, sqa-2210, sqa-3283, sqa-3391.
Wrong only in the verdict: sqa-644, sqa-2068, sqa-2163, sqa-2409, sqa-2858, sqa-2839, sqa-2946, sqa-3256, sqa-3547, sqa-3727, sqa-3981, sqa-3839.

## both sets pooled

200 questions run, 4 dropped because a first-round reply or the verdict failed, 196 compared.

| Condition | Correct | Accuracy | Said "I don't know" | No parseable answer |
|---|---|---|---|---|
| Claude alone (round 1) | 125 / 196 | 63.8% | 39 | 0 |
| GPT alone (round 1) | 159 / 196 | 81.1% | 11 | 0 |
| Gemini alone (round 1) | 162 / 196 | 82.7% | 11 | 0 |
| Grok alone (round 1) | 110 / 196 | 56.1% | 65 | 0 |
| Muse alone (round 1) | 134 / 196 | 68.4% | 40 | 0 |
| Majority of the five first answers (pre-registered) | 143 / 196 | 73.0% | 39 | 0 |
| Same, but "I don't know" doesn't vote | 162 / 196 | 82.7% | 7 | 0 |
| Majority after round 2 | 159 / 196 | 81.1% | 26 | 0 |
| Same, "I don't know" doesn't vote | 169 / 196 | 86.2% | 8 | 0 |
| Kickaround verdict | 154 / 196 | 78.6% | 23 | 2 |

Best single model: Gemini (82.7%).

| Comparison | Difference (points) | Only first right | Only second right | McNemar p |
|---|---|---|---|---|
| Verdict vs best single model | -4.1 | 9 | 17 | 0.169 |
| Verdict vs round-1 majority | 5.6 | 15 | 4 | 0.019 |
| Round-1 majority vs best single model | -9.7 | 6 | 25 | 0.001 |
| Verdict vs round-1 majority, "I don't know" not voting | -4.1 | 5 | 13 | 0.096 |
| That majority vs best single model | 0.0 | 11 | 11 | 1.000 |
| Majority after round 2 ("I don't know" not voting) vs best single model | 3.6 | 11 | 4 | 0.118 |
| Majority after round 2 ("I don't know" not voting) vs verdict | 7.7 | 16 | 1 | 0.000 |

Pre-registered rule: the verdict does NOT beat the best single model by 5 points with p < 0.05: no proof that five beat one here. The verdict differs from the round-1 majority by more than 2 points.

The verdict gave the same answer as the round-1 majority on 148 of 196.
Verdict accuracy by who wrote it: Claude 31/40, GPT 32/40, Gemini 32/39, Grok 27/39, Muse 32/38.

Cost: a full Kickaround run averaged $0.064 a question (round 1 alone $0.030, so a majority vote costs about 48% of a run); grading $0.85 in all. Time: round 1 averaged 42 s, round 2 14 s, verdict 12 s.

Right only in the verdict (vs Gemini): mmlupro-5364, mmlupro-1875, mmlupro-1816, mmlupro-133, sqa-348, sqa-492, sqa-2210, sqa-3283, sqa-3391.
Wrong only in the verdict: mmlupro-10961, mmlupro-9680, mmlupro-1897, mmlupro-7144, mmlupro-10973, sqa-644, sqa-2068, sqa-2163, sqa-2409, sqa-2858, sqa-2839, sqa-2946, sqa-3256, sqa-3547, sqa-3727, sqa-3981, sqa-3839.
