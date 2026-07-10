const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 15000;

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

function isAbortError(error) {
  return Boolean(error && typeof error === "object" && error.name === "AbortError");
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

function buildAiRequestLog(result) {
  return {
    provider: result.provider,
    elapsedMs: result.elapsedMs,
    status: result.status,
    timeoutMs: result.timeoutMs,
    responseCode: result.responseCode ?? null
  };
}

export async function renderScenePromptWithAiDetailed(context, options = {}) {
  const config = getAiConfig();
  if (!config) {
    return {
      provider: "Gemini",
      status: "DISABLED",
      text: null,
      elapsedMs: 0,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseCode: null,
      requestStartedAt: new Date().toISOString(),
      requestEndedAt: new Date().toISOString(),
      error: null
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestStartedAt = new Date().toISOString();
  const startedAt = Date.now();
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
      timeoutMs
    );

    if (!response.ok) {
      const result = {
        provider: "Gemini",
        status: "ERROR",
        text: null,
        elapsedMs: Date.now() - startedAt,
        timeoutMs,
        responseCode: response.status,
        requestStartedAt,
        requestEndedAt: new Date().toISOString(),
        error: `HTTP_${response.status}`
      };
      console.warn("AI Request", buildAiRequestLog(result));
      return result;
    }

    const data = await response.json();
    const text = extractTextFromGeminiResponse(data);
    const result = {
      provider: "Gemini",
      status: text ? "SUCCESS" : "EMPTY",
      text,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      responseCode: response.status,
      requestStartedAt,
      requestEndedAt: new Date().toISOString(),
      error: null
    };
    console.info("AI Request", buildAiRequestLog(result));
    return result;
  } catch (error) {
    const timedOut = isAbortError(error);
    const result = {
      provider: "Gemini",
      status: timedOut ? "TIMEOUT" : "ERROR",
      text: null,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      responseCode: null,
      requestStartedAt,
      requestEndedAt: new Date().toISOString(),
      error: timedOut ? "TIMEOUT" : "REQUEST_FAILED"
    };
    console.warn("AI Request", buildAiRequestLog(result));
    return result;
  }
}

export async function renderScenePromptWithAi(context, options = {}) {
  const result = await renderScenePromptWithAiDetailed(context, options);
  return result.text;
}
