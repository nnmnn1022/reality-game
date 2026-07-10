#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditMissions, renderMissionQaReport } from "../src/lib/mission-qa.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const missionsPath = resolve(scriptDir, "../data/missions.json");
const reportPath = resolve(scriptDir, "../data/mission-qa-report.md");
const shouldFix = process.argv.includes("--fix");

const raw = await readFile(missionsPath, "utf8");
const missions = JSON.parse(raw);
const auditResult = auditMissions(missions, { autoFix: shouldFix });

if (shouldFix) {
  await writeFile(missionsPath, `${JSON.stringify(auditResult.missions, null, 2)}\n`, "utf8");
}

const report = renderMissionQaReport(auditResult);
await writeFile(reportPath, `${report}\n`, "utf8");

const statusLine = `Mission QA complete: ${auditResult.summary.valid}/${auditResult.summary.total} valid`;
console.log(statusLine);
if (auditResult.summary.invalid > 0) {
  process.exitCode = 1;
}
