import missions from "../../data/missions.json" with { type: "json" };

export const FLOW_LIBRARY = [
  {
    id: "adventure",
    name: "Adventure",
    target: "Exploration",
    coverageDefinition: ["Exploration", "Discovery", "Challenge", "Reflection"],
    stageGraph: ["Exploration", "Discovery", "Challenge", "Reflection"]
  },
  {
    id: "bond",
    name: "Bond",
    target: "Bond",
    coverageDefinition: ["Conversation", "Cooperation", "Understanding", "Memory"],
    stageGraph: ["Conversation", "Cooperation", "Understanding", "Memory"]
  },
  {
    id: "mystery",
    name: "Mystery",
    target: "Mystery",
    coverageDefinition: ["Question", "Clue", "Reveal", "Resolution"],
    stageGraph: ["Question", "Clue", "Reveal", "Resolution"]
  },
  {
    id: "chaos-trip",
    name: "Chaos",
    target: "Chaos",
    coverageDefinition: ["Awkward", "Chaos", "Callback", "Group Laughter"],
    stageGraph: ["Awkward", "Chaos", "Callback", "Group Laughter"]
  },
  {
    id: "random",
    name: "Random",
    target: "Random",
    coverageDefinition: ["Unexpected", "Variation", "Shift", "Afterglow"],
    stageGraph: ["Unexpected", "Variation", "Shift", "Afterglow"]
  }
];

const missionPool = missions;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function missionMetadata(mission) {
  const expectedDuration = Number(mission.expectedDuration ?? mission.durationMinutes ?? 5);
  const minimumParticipants = Number(mission.minimumParticipants ?? 1);
  return {
    actionType: normalizeString(mission.actionType).toLowerCase() || "write",
    purpose: normalizeString(mission.purpose).toLowerCase() || "exploration",
    semanticKey: normalizeString(mission.semanticKey) || mission.id,
    semanticGroup: normalizeString(mission.semanticGroup) || normalizeString(mission.semanticKey) || mission.id,
    expectedDuration: Number.isFinite(expectedDuration) && expectedDuration > 0 ? Math.round(expectedDuration) : 5,
    minimumParticipants: Number.isFinite(minimumParticipants) && minimumParticipants > 0 ? Math.round(minimumParticipants) : 1,
    resultType: normalizeString(mission.resultType) || "text"
  };
}

function enrichMission(mission) {
  return {
    ...mission,
    ...missionMetadata(mission)
  };
}

const enrichedMissionPool = missionPool.map(enrichMission);

function now() {
  return new Date().toISOString();
}

function addMinutes(isoString, minutes) {
  const timestamp = Date.parse(isoString ?? "");
  if (Number.isNaN(timestamp) || !Number.isFinite(minutes)) {
    return null;
  }
  return new Date(timestamp + minutes * 60 * 1000).toISOString();
}

function normalizeDurationMinutes(value, fallback = 60) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return fallback;
  }
  return Math.round(minutes);
}

function newId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listFlows() {
  return FLOW_LIBRARY;
}

export function getFlowById(flowId) {
  return FLOW_LIBRARY.find((flow) => flow.id === flowId) ?? null;
}

export function getMissionById(missionId) {
  return enrichedMissionPool.find((mission) => mission.id === missionId) ?? null;
}

function buildStages(flow) {
  return flow.stageGraph.map((stageName, index) => ({
    id: `${flow.id}-${stageName.toLowerCase()}`,
    flowId: flow.id,
    name: stageName,
    purpose:
      stageName === "Exploration"
        ? "낯선 환경과 친해진다."
        : stageName === "Discovery"
          ? "새로운 단서를 발견한다."
          : stageName === "Challenge"
            ? "작은 긴장과 선택을 만든다."
            : stageName === "Reflection"
              ? "지나온 장면을 정리한다."
              : stageName === "Conversation"
                ? "사람과 대화하며 관계를 만든다."
                : stageName === "Cooperation"
                  ? "팀이 함께 움직인다."
                  : stageName === "Understanding"
                    ? "서로를 더 잘 이해한다."
                    : stageName === "Memory"
                      ? "기억에 남을 장면을 남긴다."
                      : stageName === "Question"
                        ? "질문을 던져 시작한다."
                        : stageName === "Clue"
                          ? "작은 단서를 수집한다."
                          : stageName === "Reveal"
                            ? "숨은 연결을 드러낸다."
                            : stageName === "Resolution"
                              ? "정리와 마무리를 만든다."
                              : stageName === "Awkward"
                                ? "어색함을 장면으로 바꾼다."
                                : stageName === "Chaos"
                                  ? "예상 밖의 상황을 받아들인다."
                                  : stageName === "Callback"
                                    ? "이전 장면을 다시 불러온다."
                                    : stageName === "Unexpected"
                                      ? "예상 밖의 변화를 받아들인다."
                                      : stageName === "Variation"
                                        ? "익숙한 패턴을 조금 비튼다."
                                        : stageName === "Shift"
                                          ? "흐름의 방향을 바꾼다."
                                          : stageName === "Afterglow"
                                            ? "남은 여운을 정리한다."
                                            : "함께 웃을 장면을 만든다.",
    allowedNextStageIds: flow.stageGraph
      .slice(index + 1, index + 2)
      .map((nextStage) => `${flow.id}-${nextStage.toLowerCase()}`)
  }));
}

function stagePurposeToPrompt(stage, mission) {
  if (mission.promptHint) {
    return mission.promptHint;
  }
  return `${stage.purpose} ${mission.description}`;
}

function buildMissionInputUi(mission) {
  const inputUi = mission.inputUi ?? {};
  return {
    title: typeof inputUi.title === "string" && inputUi.title.trim() ? inputUi.title.trim() : mission.title,
    description:
      typeof inputUi.description === "string" && inputUi.description.trim()
        ? inputUi.description.trim()
        : typeof mission.description === "string"
          ? mission.description.trim()
          : "",
    placeholder:
      typeof inputUi.placeholder === "string" && inputUi.placeholder.trim()
        ? inputUi.placeholder.trim()
        : "답변을 입력하세요."
  };
}

function parseMissionInputType(inputType) {
  const raw = typeof inputType === "string" ? inputType.trim().toUpperCase() : "";
  if (!raw) {
    return { inputTypes: ["TEXT"], inputRelation: "ALL" };
  }
  if (raw === "TEXT_OR_PHOTO" || raw === "PHOTO_OR_TEXT") {
    return { inputTypes: ["TEXT", "PHOTO"], inputRelation: "ANY" };
  }
  if (raw.includes("_OR_")) {
    return {
      inputTypes: raw.split(/_OR_/).map((value) => value.trim()).filter(Boolean),
      inputRelation: "ANY"
    };
  }
  return {
    inputTypes: raw
      .split(/[+,]/)
      .map((value) => value.trim())
      .filter(Boolean),
    inputRelation: "ALL"
  };
}

function missionToBeat(stage, mission) {
  const inputType = typeof mission.inputType === "string" && mission.inputType.trim() ? mission.inputType.trim() : "TEXT";
  const { inputTypes, inputRelation } = parseMissionInputType(inputType);
  const inputUi = buildMissionInputUi(mission);
  return {
    id: `beat-${stage.id}-${mission.id}`,
    stageId: stage.id,
    lifecycle: "Prepared",
    mission: {
      id: mission.id,
      title: inputUi.title,
      description: inputUi.description,
      placeholder: inputUi.placeholder,
      photo_delivery_mode: typeof mission.photoDeliveryMode === "string" && mission.photoDeliveryMode.trim()
        ? mission.photoDeliveryMode.trim().toUpperCase()
        : null,
      interaction_pattern: mission.interactionPattern ?? "Talk",
      constraint: mission.constraint ?? (mission.requiredTags.join(", ") || "none"),
      input_type: inputType,
      input_types: inputTypes,
      input_relation: inputRelation,
      input_options: Array.isArray(mission.choiceOptions) ? mission.choiceOptions : [],
      prompt_hint: stagePurposeToPrompt(stage, mission)
    },
    playRule: {
      visibility: "Everyone",
      participation: "Any",
      response_policy: "First",
      timeout: "Optional",
      completion_condition: "InputReceived"
    },
    trigger: "InputReceived",
    result: "BranchOrMemoryCandidate"
  };
}

export function buildCoverage(flow) {
  return {
    achieved: [],
    pending: flow?.coverageDefinition ? [...flow.coverageDefinition] : []
  };
}

export function createExperience(params) {
  const flow = typeof params.flowId === "string" && params.flowId.trim() ? getFlowById(params.flowId.trim()) : null;
  const startedAt = typeof params.startedAt === "string" && params.startedAt.trim() ? params.startedAt.trim() : null;
  const plannedDurationMinutes = normalizeDurationMinutes(params.plannedDurationMinutes ?? 60);
  const participants = (params.participantNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({ id: `player-${index + 1}`, name }));
  const stages = flow ? buildStages(flow) : [];
  return {
    experience: {
      id: params.experienceId ?? newId("experience"),
      status: participants.length > 0 ? "Configured" : "Created",
      flowId: flow?.id ?? null,
      participants,
      currentStageId: stages[0]?.id ?? null,
      currentStoryBeatId: null,
      coverage: buildCoverage(flow ?? null),
      createdAt: params.createdAt ?? now(),
      startedAt,
      plannedDurationMinutes,
      plannedEndAt: startedAt ? addMinutes(startedAt, plannedDurationMinutes) : null,
      endedAt: null,
      endingText: ""
    },
    flow,
    stages,
    storyBeats: []
  };
}

export function addParticipant(experience, playerName) {
  const name = playerName.trim();
  if (!name) {
    return experience;
  }
  if (experience.participants.some((player) => player.name === name)) {
    return experience;
  }
  return {
    ...experience,
    participants: [...experience.participants, { id: `player-${experience.participants.length + 1}`, name }],
    status: experience.status === "Created" ? "Configured" : experience.status
  };
}

export function removeParticipant(experience, playerId) {
  return {
    ...experience,
    participants: experience.participants.filter((player) => player.id !== playerId)
  };
}

export function setFlow(experience, flowId) {
  const flow = typeof flowId === "string" && flowId.trim() ? getFlowById(flowId.trim()) : null;
  if (!flow) {
    return {
      experience: {
        ...experience,
        flowId: null,
        currentStageId: null,
        coverage: buildCoverage(null)
      },
      flow: null,
      stages: []
    };
  }
  const stages = buildStages(flow);
  return {
    experience: {
      ...experience,
      flowId: flow.id,
      status: experience.status === "Created" ? "Configured" : experience.status,
      currentStageId: stages[0]?.id ?? null,
      coverage: buildCoverage(flow)
    },
    flow,
    stages
  };
}

export function startExperience(experience) {
  const startedAt = experience.startedAt ?? now();
  const plannedDurationMinutes = normalizeDurationMinutes(experience.plannedDurationMinutes ?? 60);
  return {
    ...experience,
    status: "Playing",
    currentStageId: experience.currentStageId ?? null,
    startedAt,
    plannedDurationMinutes,
    plannedEndAt: addMinutes(startedAt, plannedDurationMinutes)
  };
}

export function endExperience(experience) {
  return {
    ...experience,
    status: "Ended",
    endedAt: now()
  };
}

export function setExperiencePlannedDuration(experience, plannedDurationMinutes) {
  const normalizedMinutes = normalizeDurationMinutes(plannedDurationMinutes, experience.plannedDurationMinutes ?? 60);
  const startedAt = experience.startedAt ?? now();
  return {
    ...experience,
    startedAt,
    plannedDurationMinutes: normalizedMinutes,
    plannedEndAt: addMinutes(startedAt, normalizedMinutes)
  };
}

export function adjustExperiencePlannedDuration(experience, deltaMinutes) {
  const currentMinutes = normalizeDurationMinutes(experience.plannedDurationMinutes ?? 60, 60);
  const nextMinutes = Math.max(1, currentMinutes + Number(deltaMinutes));
  return setExperiencePlannedDuration(experience, nextMinutes);
}

export function isExperienceTimeExpired(experience, referenceTime = now()) {
  if (!experience?.plannedEndAt) {
    return false;
  }
  const currentTime = Date.parse(referenceTime);
  const plannedEndAt = Date.parse(experience.plannedEndAt);
  if (Number.isNaN(currentTime) || Number.isNaN(plannedEndAt)) {
    return false;
  }
  return currentTime >= plannedEndAt;
}

export function getExperienceRemainingMinutes(experience, referenceTime = now()) {
  if (!experience?.plannedEndAt) {
    return null;
  }
  const currentTime = Date.parse(referenceTime);
  const plannedEndAt = Date.parse(experience.plannedEndAt);
  if (Number.isNaN(currentTime) || Number.isNaN(plannedEndAt)) {
    return null;
  }
  return Math.max(0, Math.ceil((plannedEndAt - currentTime) / 60000));
}

export function recordMissionProgress(experience, mission) {
  if (!experience || !mission) {
    return experience;
  }
  const missionEntry = {
    id: mission.id,
    actionType: mission.actionType,
    purpose: mission.purpose,
    semanticKey: mission.semanticKey,
    semanticGroup: mission.semanticGroup,
    completedAt: now()
  };
  const missionHistory = [...(experience.missionHistory ?? []), missionEntry].slice(-8);
  const recentActionTypes = [...(experience.recentActionTypes ?? []), mission.actionType].slice(-4);
  const usedPurposeCounts = {
    ...(experience.usedPurposeCounts ?? {}),
    [mission.purpose]: (experience.usedPurposeCounts?.[mission.purpose] ?? 0) + 1
  };
  const usedSemanticKeys = Array.from(new Set([...(experience.usedSemanticKeys ?? []), mission.semanticKey]));
  const usedSemanticGroups = Array.from(new Set([...(experience.usedSemanticGroups ?? []), mission.semanticGroup]));
  const usedSemanticKeySet = [...usedSemanticKeys];
  const usedSemanticGroupSet = [...usedSemanticGroups];
  return {
    ...experience,
    missionHistory,
    recentActionTypes,
    usedPurposeCounts,
    usedSemanticKeys: usedSemanticKeySet,
    usedSemanticGroups: usedSemanticGroupSet
  };
}

function phaseForStage(stageName) {
  const normalized = String(stageName ?? "").toLowerCase();
  if (["exploration", "conversation", "question", "awkward", "unexpected"].includes(normalized)) {
    return "early";
  }
  if (["discovery", "cooperation", "clue", "chaos", "variation"].includes(normalized)) {
    return "middle";
  }
  return "late";
}

function buildMissionHistoryFromIds(completedMissionIds = []) {
  const history = [];
  for (const missionId of completedMissionIds) {
    const mission = getMissionById(missionId);
    if (!mission) {
      continue;
    }
    history.push({
      id: mission.id,
      actionType: mission.actionType,
      purpose: mission.purpose,
      semanticKey: mission.semanticKey,
      semanticGroup: mission.semanticGroup
    });
  }
  return history;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = normalizeString(item?.[key]).toLowerCase();
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function isLowIntensityAction(actionType) {
  return ["write", "choose", "talk"].includes(normalizeString(actionType).toLowerCase());
}

function getRecent(items, count) {
  return items.slice(Math.max(0, items.length - count));
}

function isReflectionAllowed(experience, usedPurposeCounts = {}, usedSemanticGroups = new Set()) {
  const plannedDurationMinutes = Number(experience?.plannedDurationMinutes ?? 0);
  const reflectionCount = Number(usedPurposeCounts.reflection ?? 0);
  const closingMessageUsed = usedSemanticGroups.has("closing_message");
  if (closingMessageUsed) {
    return false;
  }
  if (!Number.isFinite(plannedDurationMinutes) || plannedDurationMinutes <= 0 || plannedDurationMinutes < 90) {
    return reflectionCount === 0;
  }
  if (plannedDurationMinutes < 240) {
    return reflectionCount < 1;
  }
  return reflectionCount < 2;
}

function evaluateMissionCandidate(mission, context) {
  const completedMissionIds = new Set(context.completedMissionIds ?? []);
  const missionHistory = context.missionHistory ?? [];
  if (completedMissionIds.has(mission.id)) {
    return { allowed: false, reason: "completed" };
  }
  if (context.phase && mission.phase !== "any" && mission.phase !== context.phase) {
    return { allowed: false, reason: "phase" };
  }
  if (Array.isArray(context.environmentTags) && context.environmentTags.length > 0) {
    if (!mission.requiredTags.every((tag) => context.environmentTags.includes(tag))) {
      return { allowed: false, reason: "tags" };
    }
    if (mission.blockedTags.some((tag) => context.environmentTags.includes(tag))) {
      return { allowed: false, reason: "blocked-tags" };
    }
  }
  if (context.participantCount < mission.minimumParticipants) {
    return { allowed: false, reason: "participants" };
  }
  if (context.endingRequested && mission.purpose !== "reflection" && mission.purpose !== "callback") {
    return { allowed: false, reason: "ending" };
  }

  const recentMission = missionHistory.at(-1) ?? null;
  const recentTypes = getRecent(missionHistory, 4).map((item) => item.actionType);
  const recentTypeCount = recentTypes.filter((value) => value === mission.actionType).length;
  if (recentMission && recentMission.actionType === mission.actionType && !context.allowSafetyRepeat) {
    return { allowed: false, reason: "repeat-action" };
  }
  if (recentTypeCount >= 2 && !context.allowSafetyRepeat) {
    return { allowed: false, reason: "recent-repeat" };
  }

  const recentLowIntensity = getRecent(missionHistory, 2);
  if (
    recentLowIntensity.length === 2 &&
    recentLowIntensity.every((item) => isLowIntensityAction(item.actionType)) &&
    isLowIntensityAction(mission.actionType)
  ) {
    return { allowed: false, reason: "low-intensity-streak" };
  }

  const usedPurposeCounts = context.usedPurposeCounts ?? {};
  const usedSemanticGroups = context.usedSemanticGroups ?? new Set();
  const usedSemanticKeys = context.usedSemanticKeys ?? new Set();
  if (usedSemanticKeys.has(mission.semanticKey) || usedSemanticGroups.has(mission.semanticGroup)) {
    return { allowed: false, reason: "semantic-repeat" };
  }
  if (mission.purpose === "reflection" && !isReflectionAllowed(context.experience, usedPurposeCounts, usedSemanticGroups)) {
    return { allowed: false, reason: "reflection-limit" };
  }
  if (mission.purpose === "callback" && usedSemanticGroups.has("closing_message")) {
    return { allowed: false, reason: "callback-closing-repeat" };
  }

  return { allowed: true };
}

function scoreMissionCandidate(mission, context) {
  const history = context.missionHistory ?? [];
  let score = 100;
  const lastActionType = history.at(-1)?.actionType ?? null;
  const lastPurpose = history.at(-1)?.purpose ?? null;

  if (mission.actionType === lastActionType) {
    score -= 100;
  }
  if (mission.purpose === lastPurpose) {
    score -= 20;
  }
  if (mission.purpose === "reflection") {
    score -= 10;
  }
  if (["move", "capture", "cooperate", "collect", "perform", "create"].includes(mission.actionType)) {
    score += 15;
  }
  if (["write", "choose", "talk"].includes(mission.actionType)) {
    score -= 5;
  }
  if (mission.category === "rest") {
    score += 8;
  }
  if (mission.purpose === "callback") {
    score += 12;
  }
  if (mission.purpose === "exploration" && context.phase === "early") {
    score += 10;
  }
  if (mission.purpose === "interaction" && context.phase === "middle") {
    score += 10;
  }
  if (mission.purpose === "recovery" && context.phase === "late") {
    score += 10;
  }
  return score;
}

function selectMissionCandidate(candidates, context) {
  const scored = candidates
    .map((mission) => {
      const evaluation = evaluateMissionCandidate(mission, context);
      if (!evaluation.allowed) {
        return null;
      }
      return {
        mission,
        score: scoreMissionCandidate(mission, context)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.mission ?? null;
}

function fallbackMissionCandidate(candidates, context) {
  const relaxed = candidates.filter((mission) => mission.safetyFlags.includes("safe"));
  return relaxed.find((mission) => evaluateMissionCandidate(mission, { ...context, allowSafetyRepeat: true }).allowed) ?? null;
}

export function buildStoryBeatForExperience(experience, stage, options = {}) {
  if (!stage) {
    return null;
  }
  const missionHistory = options.missionHistory ?? buildMissionHistoryFromIds(options.completedMissionIds ?? []);
  const usedPurposeCounts = options.usedPurposeCounts ?? Object.fromEntries(countBy(missionHistory, "purpose"));
  const usedSemanticKeys = options.usedSemanticKeys ?? new Set(missionHistory.map((item) => item.semanticKey));
  const usedSemanticGroups = options.usedSemanticGroups ?? new Set(missionHistory.map((item) => item.semanticGroup));
  const context = {
    experience,
    phase: phaseForStage(stage.name),
    missionHistory,
    completedMissionIds: options.completedMissionIds ?? [],
    usedPurposeCounts,
    usedSemanticKeys,
    usedSemanticGroups,
    environmentTags: options.environmentTags ?? [],
    participantCount: options.participantCount ?? experience.participants?.length ?? 1,
    endingRequested: Boolean(options.endingRequested),
    allowSafetyRepeat: Boolean(options.allowSafetyRepeat)
  };

  const safeMissions = enrichedMissionPool.filter((mission) => mission.safetyFlags.includes("safe") && mission.category !== "emergency");
  const phaseMissions = safeMissions.filter((mission) => mission.phase === context.phase);
  const anyMissions = safeMissions.filter((mission) => mission.phase === "any");
  const candidates = [...phaseMissions, ...anyMissions];
  const candidateMission = selectMissionCandidate(candidates, context) ?? fallbackMissionCandidate(candidates, context);
  if (!stage || !candidateMission) {
    return null;
  }
  const beat = missionToBeat(stage, candidateMission);
  return {
    ...beat,
    lifecycle: experience.status === "Playing" ? "Active" : "Prepared",
    mission: beat.mission
  };
}

export function currentStage(flow, stageId) {
  if (!flow || !stageId) {
    return null;
  }
  return buildStages(flow).find((stage) => stage.id === stageId) ?? null;
}

export function chooseNextStage(flow, currentStageId) {
  if (!flow) {
    return null;
  }
  const stages = buildStages(flow);
  const current = stages.find((stage) => stage.id === currentStageId) ?? stages[0] ?? null;
  if (!current) {
    return null;
  }
  const nextStageId = current.allowedNextStageIds[0];
  return stages.find((stage) => stage.id === nextStageId) ?? null;
}

export function createEvent(type, source, payload = {}) {
  return {
    id: newId("event"),
    type,
    source,
    payload,
    createdAt: now()
  };
}

export function createInput(experienceId, storyBeatId, playerId, type, payload) {
  return {
    id: newId("input"),
    experienceId,
    storyBeatId,
    playerId,
    type,
    payload,
    createdAt: now()
  };
}

export function createResult(storyBeatId, type, payload) {
  return {
    id: newId("result"),
    storyBeatId,
    type,
    payload,
    createdAt: now()
  };
}

export function advanceExperienceProgress(experience, completedStageName) {
  if (!experience) {
    return experience;
  }
  const achieved = Array.from(new Set([...(experience.coverage?.achieved ?? []), completedStageName].filter(Boolean)));
  const pending = (experience.coverage?.pending ?? []).filter((item) => item !== completedStageName);
  return {
    ...experience,
    coverage: {
      achieved,
      pending
    }
  };
}

export function createStoryMemory(params) {
  return {
    id: newId("memory"),
    sourceEventIds: params.sourceEventIds,
    sourceSceneId: params.sourceSceneId,
    summary: params.summary,
    tags: params.tags,
    callbackWeight: params.callbackWeight
  };
}

export function renderScene(params) {
  const title = params.title ?? "🎬 오늘의 장면";
  const lines = [title];
  if (params.headline) {
    lines.push("");
    lines.push(params.headline);
  }
  if (params.prompt) {
    lines.push("");
    lines.push(params.prompt);
  } else if (!params.headline) {
    lines.push("");
    lines.push("장면을 준비하고 있습니다.");
  }
  if (params.detail) {
    lines.push("");
    lines.push(params.detail);
  }
  if (params.memory?.summary) {
    lines.push("");
    lines.push(`↪ ${params.memory.summary}`);
  }
  return lines.join("\n");
}

export function renderCallbackScene(sceneNumber, summary) {
  return [`↪ Scene ${String(sceneNumber).padStart(2, "0")}`, "", summary].join("\n");
}

export function renderEndingNarrative(experience, memories) {
  const flow = getFlowById(experience.flowId);
  const header = flow ? `${flow.name} 경험의 끝` : "경험의 끝";
  const memoryLines =
    memories.length > 0 ? memories.map((memory) => `- ${memory.summary}`).join("\n") : "- 남은 기억은 아직 적지만 시작은 충분했습니다.";
  return [header, "", memoryLines].join("\n");
}

export function buildEndingStoryMemoryContext(experience, memories = [], results = []) {
  return {
    experienceId: experience?.id ?? null,
    flowId: experience?.flowId ?? null,
    flowName: getFlowById(experience?.flowId)?.name ?? null,
    startedAt: experience?.startedAt ?? null,
    plannedEndAt: experience?.plannedEndAt ?? null,
    participants: Array.isArray(experience?.participants) ? experience.participants.map((participant) => participant.name) : [],
    memories: memories.map((memory, index) => ({
      index: index + 1,
      summary: memory?.summary ?? "",
      tags: Array.isArray(memory?.tags) ? memory.tags : [],
      sourceSceneId: memory?.sourceSceneId ?? null
    })),
    results: results.map((result, index) => ({
      index: index + 1,
      type: result?.type ?? null,
      payload: result?.payload ?? null,
      createdAt: result?.createdAt ?? null
    }))
  };
}

export function summarizeMemoryCandidate(event) {
  const payload = event.payload;
  if (typeof payload.text === "string" && payload.text.trim()) {
    return payload.text.trim();
  }
  if (typeof payload.choice === "string" && payload.choice.trim()) {
    return payload.choice.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    return "사진을 남겼습니다.";
  }
  if (typeof payload.content === "string" && payload.content.trim()) {
    return payload.content.trim();
  }
  return "기록이 남았습니다.";
}
