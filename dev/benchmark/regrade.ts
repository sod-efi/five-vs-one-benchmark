// Re-grade saved results from their stored reply texts, with the current extract() and majority() in lib.ts, without calling any model
// again except SimpleQA's grader for an answer that changed. Keeps a copy of the file as <set>.before-regrade.jsonl the first time.
// Run: OPENROUTER_API_KEY=sk-or-... bun dev/benchmark/regrade.ts [--out dev/benchmark/results] [--grader google/gemini-3.8-flash]
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { AGENTS, load, extract, majority, gradeAll, type Grade } from "./lib.ts";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg("--out") || "dev/benchmark/results", GRADER = arg("--grader") || "google/gemini-3.8-flash";
for (const set of ["mmlupro", "simpleqa"] as const) {
  const file = `${OUT}/${set}.jsonl`;
  if (!existsSync(file)) continue;
  if (!existsSync(`${OUT}/${set}.before-regrade.jsonl`)) copyFileSync(file, `${OUT}/${set}.before-regrade.jsonl`);
  const qs = new Map(load(set).map((q) => [q.id, q]));
  const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let changed = 0, graded = 0, cost = 0;
  for (const r of rows) {
    const q = qs.get(r.id)!;
    const r1 = Object.fromEntries(AGENTS.map((a) => [a.key, r.text.r1[a.key] && !r.errors.r1.some((e: string) => e.startsWith(a.key + ":")) ? extract(r.text.r1[a.key], q) : null]));
    const r2 = Object.fromEntries(AGENTS.map((a) => [a.key, r.text.r2[a.key] && !r.errors.r2.some((e: string) => e.startsWith(a.key + ":")) ? extract(r.text.r2[a.key], q) : null]));
    const answers: Record<string, string | null> = {};
    for (const a of AGENTS) { answers[`r1.${a.key}`] = r1[a.key]; answers[`r2.${a.key}`] = r2[a.key]; }
    answers.maj1 = majority(r.order.map((k: string) => r1[k]), set); answers.maj2 = majority(r.order.map((k: string) => r2[k]), set);
    answers.maj1x = majority(r.order.map((k: string) => r1[k]), set, true); answers.maj2x = majority(r.order.map((k: string) => r2[k]), set, true);
    answers.verdict = r.text.verdict && !r.errors.verdict ? extract(r.text.verdict, q) : null;
    // Old answers by the same keys, to reuse a grade when the answer is unchanged.
    const old: Record<string, string | null> = { maj1: r.answers.maj1, maj2: r.answers.maj2, maj1x: r.answers.maj1x, maj2x: r.answers.maj2x, verdict: r.answers.verdict };
    for (const a of AGENTS) { old[`r1.${a.key}`] = r.answers.r1[a.key]; old[`r2.${a.key}`] = r.answers.r2[a.key]; }
    const keep = (k: string, a: string | null): Grade | null => (k in old && old[k] === a && r.labels[k] !== undefined && !String(r.labels[k]).startsWith("GRADER_ERROR") ? { ok: !!r.correct[k], label: r.labels[k], cost: 0 } : null);
    const g = await gradeAll(q, answers, GRADER, keep);
    for (const k of Object.keys(answers)) { if (old[k] !== answers[k] || r.correct[k] !== g[k].ok) changed++; if (g[k].cost) { graded++; cost += g[k].cost; } }
    r.answers = { r1, r2, maj1: answers.maj1, maj2: answers.maj2, maj1x: answers.maj1x, maj2x: answers.maj2x, verdict: answers.verdict };
    r.correct = Object.fromEntries(Object.entries(g).map(([k, x]) => [k, x.ok]));
    r.labels = Object.fromEntries(Object.entries(g).map(([k, x]) => [k, x.label]));
    r.cost.grading = (r.cost.grading || 0) + Object.values(g).reduce((s, x) => s + x.cost, 0);
    r.regraded = new Date().toISOString().slice(0, 16);
  }
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${set}: ${rows.length} rows re-graded, ${changed} answer or grade changes, ${graded} grader calls ($${cost.toFixed(2)})`);
}
