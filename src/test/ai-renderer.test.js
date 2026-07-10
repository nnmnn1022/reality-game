import { afterEach, describe, expect, it, vi } from "vitest";
import { renderScenePromptWithAiDetailed } from "../lib/ai-renderer.js";

describe("ai renderer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports timeout status when the provider does not answer in time", async () => {
    vi.stubEnv("AI_MODEL", "gemini-test");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, { signal }) => {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            reject({ name: "AbortError" });
          });
        });
      })
    );

    const result = await renderScenePromptWithAiDetailed(
      {
        missionPrompt: "오늘의 장면을 적어주세요.",
        inputTypes: ["TEXT"]
      },
      { timeoutMs: 1 }
    );

    expect(result.status).toBe("TIMEOUT");
    expect(result.text).toBeNull();
    expect(result.responseCode).toBeNull();
  });
});
