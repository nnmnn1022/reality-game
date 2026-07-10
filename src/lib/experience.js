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

function now() {
  return new Date().toISOString();
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

function missionToBeat(stage, mission) {
  const inputType = typeof mission.inputType === "string" && mission.inputType.trim() ? mission.inputType.trim() : "TEXT";
  const inputUi = buildMissionInputUi(mission);
  return {
    id: `beat-${mission.id}`,
    stageId: stage.id,
    lifecycle: "Prepared",
    mission: {
      title: inputUi.title,
      description: inputUi.description,
      placeholder: inputUi.placeholder,
      interaction_pattern: mission.interactionPattern ?? "Talk",
      constraint: mission.constraint ?? (mission.requiredTags.join(", ") || "none"),
      input_type: inputType,
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
      endedAt: null
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
  return {
    ...experience,
    status: "Playing",
    currentStageId: experience.currentStageId ?? null
  };
}

export function endExperience(experience) {
  return {
    ...experience,
    status: "Ended",
    endedAt: now()
  };
}

export function buildStoryBeatForExperience(experience, stage) {
  const candidateMission =
    missionPool.find((mission) => mission.phase === "early" && mission.safetyFlags.includes("safe")) ?? missionPool[0];
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
  return stages.find((stage) => stage.id === nextStageId) ?? stages[0] ?? null;
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

export function summarizeMemoryCandidate(event) {
  const payload = event.payload;
  const summaryParts = [event.type];
  if (typeof payload.text === "string" && payload.text.trim()) {
    summaryParts.push(payload.text.trim());
  } else if (typeof payload.choice === "string") {
    summaryParts.push(payload.choice);
  } else if (typeof payload.message === "string") {
    summaryParts.push(payload.message);
  }
  return summaryParts.join(": ");
}
