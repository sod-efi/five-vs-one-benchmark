// Deterministically recompute the paper's result tables from saved benchmark files.
// Run from the repository root: node dev/benchmark/paper-analysis.mjs
// No network calls or dependencies. Uses the last JSONL row for each question ID.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, "results");
const sets = ["mmlupro", "simpleqa"];
const agents = ["claude", "gpt", "gemini", "grok", "muse"];
const excludedSensitivityIds = new Set(["sqa-2246", "sqa-2409"]);

function readLatest(set) {
  const latest = new Map();
  for (const line of readFileSync(join(resultsDir, `${set}.jsonl`), "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    latest.set(row.id, row);
  }
  return [...latest.values()].filter((row) => row.complete === true);
}

const dataBySet = Object.fromEntries(sets.map((set) => [set, readLatest(set)]));
const pooled = sets.flatMap((set) => dataBySet[set]);
const sensitivity = pooled.filter((row) => !excludedSensitivityIds.has(row.id));
const conditions = [
  ...agents.map((agent) => [`r1.${agent}`, `${agent}_r1`]),
  ["maj1", "round1_majority_abstentions_vote"],
  ["maj1x", "round1_majority_abstentions_ignored"],
  ["maj2", "round2_majority_abstentions_vote"],
  ["maj2x", "round2_majority_abstentions_ignored"],
  ["verdict", "verdict"],
];

function accuracy(rows, key) {
  const correct = rows.filter((row) => row.correct?.[key] === true).length;
  return { correct, n: rows.length, percent: percent(correct, rows.length) };
}

function percent(x, n, digits = 1) {
  return n ? Number((100 * x / n).toFixed(digits)) : null;
}

// Two-sided exact McNemar test (conditional binomial test on discordant pairs).
function mcnemar(rows, keyA, keyB) {
  let aOnly = 0;
  let bOnly = 0;
  for (const row of rows) {
    const a = row.correct?.[keyA] === true;
    const b = row.correct?.[keyB] === true;
    if (a && !b) aOnly++;
    else if (!a && b) bOnly++;
  }
  const discordant = aOnly + bOnly;
  const k = Math.min(aOnly, bOnly);
  let term = 2 ** -discordant;
  let cdf = term;
  for (let i = 1; i <= k; i++) {
    term *= (discordant - i + 1) / i;
    cdf += term;
  }
  return {
    conditionA: keyA,
    conditionB: keyB,
    a_only_correct: aOnly,
    b_only_correct: bOnly,
    discordant: discordant,
    p_two_sided_exact: discordant ? Math.min(1, 2 * cdf) : 1,
  };
}

function wilson(correct, n, z = 1.959963984540054) {
  if (!n) return null;
  const p = correct / n;
  const d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [percent(center - half, 1), percent(center + half, 1)];
}

function bestSingle(rows) {
  return agents
    .map((agent) => ({ key: `r1.${agent}`, correct: accuracy(rows, `r1.${agent}`).correct }))
    .sort((a, b) => b.correct - a.correct || agents.indexOf(a.key.slice(3)) - agents.indexOf(b.key.slice(3)))[0].key;
}

function mainTable(rows) {
  return conditions.map(([key, name]) => ({ condition: name, ...accuracy(rows, key) }));
}

function pairedTests(rows) {
  const best = bestSingle(rows);
  const pairs = [
    ["verdict", best],
    ["verdict", "maj1"],
    ["verdict", "maj1x"],
    ["maj2x", best],
    ["maj2x", "verdict"],
    ["maj2x", "maj1x"],
    ["maj2", "verdict"],
  ];
  return { best_single: best, tests: pairs.map(([a, b]) => mcnemar(rows, a, b)) };
}

function labelCoverage(rows) {
  const keys = [
    ...agents.map((agent) => [`r1.${agent}`, `${agent}_r1`]),
    ["maj1", "round1_majority_abstentions_vote"],
    ["maj1x", "round1_majority_abstentions_ignored"],
    ["maj2", "round2_majority_abstentions_vote"],
    ["maj2x", "round2_majority_abstentions_ignored"],
    ["verdict", "verdict"],
  ];
  return keys.map(([key, name]) => {
    const c = rows.filter((row) => row.labels?.[key] === "CORRECT").length;
    const i = rows.filter((row) => row.labels?.[key] === "INCORRECT").length;
    const notAttempted = rows.filter((row) => row.labels?.[key] === "NOT_ATTEMPTED").length;
    const unparsed = rows.filter((row) => row.labels?.[key] === "UNPARSED" || !row.labels?.[key]).length;
    const otherLabels = [...new Set(rows.map((row) => row.labels?.[key]).filter((label) =>
      label && !["CORRECT", "INCORRECT", "NOT_ATTEMPTED", "UNPARSED"].includes(label)))];
    const coverageN = c + i;
    return {
      condition: name,
      correct: c,
      incorrect: i,
      not_attempted: notAttempted,
      unparsed: unparsed,
      other_labels: otherLabels,
      coverage_n: coverageN,
      total_n: rows.length,
      coverage_percent: percent(coverageN, rows.length),
      conditional_correct_n: c,
      conditional_total_n: coverageN,
      conditional_accuracy_percent: percent(c, coverageN),
    };
  });
}

function normalizeAgreement(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function agreementCount(row) {
  const majority = normalizeAgreement(row.answers?.maj1x);
  if (!majority || ["idontknow", "unknown", "notattempted"].includes(majority)) return 0;
  return agents.filter((agent) => normalizeAgreement(row.answers?.r1?.[agent]) === majority).length;
}

function agreementTable(rows) {
  const buckets = [
    { name: "5_of_5", test: (n) => n === 5 },
    { name: "4_of_5", test: (n) => n === 4 },
    { name: "3_of_5", test: (n) => n === 3 },
    { name: "2_or_fewer", test: (n) => n <= 2 },
  ];
  return buckets.map(({ name, test }) => {
    const group = rows.filter((row) => test(agreementCount(row)));
    return {
      agreement: name,
      n: group.length,
      round1_vote_correct: accuracy(group, "maj1x"),
      round1_vote_wilson_95_percent: wilson(accuracy(group, "maj1x").correct, group.length),
      round2_vote_correct: accuracy(group, "maj2x"),
      verdict_correct: accuracy(group, "verdict"),
    };
  });
}

function costTime(rows) {
  const stage = (field) => {
    const sumCost = rows.reduce((sum, row) => sum + (Number(row.cost?.[field]) || 0), 0);
    const sumSeconds = rows.reduce((sum, row) => sum + (Number(row.seconds?.[field]) || 0), 0);
    return { cost_total: sumCost, cost_mean: sumCost / rows.length, seconds_total: sumSeconds, seconds_mean: sumSeconds / rows.length };
  };
  const r1 = stage("r1");
  const r2 = stage("r2");
  const verdict = stage("verdict");
  return {
    n: rows.length,
    stages: { r1, r2, verdict },
    full_cost_mean: r1.cost_mean + r2.cost_mean + verdict.cost_mean,
    r1_only_cost_mean: r1.cost_mean,
    cost_savings_percent_if_skip_r2_and_verdict: percent(r2.cost_total + verdict.cost_total, r1.cost_total + r2.cost_total + verdict.cost_total, 2),
    full_latency_mean_seconds: r1.seconds_mean + r2.seconds_mean + verdict.seconds_mean,
    r1_only_latency_mean_seconds: r1.seconds_mean,
    latency_savings_percent_if_skip_r2_and_verdict: percent(r2.seconds_total + verdict.seconds_total, r1.seconds_total + r2.seconds_total + verdict.seconds_total, 2),
  };
}

function withinSimpleQaAgreement(rows) {
  const simple = rows.filter((row) => row.set === "simpleqa");
  const groups = [
    { name: "3_or_more", include: (n) => n >= 3 },
    { name: "2_or_fewer", include: (n) => n <= 2 },
  ];
  return groups.map(({ name, include }) => {
    const group = simple.filter((row) => include(agreementCount(row)));
    return {
      agreement: name,
      n: group.length,
      round1_vote_correct: accuracy(group, "maj1x"),
      round2_vote_correct: accuracy(group, "maj2x"),
      verdict_correct: accuracy(group, "verdict"),
    };
  });
}

const output = {
  source: "dev/benchmark/results/{mmlupro,simpleqa}.jsonl; last row per id; complete rows only",
  complete_rows: Object.fromEntries(sets.map((set) => [set, dataBySet[set].length])),
  manuscript_table_1_main_accuracy: {
    mmlupro: mainTable(dataBySet.mmlupro),
    simpleqa: mainTable(dataBySet.simpleqa),
    pooled: mainTable(pooled),
  },
  main_paired_exact_mcnemar: pairedTests(pooled),
  sensitivity_excluding_r2_credit_failure_rows: {
    excluded_ids: [...excludedSensitivityIds],
    pooled_n: sensitivity.length,
    simpleqa_n: sensitivity.filter((row) => row.set === "simpleqa").length,
    main_accuracy: mainTable(sensitivity),
    paired_exact_mcnemar: pairedTests(sensitivity),
    simpleqa_label_coverage: labelCoverage(sensitivity.filter((row) => row.set === "simpleqa")),
  },
  manuscript_table_2_simpleqa_label_coverage: labelCoverage(dataBySet.simpleqa),
  manuscript_table_3_pooled_lexical_agreement: agreementTable(pooled),
  unanimous_cost_latency_savings: costTime(pooled.filter((row) => agreementCount(row) === 5)),
  simpleqa_within_agreement: withinSimpleQaAgreement(pooled),
};

console.log(JSON.stringify(output, null, 2));
