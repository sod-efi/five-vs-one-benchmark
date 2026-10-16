// Five vs one: does the Kickaround verdict beat the best single model, and a plain majority vote of the five first answers?
// It replays Kickaround's run: the same five models, the same transcript format, two rounds, then the verdict written by the agent who went first. The released prompts are stand-ins (see lib.ts). The question sets are in data/
// (see README.md). Each question costs about eleven model calls plus grading; the shared pieces are in lib.ts.
//
// Run (about 2 hours for both sets at concurrency 4):
//   OPENROUTER_API_KEY=sk-or-... bun dev/benchmark/run.ts --set all --out my-results
// Always use a fresh --out folder: the default is the shipped results/, where completed questions are skipped.
// Dry run against any OpenAI-compatible stub server (not included; no cost, checks the plumbing only):
//   OPENROUTER_BASE_URL=http://localhost:4010/api/v1 OPENROUTER_API_KEY=sk-or-stub bun dev/benchmark/run.ts --set all --n 2 --out stub-results
// Options: --set mmlupro|simpleqa|all (default all), --n <questions per set> (default all), --concurrency <questions at once> (default 4),
//          --grader <model id> (default google/gemini-3.8-flash), --out <dir> (default dev/benchmark/results),
//          --timeout <seconds per model call> (default 180, the board's own; raise it to rerun questions a model timed out on)
// Results append to <out>/<set>.jsonl, one line per question. A question whose run was complete is skipped next time; one that wasn't
// (a model failed, or the balance ran out) runs again, and summarize.ts keeps the last row per question. Then: bun dev/benchmark/summarize.ts --out my-results
//
// No app attribution headers on purpose: this traffic must not count as Kickaround's in OpenRouter's rankings.
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { AGENTS, ROUNDS, KEY, state, call, systemPrompt, load, extract, majority, gradeAll, type Q, type Reply } from "./lib.ts";

if (!KEY) { console.error("OPENROUTER_API_KEY is not set."); process.exit(1); }
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const SET = arg("--set") || "all", N = Number(arg("--n") || 0), CONC = Number(arg("--concurrency") || 4), OUT = arg("--out") || "dev/benchmark/results";
const GRADER = arg("--grader") || "google/gemini-3.8-flash";
if (arg("--timeout")) state.timeoutMs = Number(arg("--timeout")) * 1000;

// One question, the board's way.
async function runOne(q: Q, order: string[]) {
  const agents = order.map((k) => AGENTS.find((a) => a.key === k)!);
  const parts = [`[User]\n${q.post}`];
  const rounds: Record<string, Reply>[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const transcript = parts.join("\n\n");
    const replies = await Promise.all(agents.map((a) => call(a.model, systemPrompt(a, "opine", round), transcript)));
    const byKey: Record<string, Reply> = {};
    agents.forEach((a, i) => { byKey[a.key] = replies[i]; if (!replies[i].error) parts.push(`[${a.name} (round ${round})]\n${replies[i].body}`); });
    rounds.push(byKey);
  }
  // The agent who went first writes the verdict; if that fails, the next one.
  let verdict: Reply | null = null, judge = "";
  for (const a of agents) { const r = await call(a.model, systemPrompt(a, "verdict", 0), parts.join("\n\n")); judge = a.key; if (!r.error) { verdict = r; break; } verdict = r; }
  // Answers and grades.
  const ans = (r: Reply | null) => (r && !r.error ? extract(r.body, q) : null);
  const r1 = Object.fromEntries(AGENTS.map((a) => [a.key, ans(rounds[0][a.key])]));
  const r2 = Object.fromEntries(AGENTS.map((a) => [a.key, ans(rounds[1][a.key])]));
  const answers: Record<string, string | null> = {};
  for (const a of AGENTS) { answers[`r1.${a.key}`] = r1[a.key]; answers[`r2.${a.key}`] = r2[a.key]; }
  answers.maj1 = majority(order.map((k) => r1[k]), q.set); answers.maj2 = majority(order.map((k) => r2[k]), q.set);
  answers.maj1x = majority(order.map((k) => r1[k]), q.set, true); answers.maj2x = majority(order.map((k) => r2[k]), q.set, true);
  answers.verdict = ans(verdict);
  const g = await gradeAll(q, answers, GRADER);
  const sum = (rs: Record<string, Reply>) => Object.values(rs).reduce((s, r) => s + r.cost, 0);
  const complete = AGENTS.every((a) => !rounds[0][a.key].error) && !!verdict && !verdict.error;
  return {
    id: q.id, set: q.set, category: q.category, gold: q.gold, order, judge, complete, timeoutMs: state.timeoutMs,
    answers: { r1, r2, maj1: answers.maj1, maj2: answers.maj2, maj1x: answers.maj1x, maj2x: answers.maj2x, verdict: answers.verdict },
    correct: Object.fromEntries(Object.entries(g).map(([k, x]) => [k, x.ok])),
    labels: Object.fromEntries(Object.entries(g).map(([k, x]) => [k, x.label])),
    errors: { r1: AGENTS.filter((a) => rounds[0][a.key].error).map((a) => `${a.key}: ${rounds[0][a.key].error}`), r2: AGENTS.filter((a) => rounds[1][a.key].error).map((a) => `${a.key}: ${rounds[1][a.key].error}`), verdict: verdict?.error || null },
    cost: { r1: sum(rounds[0]), r2: sum(rounds[1]), verdict: verdict?.cost || 0, grading: Object.values(g).reduce((s, x) => s + x.cost, 0) },
    seconds: { r1: Math.max(...Object.values(rounds[0]).map((r) => r.seconds)), r2: Math.max(...Object.values(rounds[1]).map((r) => r.seconds)), verdict: verdict?.seconds || 0 },
    text: { verdict: verdict?.body || "", r1: Object.fromEntries(AGENTS.map((a) => [a.key, rounds[0][a.key].body])), r2: Object.fromEntries(AGENTS.map((a) => [a.key, rounds[1][a.key].body])) },
  };
}

mkdirSync(OUT, { recursive: true });
const sets = (SET === "all" ? ["mmlupro", "simpleqa"] : [SET]) as Q["set"][];
for (const set of sets) {
  const file = `${OUT}/${set}.jsonl`;
  // A question counts as done only if its run was complete; an incomplete one runs again and its new row comes last in the file.
  const done = new Set(existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.complete).map((r) => r.id) : []);
  let qs = load(set); if (N) qs = qs.slice(0, N);
  const todo = qs.filter((q) => !done.has(q.id));
  console.log(`${set}: ${qs.length} questions, ${done.size} done, ${todo.length} to run, concurrency ${CONC}, timeout ${state.timeoutMs / 1000} s`);
  let i = 0, spent = 0, ok = { verdict: 0, maj1: 0 }, n = 0;
  const worker = async () => {
    while (i < todo.length && !state.outOfCredit) {
      const idx = i++, q = todo[idx];
      // Rotate who goes first (and writes the verdict), like the board's rotation.
      const start = qs.indexOf(q) % AGENTS.length, order = AGENTS.map((_, k) => AGENTS[(start + k) % AGENTS.length].key);
      try {
        const r = await runOne(q, order);
        appendFileSync(file, JSON.stringify(r) + "\n");
        n++; spent += r.cost.r1 + r.cost.r2 + r.cost.verdict + r.cost.grading; if (r.correct.verdict) ok.verdict++; if (r.correct.maj1) ok.maj1++;
        console.log(`${set} ${n}/${todo.length} ${q.id} judge=${r.judge} verdict=${r.correct.verdict ? "ok" : "no"}(${r.answers.verdict ?? "-"}) maj1=${r.correct.maj1 ? "ok" : "no"} gold=${q.gold.slice(0, 30)} $${(r.cost.r1 + r.cost.r2 + r.cost.verdict).toFixed(3)} total $${spent.toFixed(2)}${r.complete ? "" : " INCOMPLETE"}`);
      } catch (e: any) { console.error(`${set} ${q.id} failed: ${e?.message || e}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, worker));
  console.log(`${set} ${state.outOfCredit ? "STOPPED, out of credit" : "done"}: verdict ${ok.verdict}/${n}, round-1 majority ${ok.maj1}/${n}, spent $${spent.toFixed(2)} this run`);
  if (state.outOfCredit) { console.log("Add OpenRouter credits and run again; it picks up where it stopped."); process.exit(2); }
}
