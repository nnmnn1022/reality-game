const TEXT_HINTS = [
  "적어보세요",
  "작성하세요",
  "설명해주세요",
  "기록하세요",
  "말로 남겨주세요",
  "한 문장으로",
  "단어로",
  "이야기해주세요",
  "해석해 보세요",
  "남겨주세요",
  "메시지",
  "기억나는 단어",
  "한 줄"
];

const PHOTO_HINTS = ["사진", "촬영", "찍어보세요", "이미지", "인증샷", "사진으로"];
const COMBO_HINTS = ["사진이나", "사진 또는", "혹은", "또는", "사진을 찍거나", "사진이나 말로"];
const CHOICE_HINTS = ["선택하세요", "고르세요", "어느 쪽", "결정하세요", "선택해보세요", "골라보세요", "선택하고", "고르고"];

function normalizeInputType(inputType) {
  const raw = typeof inputType === "string" ? inputType.trim() : "";
  if (!raw) {
    return { tokens: [], relation: "ALL" };
  }
  if (raw === "TEXT_OR_PHOTO") {
    return { tokens: ["TEXT", "PHOTO"], relation: "ANY" };
  }
  if (raw === "PHOTO_OR_TEXT") {
    return { tokens: ["PHOTO", "TEXT"], relation: "ANY" };
  }
  if (raw.includes("_OR_")) {
    return {
      tokens: raw
        .split(/_OR_/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
      relation: "ANY"
    };
  }
  return {
    tokens: raw
      .split(/[+,_\s]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
    relation: "ALL"
  };
}

function joinInputType(tokens, relation = "ALL") {
  const unique = Array.from(new Set(tokens));
  if (unique.length === 0) {
    return "";
  }
  if (relation === "ANY") {
    if (unique.length === 2 && unique.includes("TEXT") && unique.includes("PHOTO")) {
      return "TEXT_OR_PHOTO";
    }
    return unique.join("_OR_");
  }
  return unique.join("+");
}

function missionText(mission) {
  return `${mission.title ?? ""} ${mission.description ?? ""}`.toLowerCase();
}

function includesAny(text, hints) {
  return hints.some((hint) => text.includes(hint.toLowerCase()));
}

function inferSignals(mission) {
  const text = missionText(mission);
  return {
    text: includesAny(text, TEXT_HINTS),
    photo: includesAny(text, PHOTO_HINTS),
    combo: includesAny(text, COMBO_HINTS),
    choice: includesAny(text, CHOICE_HINTS) || (Array.isArray(mission.choiceOptions) && mission.choiceOptions.length > 0)
  };
}

function expectedInputTokens(mission) {
  const actual = normalizeInputType(mission.inputType);
  const signals = inferSignals(mission);
  const expected = new Set();

  if (signals.combo || (signals.text && signals.photo)) {
    expected.add("TEXT");
    expected.add("PHOTO");
  } else {
    if (signals.text) {
      expected.add("TEXT");
    }
    if (signals.photo) {
      expected.add("PHOTO");
    }
  }

  if (signals.choice && (expected.size === 0 || actual.tokens.includes("CHOICE") || Array.isArray(mission.choiceOptions))) {
    expected.add("CHOICE");
  }

  if (expected.size === 0) {
    actual.tokens.forEach((token) => expected.add(token));
  }

  return Array.from(expected);
}

function defaultPlaceholder(mission) {
  return mission.inputUi?.placeholder ?? "답변을 입력하세요.";
}

function normalizePhotoDeliveryMode(value) {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ["THREAD", "DM"].includes(raw) ? raw : "";
}

function ensureInputUi(mission) {
  const inputUi = mission.inputUi ?? {};
  return {
    title: typeof inputUi.title === "string" && inputUi.title.trim() ? inputUi.title.trim() : mission.title ?? "",
    description:
      typeof inputUi.description === "string" && inputUi.description.trim()
        ? inputUi.description.trim()
        : mission.description ?? "",
    placeholder: typeof inputUi.placeholder === "string" && inputUi.placeholder.trim() ? inputUi.placeholder.trim() : defaultPlaceholder(mission)
  };
}

export function auditMission(mission) {
  const actualInput = normalizeInputType(mission.inputType);
  const actualTokens = actualInput.tokens;
  const actualRelation = actualInput.relation;
  const expectedTokens = expectedInputTokens(mission);
  const signals = inferSignals(mission);
  const inputUi = ensureInputUi(mission);
  const issues = [];

  if (!mission.title?.trim()) {
    issues.push("Title missing");
  }
  if (!mission.description?.trim()) {
    issues.push("Description missing");
  }
  if (expectedTokens.includes("CHOICE") && (!Array.isArray(mission.choiceOptions) || mission.choiceOptions.length === 0)) {
    issues.push("Choice options missing");
  }
  if (expectedTokens.includes("TEXT") && !inputUi.placeholder?.trim()) {
    issues.push("Placeholder missing");
  }
  if (actualTokens.includes("PHOTO")) {
    const mode = normalizePhotoDeliveryMode(mission.photoDeliveryMode);
    if (!mode) {
      issues.push("Photo delivery mode missing");
    }
  }
  if (signals.text && !actualTokens.includes("TEXT")) {
    issues.push("Prompt implies TEXT but inputType omits TEXT");
  }
  if (signals.photo && !actualTokens.includes("PHOTO")) {
    issues.push("Prompt implies PHOTO but inputType omits PHOTO");
  }
  if (signals.choice && !actualTokens.includes("CHOICE")) {
    issues.push("Prompt implies CHOICE but inputType omits CHOICE");
  }
  if (actualTokens.includes("CHOICE") && (!Array.isArray(mission.choiceOptions) || mission.choiceOptions.length === 0)) {
    issues.push("CHOICE mission has no choiceOptions");
  }
  if (actualTokens.includes("TEXT") && !inputUi.placeholder?.trim()) {
    issues.push("TEXT mission has no placeholder");
  }

  return {
    id: mission.id,
    title: mission.title ?? "",
    description: mission.description ?? "",
    actualInputType: joinInputType(actualTokens, actualRelation),
    expectedInputType: joinInputType(expectedTokens, signals.combo || (signals.text && signals.photo) ? "ANY" : actualRelation),
    choiceOptions: Array.isArray(mission.choiceOptions) ? mission.choiceOptions : [],
    photoDeliveryMode: normalizePhotoDeliveryMode(mission.photoDeliveryMode),
    inputUi,
    issues,
    valid: issues.length === 0
  };
}

export function autoFixMission(mission) {
  const audit = auditMission(mission);
  const next = structuredClone(mission);
  next.inputUi = ensureInputUi(mission);

  if (!next.inputUi.placeholder?.trim() && normalizeInputType(next.inputType).tokens.includes("TEXT")) {
    next.inputUi.placeholder = "답변을 입력하세요.";
  }

  const expected = normalizeInputType(audit.expectedInputType);
  if (expected.tokens.length > 0) {
    next.inputType = joinInputType(expected.tokens, expected.relation);
  }
  if (expected.tokens.includes("PHOTO") && !normalizePhotoDeliveryMode(next.photoDeliveryMode)) {
    next.photoDeliveryMode = "THREAD";
  }

  return {
    mission: next,
    audit: auditMission(next)
  };
}

export function auditMissions(missions, { autoFix = false } = {}) {
  const nextMissions = [];
  const reports = [];

  for (const mission of missions) {
    const result = autoFix ? autoFixMission(mission) : { mission, audit: auditMission(mission) };
    nextMissions.push(result.mission);
    reports.push(result.audit);
  }

  return {
    missions: nextMissions,
    reports,
    summary: {
      total: reports.length,
      valid: reports.filter((report) => report.valid).length,
      invalid: reports.filter((report) => !report.valid).length
    }
  };
}

export function renderMissionQaReport(auditResult) {
  const lines = [];
  lines.push("# Mission QA Report");
  lines.push("");
  lines.push(`- Total: ${auditResult.summary.total}`);
  lines.push(`- Valid: ${auditResult.summary.valid}`);
  lines.push(`- Invalid: ${auditResult.summary.invalid}`);
  lines.push("");

  for (const report of auditResult.reports) {
    lines.push(`## ${report.id}`);
    lines.push("");
    lines.push(`- Title: ${report.title || "(missing)"}`);
    lines.push(`- Prompt: ${report.description || "(missing)"}`);
    lines.push(`- Input: ${report.actualInputType || "(missing)"}`);
    lines.push(`- Expected: ${report.expectedInputType || "(missing)"}`);
    lines.push(`- Result: ${report.valid ? "PASS" : "INVALID"}`);
    if (report.photoDeliveryMode) {
      lines.push(`- Photo Delivery Mode: ${report.photoDeliveryMode}`);
    }
    if (report.choiceOptions.length > 0) {
      lines.push(`- Choice Options: ${report.choiceOptions.join(", ")}`);
    }
    lines.push(`- Placeholder: ${report.inputUi.placeholder || "(missing)"}`);
    if (report.issues.length > 0) {
      lines.push(`- Issues: ${report.issues.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
