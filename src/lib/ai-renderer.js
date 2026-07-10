const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 1200;

function getAiConfig() {
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !model) {
    return null;
  }
  return { apiKey, model };
}

function buildScenePrompt(context) {
  const lines = [
    "You are a Discord scene renderer for a Korean game.",
    "Write plain Korean text only.",
    "Do not mention internal engine terms such as Flow, Stage, Coverage, State, Adventure, or Mission.",
    "Do not use markdown, bullets, or quotes.",
    "Keep it concise and actionable.",
    "",
    `Mission prompt: ${context.missionPrompt ?? "없음"}`
  ];
  if (Array.isArray(context.inputTypes) && context.inputTypes.length > 0) {
    lines.push(`Required input types: ${context.inputTypes.join(", ")}`);
  }
  if (Array.isArray(context.choiceOptions) && context.choiceOptions.length > 0) {
    lines.push(`Choice options: ${context.choiceOptions.join(", ")}`);
  }
  if (typeof context.memorySummary === "string" && context.memorySummary.trim()) {
    lines.push(`Recent memory: ${context.memorySummary.trim()}`);
  }
  lines.push("");
  lines.push("Return a short scene prompt for players.");
  return lines.join("\n");
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new globalThis.AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function extractTextFromGeminiResponse(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  return null;
}

export async function renderScenePromptWithAi(context) {
  const config = getAiConfig();
  if (!config) {
    return null;
  }

  const endpoint = `${GEMINI_BASE_URL}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildScenePrompt(context)
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 180
    }
  };

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      DEFAULT_TIMEOUT_MS
    );

    if (!response.ok) {
      console.warn(`AI renderer fallback: Gemini response ${response.status}`);
      return null;
    }

    const data = await response.json();
    return extractTextFromGeminiResponse(data);
  } catch {
    console.warn("AI renderer fallback: Gemini request failed or timed out");
    return null;
  }
}
