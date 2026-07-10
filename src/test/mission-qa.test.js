import missions from "../../data/missions.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { auditMissions, renderMissionQaReport } from "../lib/mission-qa.js";

describe("mission qa", () => {
  it("keeps all missions aligned with their declared UI and input rules", () => {
    const audit = auditMissions(missions);
    expect(audit.summary.invalid).toBe(0);
    expect(audit.summary.valid).toBe(missions.length);
    expect(renderMissionQaReport(audit)).toContain("Mission QA Report");
    expect(renderMissionQaReport(audit)).toContain("7");
  });
});
