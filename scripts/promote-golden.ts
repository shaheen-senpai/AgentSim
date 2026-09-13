import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { dataDir, loadRun } from "@/runner/store";

const id = process.argv[2];
if (!id) { console.error("usage: npm run promote:golden -- <runId>"); process.exit(1); }
const run = loadRun(id);
if (!run) { console.error(`No run ${id}`); process.exit(1); }
if (run.status !== "completed") { console.error(`Run ${id} is ${run.status}, not completed`); process.exit(1); }
mkdirSync(path.join(dataDir(), "golden"), { recursive: true });
copyFileSync(path.join(dataDir(), "runs", `${id}.json`), path.join(dataDir(), "golden", `${id}.json`));
console.log(`promoted ${id} · ${run.agent}${run.attack ? ` · ${run.attack.id}` : ""} · Trust Score ${run.score?.headline}${run.score?.capped ? " (capped)" : ""}`);
