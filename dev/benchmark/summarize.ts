// Summarize the five-vs-one results: accuracy per condition, paired tests, cost. Writes <out>/summary.md and prints it.
// Run: bun dev/benchmark/summarize.ts [--out dev/benchmark/results]
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg("--out") || "dev/benchmark/results";
const KEYS = ["claude", "gpt", "gemini", "grok", "muse"], NAMES: Record<string, string> = { claude: "Claude", gpt: "GPT", gemini: "Gemini", grok: "Grok", muse: "Muse" };

// McNemar's exact test on paired outcomes: b = A right and B wrong, c = A wrong and B right. Two-sided binomial p on min(b, c) given b + c.
function mcnemar(b: number, c: number) {
  const n = b + c; if (!n) return 1;
  const k = Math.min(b, c);
  const logFact = (x: number) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(logFact(n) - logFact(i) - logFact(n - i) - n * Math.log(2));
  return Math.min(1, 2 * p);
}
const pct = (x: number, n: number) => (n ? `${((100 * x) / n).toFixed(1)}%` : "-");

const lines: string[] = [`# Five vs one: results\n`, `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from \`${OUT}/*.jsonl\`.\n`];
const sets = ["mmlupro", "simpleqa"].filter((s) => existsSync(`${OUT}/${s}.jsonl`));
const all: any[] = [];
for (const set of sets) {
  // The last row per question wins: a question that failed and ran again has two rows.
  const byId = new Map<string, any>();
  for (const l of readFileSync(`${OUT}/${set}.jsonl`, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l); byId.set(r.id, r); }
  const rows = [...byId.values()];
  rows.forEach((r) => all.push(r));
  report(set, rows);
}
if (sets.length > 1) report("both sets pooled", all);

function report(title: string, rows: any[]) {
  const used = rows.filter((r) => r.complete), dropped = rows.length - used.length, n = used.length;
  lines.push(`## ${title}\n`, `${rows.length} questions run, ${dropped} dropped because a first-round reply or the verdict failed, ${n} compared.\n`);
  const acc = (k: string) => used.filter((r) => r.correct[k]).length;
  const abst = (k: string) => used.filter((r) => r.labels[k] === "NOT_ATTEMPTED").length;
  const unp = (k: string) => used.filter((r) => r.labels[k] === "UNPARSED").length;
  const hasX = used.some((r) => "maj1x" in (r.answers || {}));
  const conds: [string, string][] = [...KEYS.map((k) => [`r1.${k}`, `${NAMES[k]} alone (round 1)`] as [string, string]),
    ["maj1", "Majority of the five first answers (pre-registered)"], ...(hasX ? [["maj1x", "Same, but \"I don't know\" doesn't vote"] as [string, string]] : []),
    ["maj2", "Majority after round 2"], ...(hasX ? [["maj2x", "Same, \"I don't know\" doesn't vote"] as [string, string]] : []), ["verdict", "Kickaround verdict"]];
  lines.push("| Condition | Correct | Accuracy | Said \"I don't know\" | No parseable answer |", "|---|---|---|---|---|");
  for (const [k, label] of conds) lines.push(`| ${label} | ${acc(k)} / ${n} | ${pct(acc(k), n)} | ${abst(k)} | ${unp(k)} |`);
  // Best single model by round-1 accuracy, then the paired comparisons.
  const bestKey = KEYS.map((k) => [`r1.${k}`, acc(`r1.${k}`)] as [string, number]).sort((a, b) => b[1] - a[1])[0][0];
  const pair = (a: string, b: string) => { let bb = 0, cc = 0; for (const r of used) { if (r.correct[a] && !r.correct[b]) bb++; if (!r.correct[a] && r.correct[b]) cc++; } return { b: bb, c: cc, p: mcnemar(bb, cc), diff: ((acc(a) - acc(b)) * 100) / (n || 1) }; };
  const vsBest = pair("verdict", bestKey), vsMaj = pair("verdict", "maj1"), majVsBest = pair("maj1", bestKey);
  lines.push("", `Best single model: ${NAMES[bestKey.slice(3)]} (${pct(acc(bestKey), n)}).`, "",
    "| Comparison | Difference (points) | Only first right | Only second right | McNemar p |", "|---|---|---|---|---|",
    `| Verdict vs best single model | ${vsBest.diff.toFixed(1)} | ${vsBest.b} | ${vsBest.c} | ${vsBest.p.toFixed(3)} |`,
    `| Verdict vs round-1 majority | ${vsMaj.diff.toFixed(1)} | ${vsMaj.b} | ${vsMaj.c} | ${vsMaj.p.toFixed(3)} |`,
    `| Round-1 majority vs best single model | ${majVsBest.diff.toFixed(1)} | ${majVsBest.b} | ${majVsBest.c} | ${majVsBest.p.toFixed(3)} |`);
  if (hasX) {
    const x = pair("verdict", "maj1x"), y = pair("maj1x", bestKey), z = pair("maj2x", bestKey), w = pair("maj2x", "verdict");
    lines.push(`| Verdict vs round-1 majority, "I don't know" not voting | ${x.diff.toFixed(1)} | ${x.b} | ${x.c} | ${x.p.toFixed(3)} |`, `| That majority vs best single model | ${y.diff.toFixed(1)} | ${y.b} | ${y.c} | ${y.p.toFixed(3)} |`,
      `| Majority after round 2 ("I don't know" not voting) vs best single model | ${z.diff.toFixed(1)} | ${z.b} | ${z.c} | ${z.p.toFixed(3)} |`, `| Majority after round 2 ("I don't know" not voting) vs verdict | ${w.diff.toFixed(1)} | ${w.b} | ${w.c} | ${w.p.toFixed(3)} |`);
  }
  // Pre-registered reading.
  const beat = vsBest.diff >= 5 && vsBest.p < 0.05, same = Math.abs(vsMaj.diff) <= 2;
  lines.push("", `Pre-registered rule: ${beat ? "the verdict beats the best single model by 5 points or more with p < 0.05: five beat one here." : "the verdict does NOT beat the best single model by 5 points with p < 0.05: no proof that five beat one here."} ${same ? "The verdict is within 2 points of the round-1 majority: the two rounds add nothing a plain majority vote wouldn't." : "The verdict differs from the round-1 majority by more than 2 points."}`);
  // Agreement and judge effects.
  const agree = used.filter((r) => r.answers.verdict !== null && r.answers.maj1 !== null && String(r.answers.verdict).toLowerCase() === String(r.answers.maj1).toLowerCase()).length;
  lines.push("", `The verdict gave the same answer as the round-1 majority on ${agree} of ${n}.`);
  const byJudge = KEYS.map((k) => { const rs = used.filter((r) => r.judge === k); return `${NAMES[k]} ${rs.filter((r) => r.correct.verdict).length}/${rs.length}`; }).join(", ");
  lines.push(`Verdict accuracy by who wrote it: ${byJudge}.`);
  // Cost and time.
  const tot = (f: (r: any) => number) => used.reduce((s, r) => s + f(r), 0);
  const run = tot((r) => r.cost.r1 + r.cost.r2 + r.cost.verdict), r1 = tot((r) => r.cost.r1), grading = tot((r) => r.cost.grading);
  lines.push("", `Cost: a full Kickaround run averaged $${(run / (n || 1)).toFixed(3)} a question (round 1 alone $${(r1 / (n || 1)).toFixed(3)}, so a majority vote costs about ${((100 * r1) / (run || 1)).toFixed(0)}% of a run); grading $${grading.toFixed(2)} in all. Time: round 1 averaged ${(tot((r) => r.seconds.r1) / (n || 1)).toFixed(0)} s, round 2 ${(tot((r) => r.seconds.r2) / (n || 1)).toFixed(0)} s, verdict ${(tot((r) => r.seconds.verdict) / (n || 1)).toFixed(0)} s.`);
  // Where the verdict changed the outcome.
  const saved = used.filter((r) => r.correct.verdict && !r.correct[bestKey]).map((r) => r.id), lost = used.filter((r) => !r.correct.verdict && r.correct[bestKey]).map((r) => r.id);
  lines.push("", `Right only in the verdict (vs ${NAMES[bestKey.slice(3)]}): ${saved.join(", ") || "none"}.`, `Wrong only in the verdict: ${lost.join(", ") || "none"}.`, "");
}
const text = lines.join("\n");
writeFileSync(`${OUT}/summary.md`, text);
console.log(text);
