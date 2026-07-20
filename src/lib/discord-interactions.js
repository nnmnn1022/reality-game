import crypto from "node:crypto";
import {
  buildCoverage,
  buildEndingStoryMemoryContext,
  buildStoryBeatForExperience,
  advanceExperienceProgress,
  chooseNextStage,
  createEvent,
  createExperience,
  createResult,
  endExperience,
  getFlowById,
  getExperienceRemainingMinutes,
  listFlows,
  renderScene,
  isExperienceTimeExpired,
  adjustExperiencePlannedDuration,
  setExperiencePlannedDuration,
  recordMissionProgress,
  setFlow,
  startExperience,
  summarizeMemoryCandidate
} from "./experience.js";
import { renderEndingNarrativeWithAi, renderScenePromptWithAi } from "./ai-renderer.js";
import {
  buildSessionRecord,
  completeMission,
  finishGame,
  generateEnding,
  goCheckpoint,
  phaseLabel,
  resetGame,
  selectNextMission,
  startGame,
  useEmergencyMission,
  createSessionKey,
  getMissionById
} from "./game.js";
import { loadSession, resetSession, saveSession } from "./session-store.js";

const LOBBY_CAPACITY = 4;
const sessionExecutionQueues = new Map();

function enqueueSessionTask(sessionKey, task) {
  const previous = sessionExecutionQueues.get(sessionKey) ?? Promise.resolve();
  const current = previous.then(task, task);
  const tracked = current.catch(() => undefined);
  sessionExecutionQueues.set(sessionKey, tracked);
  return current.finally(() => {
    if (sessionExecutionQueues.get(sessionKey) === tracked) {
      sessionExecutionQueues.delete(sessionKey);
    }
  });
}

function collectOptionValues(options, target = {}) {
  for (const option of options ?? []) {
    if (option.options?.length) {
      collectOptionValues(option.options, target);
      continue;
    }
    if (typeof option.value === "string") {
      target[option.name] = option.value;
    }
  }
  return target;
}

function getAuthor(interaction) {
  const user = interaction.member?.user ?? interaction.user;
  return {
    id: user?.id ?? "unknown",
    name: user?.username ?? user?.global_name ?? "플레이어"
  };
}

function parseStartOptions(interaction) {
  const options = collectOptionValues(interaction.data?.options);
  const playerNames = (options.players ?? options.player_names ?? options.players_list ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const environmentTags = (options.tags ?? options.environment_tags ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const flowId = (options.flow ?? options.flow_id ?? options.flowName ?? "").trim();
  const durationMinutes = Number(options.duration_minutes ?? options.duration ?? options.minutes);
  return {
    playerNames,
    environmentTags,
    flowId,
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? Math.round(durationMinutes) : null
  };
}

function getSessionUi(state) {
  return state.ui ?? { screen: "main-menu" };
}

function withUi(state, uiPatch) {
  return {
    ...state,
    ui: {
      ...getSessionUi(state),
      ...uiPatch
    }
  };
}

function getLobbyCapacity(state) {
  return state.ui?.lobby?.capacity ?? LOBBY_CAPACITY;
}

function isPlayingState(state) {
  return state.experience?.status === "Playing" || state.phase === "PLAYING";
}

function hasLobbyState(state) {
  return state.ui?.screen === "lobby";
}

function renderMainMenuContent() {
  return ["🎮 Reality Mission Engine", "", "오늘의 Experience를 시작합니다."].join("\n");
}

function buildMainMenuButtons() {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: "menu:new-game", label: "새 Experience" },
        { type: 2, style: 2, custom_id: "menu:join-game", label: "Experience 참가" },
        { type: 2, style: 3, custom_id: "menu:resume", label: "이어하기" }
      ]
    }
  ];
}

function renderMainMenuResponse() {
  return {
    type: 4,
    data: {
      content: renderMainMenuContent(),
      components: buildMainMenuButtons()
    }
  };
}

function getLobbySelectedDuration(state) {
  const plannedDurationMinutes = state.experience?.plannedDurationMinutes ?? state.ui?.lobby?.plannedDurationMinutes ?? null;
  return Number.isFinite(Number(plannedDurationMinutes)) && Number(plannedDurationMinutes) > 0 ? Math.round(Number(plannedDurationMinutes)) : null;
}

function buildLobbyButtons(state, disabled = false) {
  const selectedDuration = getLobbySelectedDuration(state);
  const readyDisabled = disabled || !selectedDuration;
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: "lobby:join", label: "참가하기", disabled },
        { type: 2, style: 3, custom_id: "lobby:ready", label: readyDisabled ? "시간을 먼저 선택하세요" : "준비 완료", disabled: readyDisabled }
      ]
    },
    {
      type: 1,
      components: [
        { type: 2, style: 2, custom_id: "lobby:duration:30", label: "30분", disabled },
        { type: 2, style: 2, custom_id: "lobby:duration:60", label: "1시간", disabled },
        { type: 2, style: 2, custom_id: "lobby:duration:120", label: "2시간", disabled },
        { type: 2, style: 2, custom_id: "lobby:duration:custom", label: "직접 설정", disabled }
      ]
    }
  ];
}

function renderLobbyContent(state) {
  const capacity = getLobbyCapacity(state);
  const participants = state.players ?? [];
  const lines = ["Experience", "", "아직 시작되지 않았습니다.", "", "참가자", ""];
  if (participants.length === 0) {
    lines.push("아직 참가자가 없습니다.");
  } else {
    for (const player of participants) {
      lines.push(`✅ ${player.name}`);
    }
    for (let index = participants.length; index < capacity; index += 1) {
      lines.push("⬜ 비어 있음");
    }
  }
  lines.push("");
  lines.push(`${participants.length} / ${capacity}`);
  const selectedDuration = getLobbySelectedDuration(state);
  lines.push("");
  lines.push(selectedDuration ? `진행 시간: ${selectedDuration}분` : "진행 시간을 선택해 주세요.");
  return lines.join("\n");
}

function renderLobbyResponse(state) {
  return {
    type: 7,
    data: {
      content: renderLobbyContent(state),
      components: buildLobbyButtons(state)
    }
  };
}

function buildLobbyDurationModal(customId) {
  return {
    type: 9,
    data: {
      title: "진행 시간 설정",
      custom_id: customId,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "durationMinutes",
              label: "분 단위 시간",
              style: 1,
              required: true,
              placeholder: "예) 60"
            }
          ]
        }
      ]
    }
  };
}

function syncLobbyParticipants(state, players) {
  const nextExperience = state.experience
    ? {
        ...state.experience,
        participants: players.map((player, index) => ({
          id: `player-${index + 1}`,
          name: player.name
        }))
      }
    : null;
  return {
    ...state,
    players,
    experience: nextExperience
  };
}

function syncExperienceParticipants(experience, players) {
  return {
    ...experience,
    participants: players.map((player, index) => ({
      id: `player-${index + 1}`,
      name: player.name
    }))
  };
}

function createExperienceLobbyState(author) {
  const baseState = resetGame();
  const initialPlayers = [{ id: author.id, name: author.name }];
  const created = createExperience({
    participantNames: initialPlayers.map((player) => player.name),
    plannedDurationMinutes: null
  });
  return withUi(
    {
      ...baseState,
      players: initialPlayers,
      phase: "READY",
      statusMessage: "Experience를 생성했습니다.",
      experience: {
        ...created.experience,
        status: "Created",
        plannedDurationMinutes: null,
        plannedEndAt: null
      },
      flows: listFlows()
    },
    {
      screen: "lobby",
      lobby: {
        capacity: LOBBY_CAPACITY,
        hostId: author.id,
        plannedDurationMinutes: null
      }
    }
  );
}

function applyLobbyDurationSelection(state, durationMinutes) {
  const normalizedMinutes = Number(durationMinutes);
  if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) {
    return withUi(state, {
      statusMessage: "진행 시간을 확인할 수 없습니다."
    });
  }
  const nextExperience = setExperiencePlannedDuration(
    state.experience ?? createExperience({ participantNames: state.players.map((player) => player.name) }).experience,
    Math.round(normalizedMinutes)
  );
  return withUi(
    {
      ...state,
      experience: {
        ...nextExperience,
        status: state.experience?.status ?? "Created"
      },
      statusMessage: `진행 시간을 ${Math.round(normalizedMinutes)}분으로 설정했습니다.`
    },
    {
      screen: "lobby",
      lobby: {
        ...(state.ui?.lobby ?? { capacity: LOBBY_CAPACITY, hostId: state.ui?.lobby?.hostId ?? null }),
        plannedDurationMinutes: Math.round(normalizedMinutes)
      }
    }
  );
}

function joinLobbyState(state, author) {
  if (!hasLobbyState(state)) {
    return { state, joined: false, reason: "no-lobby" };
  }
  const capacity = getLobbyCapacity(state);
  const players = state.players ?? [];
  if (players.some((player) => player.id === author.id)) {
    return { state, joined: false, reason: "already-joined" };
  }
  if (players.length >= capacity) {
    return { state, joined: false, reason: "full" };
  }
  const nextPlayers = [...players, { id: author.id, name: author.name }];
  const nextState = withUi(
    syncLobbyParticipants(
      {
        ...state,
        phase: "READY",
        statusMessage: `${author.name} 님이 참가했습니다.`
      },
      nextPlayers
    ),
    {
      screen: "lobby",
      lobby: {
        ...(state.ui?.lobby ?? { capacity: LOBBY_CAPACITY, hostId: author.id })
      }
    }
  );
  return { state: nextState, joined: true };
}

function resumeScreenState(state) {
  if (isPlayingState(state)) {
    return withUi(state, { screen: "playing" });
  }
  if (hasLobbyState(state)) {
    return withUi(state, { screen: "lobby" });
  }
  return null;
}

function renderAiFailureContent() {
  return ["⚠️ AI 접근에 실패했습니다.", "", "잠시 후 다시 시도해주세요."].join("\n");
}

function buildAiFailureButtons(disabled = false) {
  return [
    {
      type: 1,
      components: [{ type: 2, style: 1, custom_id: "scene:retry-ai", label: "재시도 하기", disabled }]
    }
  ];
}

function renderEndingFailureContent() {
  return ["⚠️ AI 접근에 실패했습니다.", "", "잠시 후 다시 시도해주세요."].join("\n");
}

function buildEndingRetryButtons(disabled = false) {
  return [
    {
      type: 1,
      components: [{ type: 2, style: 1, custom_id: "ending:retry-ai", label: "재시도 하기", disabled }]
    }
  ];
}

async function renderPlayIntroResponse(state) {
  const frame = await buildSceneFrame(state);
  return {
    type: 7,
    meta: frame.aiFailed ? { aiFailed: true } : undefined,
    data: {
      content: `Experience를 준비하고 있습니다...\n\n${frame.content}`,
      components: frame.components
    }
  };
}

function renderStatusSnapshot(state) {
  if (isPlayingState(state)) {
    return buildSceneContent(state);
  }
  if (hasLobbyState(state)) {
    return renderLobbyContent(state);
  }
  return renderMainMenuContent();
}

function getModalValues(interaction) {
  const values = {};
  for (const row of interaction.data?.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.custom_id && typeof component.value === "string") {
        values[component.custom_id] = component.value;
      }
    }
  }
  return values;
}

function buildLegacyStatusContent(state) {
  const mission = getMissionById(state.currentMissionId);
  const lines = [
    `상태: ${phaseLabel(state.phase)}`,
    `참가자: ${state.players.map((player) => player.name).join(", ") || "없음"}`,
    `환경 태그: ${state.environmentTags.join(", ") || "없음"}`,
    `완료 미션: ${state.completedMissionIds.length}`,
    `복선: ${state.foreshadows.length}`
  ];
  if (state.experience?.plannedEndAt) {
    lines.push(getExperienceTimingMessage(state.experience));
  }
  if (mission) {
    lines.push(`현재 미션: ${mission.title}`);
    lines.push(mission.description);
  }
  if (state.endingText) {
    lines.push("");
    lines.push(state.endingText);
  }
  lines.push("");
  lines.push(state.statusMessage);
  return lines.join("\n");
}

function normalizeSceneInputTypes(inputType) {
  if (Array.isArray(inputType)) {
    return inputType.map((value) => String(value).trim().toUpperCase()).filter(Boolean);
  }
  if (typeof inputType !== "string") {
    return ["TEXT"];
  }
  const raw = inputType.trim().toUpperCase();
  if (!raw) {
    return ["TEXT"];
  }
  if (raw === "TEXT_OR_PHOTO" || raw === "PHOTO_OR_TEXT") {
    return ["TEXT", "PHOTO"];
  }
  if (raw.includes("_OR_")) {
    return raw
      .split(/_OR_/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
  }
  const types = raw
    .split(/[+,]/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return types.length > 0 ? types : ["TEXT"];
}

function normalizeSceneInputRelation(inputType, inputRelation) {
  const relation = typeof inputRelation === "string" ? inputRelation.trim().toUpperCase() : "";
  if (relation === "ANY") {
    return "ANY";
  }
  if (typeof inputType === "string") {
    const raw = inputType.trim().toUpperCase();
    if (raw === "TEXT_OR_PHOTO" || raw === "PHOTO_OR_TEXT" || raw.includes("_OR_")) {
      return "ANY";
    }
  }
  return "ALL";
}

function normalizeSceneChoiceOptions(options) {
  return (options ?? [])
    .map((option, index) => {
      if (typeof option === "string") {
        return { label: option, value: option, index };
      }
      if (option && typeof option === "object") {
        const label = typeof option.label === "string" && option.label.trim() ? option.label.trim() : typeof option.value === "string" ? option.value.trim() : `선택 ${index + 1}`;
        const value = typeof option.value === "string" && option.value.trim() ? option.value.trim() : label;
        return { label, value, index };
      }
      return null;
    })
    .filter(Boolean);
}

function getCurrentExperienceBeat(state) {
  const experience = state.experience;
  if (!experience) {
    return null;
  }
  const stageId = experience.currentStageId;
  const flow = getFlowById(experience.flowId);
  if (!flow || !stageId) {
    return null;
  }
  const stageName = stageId.split("-").slice(1).join("-");
  const stage = {
    id: `${flow.id}-${stageName}`,
    flowId: flow.id,
    name: stageName,
    purpose:
      stageName.toLowerCase().includes("exploration")
        ? "낯선 장소와 친해지세요."
        : stageName.toLowerCase().includes("discovery")
          ? "새로운 단서를 찾아보세요."
          : stageName.toLowerCase().includes("challenge")
            ? "작은 긴장과 선택을 만들어보세요."
            : stageName.toLowerCase().includes("reflection")
              ? "지나온 장면을 정리해보세요."
              : stageName.toLowerCase().includes("conversation")
                ? "서로 대화하며 관계를 만들어보세요."
                : stageName.toLowerCase().includes("cooperation")
                  ? "팀이 함께 움직이세요."
                  : stageName.toLowerCase().includes("understanding")
                    ? "서로를 더 잘 이해해보세요."
                    : stageName.toLowerCase().includes("memory")
                      ? "기억에 남을 장면을 남겨보세요."
                      : stageName.toLowerCase().includes("question")
                        ? "질문으로 시작해보세요."
                        : stageName.toLowerCase().includes("clue")
                          ? "작은 단서를 수집해보세요."
                          : stageName.toLowerCase().includes("reveal")
                            ? "숨은 연결을 드러내보세요."
                            : stageName.toLowerCase().includes("resolution")
                              ? "정리와 마무리를 만들어보세요."
                              : "함께 움직여보세요.",
    allowedNextStageIds: []
  };
  const completedMissionIds = [
    ...(state.completedMissionIds ?? []),
    ...(state.results ?? [])
      .map((result) => {
        const storyBeatId = typeof result.storyBeatId === "string" ? result.storyBeatId : "";
        const missionIdFromBeat = storyBeatId.match(/mission-[a-z0-9-]+$/i)?.[0] ?? null;
        return result.payload?.mission_id ?? missionIdFromBeat;
      })
      .filter(Boolean)
  ];
  const beat = stage
    ? buildStoryBeatForExperience(experience, stage, {
      completedMissionIds,
      missionHistory: experience.missionHistory ?? [],
      usedPurposeCounts: experience.usedPurposeCounts ?? {},
      usedSemanticKeys: new Set(experience.usedSemanticKeys ?? []),
      usedSemanticGroups: new Set(experience.usedSemanticGroups ?? []),
      environmentTags: state.environmentTags ?? [],
      participantCount: state.players?.length ?? experience.participants?.length ?? 1,
      endingRequested: state.phase === "ENDING"
    })
    : null;
  return beat ? { ...beat, flow, stage } : null;
}

function getSceneInputDefinition(beat) {
  const inputTypes = normalizeSceneInputTypes(beat?.mission?.input_types ?? beat?.mission?.input_type);
  const choiceOptions = normalizeSceneChoiceOptions(beat?.mission?.input_options);
  return {
    inputTypes,
    inputRelation: normalizeSceneInputRelation(beat?.mission?.input_type, beat?.mission?.input_relation),
    choiceOptions,
    photoDeliveryMode:
      typeof beat?.mission?.photo_delivery_mode === "string" && beat.mission.photo_delivery_mode.trim()
        ? beat.mission.photo_delivery_mode.trim().toUpperCase()
        : "THREAD"
  };
}

function getSceneInputState(state) {
  const currentSceneId = state.currentSceneId ?? null;
  const sceneInput = state.ui?.sceneInput;
  if (!sceneInput || sceneInput.sceneId !== currentSceneId) {
    return {
      sceneId: currentSceneId,
      submittedTypes: [],
      selectedChoice: null,
      textSubmitted: false,
      photoSubmitted: false,
      lastSubmittedType: null
    };
  }
  return {
    sceneId: currentSceneId,
    submittedTypes: normalizeSceneInputTypes(sceneInput.submittedTypes ?? []),
    selectedChoice: typeof sceneInput.selectedChoice === "string" ? sceneInput.selectedChoice : null,
    textSubmitted: Boolean(sceneInput.textSubmitted),
    photoSubmitted: Boolean(sceneInput.photoSubmitted),
    lastSubmittedType: typeof sceneInput.lastSubmittedType === "string" ? sceneInput.lastSubmittedType : null
  };
}

function setSceneInputState(state, sceneInput) {
  return withUi(state, {
    sceneInput: {
      ...sceneInput,
      sceneId: state.currentSceneId ?? sceneInput.sceneId ?? null
    }
  });
}

function isInputTypeSatisfied(sceneInput, type) {
  if (type === "TEXT") {
    return sceneInput.textSubmitted || sceneInput.submittedTypes.includes(type);
  }
  if (type === "PHOTO") {
    return sceneInput.photoSubmitted || sceneInput.submittedTypes.includes(type);
  }
  if (type === "CHOICE") {
    return Boolean(sceneInput.selectedChoice) || sceneInput.submittedTypes.includes(type);
  }
  return sceneInput.submittedTypes.includes(type);
}

function isSceneInputSatisfied(sceneInput, inputTypes, inputRelation = "ALL") {
  if (inputRelation === "ANY") {
    return inputTypes.some((type) => isInputTypeSatisfied(sceneInput, type));
  }
  if (inputTypes.includes("CHOICE") && !sceneInput.selectedChoice) {
    return false;
  }
  return inputTypes.every((type) => isInputTypeSatisfied(sceneInput, type));
}

function buildScenePhotoUploadState(state, mode, author) {
  return withUi(state, {
    photoUpload: {
      mode,
      sceneId: state.currentSceneId ?? null,
      requestedBy: author.id,
      requestedByName: author.name,
      status: "requested",
      channelId: state.ui?.photoUpload?.channelId ?? null,
      threadId: state.ui?.photoUpload?.threadId ?? null,
      updatedAt: new Date().toISOString()
    }
  });
}

function hasPendingPhotoUpload(state) {
  return Boolean(state.ui?.photoUpload?.status === "requested" || state.ui?.photoUpload?.status === "open");
}

function renderSceneContent(state) {
  const endingText = state.endingText ?? state.experience?.endingText ?? "";
  if (state.experience?.status === "Ended" && endingText) {
    return endingText;
  }
  if (state.phase === "ENDING" && state.ui?.endingRetryPending) {
    return renderEndingFailureContent();
  }
  const beat = getCurrentExperienceBeat(state);
  if (!beat) {
    if (state.experience?.status === "Playing" && state.experience?.flowId == null) {
      return [
        "🎬 오늘의 장면",
        "",
        "흐름이 아직 결정되지 않았습니다.",
        "",
        "흐름을 선택하면 Scene이 시작됩니다."
      ].join("\n");
    }
    return buildLegacyStatusContent(state);
  }
  const sceneInput = getSceneInputState(state);
  const { inputTypes, inputRelation } = getSceneInputDefinition(beat);
  const completed = isSceneInputSatisfied(sceneInput, inputTypes, inputRelation);
  return renderScene({
    title: completed ? "✅ Mission Complete" : "🎬 오늘의 장면",
    prompt: beat.mission.prompt_hint,
    detail: completed ? "입력이 모두 제출되었습니다." : null,
    memory: state.storyMemories?.at(-1) ?? null
  });
}

async function renderSceneContentWithAi(state) {
  const endingText = state.endingText ?? state.experience?.endingText ?? "";
  if (state.experience?.status === "Ended" && endingText) {
    return endingText;
  }
  if (state.phase === "ENDING" && state.ui?.endingRetryPending) {
    return renderEndingFailureContent();
  }
  const beat = getCurrentExperienceBeat(state);
  if (!beat) {
    if (state.experience?.status === "Playing" && state.experience?.flowId == null) {
      return [
        "🎬 오늘의 장면",
        "",
        "흐름이 아직 결정되지 않았습니다.",
        "",
        "흐름을 선택하면 Scene이 시작됩니다."
      ].join("\n");
    }
    return buildLegacyStatusContent(state);
  }
  const sceneInput = getSceneInputState(state);
  const { inputTypes, choiceOptions, inputRelation } = getSceneInputDefinition(beat);
  const completed = isSceneInputSatisfied(sceneInput, inputTypes, inputRelation);
  const aiPrompt = await renderScenePromptWithAi({
    missionPrompt: beat.mission.prompt_hint,
    inputTypes,
    choiceOptions: choiceOptions.map((option) => option.label),
    memorySummary: state.storyMemories?.at(-1)?.summary ?? null,
    completed
  });
  if (!aiPrompt) {
    return null;
  }
  return renderScene({
    title: completed ? "✅ Mission Complete" : "🎬 오늘의 장면",
    prompt: aiPrompt,
    detail: completed ? "입력이 모두 제출되었습니다." : null,
    memory: state.storyMemories?.at(-1) ?? null
  });
}

function buildSceneButtons(state, disabled = false) {
  if (state.experience?.status === "Ended") {
    return [];
  }
  if (state.phase === "ENDING") {
    return state.ui?.endingRetryPending ? buildEndingRetryButtons(disabled) : [];
  }
  if (state.ui?.sceneRetryPending) {
    return buildAiFailureButtons(disabled);
  }
  const beat = getCurrentExperienceBeat(state);
  if (!beat) {
    return [];
  }
  const sceneDisabled = disabled || state.phase === "FINISHED" || state.experience?.status === "Ended";
  const sceneInput = getSceneInputState(state);
  const { inputTypes, choiceOptions, inputRelation } = getSceneInputDefinition(beat);
  const completed = isSceneInputSatisfied(sceneInput, inputTypes, inputRelation);
  const photoUploadPending = hasPendingPhotoUpload(state);
  if (completed) {
    return [];
  }

  const buttons = [];
  for (const inputType of inputTypes) {
    if (inputType === "CHOICE") {
      if (sceneInput.selectedChoice) {
        continue;
      }
      const options =
        choiceOptions.length > 0
          ? choiceOptions
          : [
              { label: "선택 1", value: "선택 1", index: 0 },
              { label: "선택 2", value: "선택 2", index: 1 },
              { label: "선택 3", value: "선택 3", index: 2 }
            ];
      return [
        {
          type: 1,
          components: options.slice(0, 5).map((option, index) => ({
            type: 2,
            style: index === 0 ? 1 : 2,
            custom_id: `scene:choice:${encodeURIComponent(option.value)}`,
            label: option.label,
            disabled: sceneDisabled
          }))
        }
      ];
    }
    if (inputType === "TEXT" && !sceneInput.textSubmitted) {
      buttons.push({ type: 2, style: 1, custom_id: "scene:record", label: "기록하기", disabled: sceneDisabled });
    }
    if (inputType === "PHOTO" && !sceneInput.photoSubmitted) {
      buttons.push({
        type: 2,
        style: 2,
        custom_id: "scene:upload-photo",
        label: photoUploadPending ? "사진 업로드 준비됨" : "사진 올리기",
        disabled: sceneDisabled || photoUploadPending
      });
    }
  }

  return buttons.length > 0 ? [{ type: 1, components: buttons }] : [];
}

async function buildSceneFrame(state) {
  if (state.experience?.status === "Playing" && !getCurrentExperienceBeat(state)) {
    const content = await renderSceneContentWithAi(state);
    return {
      content: content ?? renderAiFailureContent(),
      components: content ? buildFlowButtons() : buildAiFailureButtons(),
      aiFailed: !content
    };
  }
  const content = await renderSceneContentWithAi(state);
  return {
    content: content ?? renderAiFailureContent(),
    components: content ? buildSceneButtons(state) : buildAiFailureButtons(state.ui?.sceneRetryPending),
    aiFailed: !content
  };
}

function buildSceneContent(state) {
  return renderSceneContent(state);
}

function buildFlowButtons(disabled = false) {
  const flows = listFlows();
  return [
    {
      type: 1,
      components: flows.slice(0, 5).map((flow, index) => ({
        type: 2,
        style: index === 0 ? 1 : 2,
        custom_id: `flow:${flow.id}`,
        label: flow.name,
        disabled
      }))
    }
  ];
}

function completionModal(interaction) {
  return {
    type: 9,
    data: {
      title: "미션 완료",
      custom_id: `game:complete-modal:${interaction.channel_id}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "foreshadowText",
              label: "복선 문장",
              style: 2,
              required: false,
              placeholder: "남기고 싶은 기록을 적으세요."
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "mood",
              label: "분위기",
              style: 1,
              required: false,
              placeholder: "curious / calm / excited"
            }
          ]
        }
      ]
    }
  };
}

function getTextMissionModalSpec(beat) {
  const mission = beat?.mission ?? {};
  const title =
    typeof mission.title === "string" && mission.title.trim()
      ? mission.title.trim()
      : typeof mission.prompt_hint === "string" && mission.prompt_hint.trim()
        ? mission.prompt_hint.trim()
        : "답변 작성";
  const description = typeof mission.description === "string" && mission.description.trim() ? mission.description.trim() : "";
  const placeholder = typeof mission.placeholder === "string" && mission.placeholder.trim() ? mission.placeholder.trim() : "답변을 입력하세요.";
  return { title, description, placeholder };
}

function textMissionModal(interaction, beat) {
  const { title, description, placeholder } = getTextMissionModalSpec(beat);
  const inputPlaceholder = description ? `${description} ${placeholder}`.trim() : placeholder;
  return {
    type: 9,
    data: {
      title,
      custom_id: `scene:record-modal:${interaction.channel_id}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "answer",
              label: "답변",
              style: 2,
              required: true,
              placeholder: inputPlaceholder
            }
          ]
        }
      ]
    }
  };
}

async function panelResponse(state) {
  return {
    type: 4,
    data: await buildSceneFrame(state)
  };
}

async function updateResponse(state) {
  return {
    type: 7,
    data: await buildSceneFrame(state)
  };
}

async function renderPlayStatusResponse(state, initial = false) {
  return initial ? await panelResponse(state) : await updateResponse(state);
}

function ephemeralMessage(content) {
  return {
    type: 4,
    data: {
      content,
      flags: 64
    }
  };
}

async function saveUpdatedSession(interaction, state, extra = {}) {
  const beforeState = extra.beforeState ?? interaction.__beforeState ?? null;
  const mergedState = {
    ...state,
    events: extra.events ?? state.events,
    experience: extra.experience ?? state.experience,
    scenes: extra.scenes ?? state.scenes,
    processedInteractionIds: markProcessedInteraction(state, interaction.id)
  };
  try {
    await saveSession({
      ...buildSessionRecord(interaction.guild_id ?? null, interaction.channel_id, mergedState),
      events: mergedState.events,
      experience: mergedState.experience,
      scenes: mergedState.scenes
    });
    logInteractionLifecycle(interaction, {
      handler: extra.handler,
      duplicate: false,
      beforeState,
      afterState: mergedState,
      saveSucceeded: true
    });
  } catch (error) {
    logInteractionLifecycle(interaction, {
      handler: extra.handler,
      duplicate: false,
      beforeState,
      afterState: mergedState,
      saveSucceeded: false
    });
    throw error;
  }
}

function pushEvent(state, event) {
  return {
    ...state,
    events: [...(state.events ?? []), event]
  };
}

function appendEvents(state, events) {
  return {
    ...state,
    events: [...(state.events ?? []), ...events]
  };
}

function pushMemory(state, summary, sourceEventIds) {
  const nextMemory = {
    id: `memory-${(state.storyMemories?.length ?? 0) + 1}`,
    sourceEventIds,
    sourceSceneId: state.currentSceneId ?? null,
    summary,
    tags: ["callback"],
    callbackWeight: 1
  };
  return {
    ...state,
    storyMemories: [...(state.storyMemories ?? []), nextMemory]
  };
}

function sceneTitleFromContent(content) {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ?? "Scene";
}

function publishScene(state, interaction, content, sourceEventIds = []) {
  const experienceId = state.experience?.id ?? createSessionKey(interaction.guild_id ?? null, interaction.channel_id);
  const sceneId = `scene-${(state.scenes?.length ?? 0) + 1}`;
  const title = sceneTitleFromContent(content);
  const scene = {
    id: sceneId,
    experienceId,
    title,
    content,
    createdAt: new Date().toISOString(),
    threadId: null,
    sourceEventIds
  };
  const renderedEvent = createEvent("SceneRendered", "discord-bot", {
    scene_id: scene.id,
    experience_id: experienceId,
    title: scene.title,
    source_event_ids: sourceEventIds
  });
  const deliveredEvent = createEvent("SceneDelivered", "discord-bot", {
    scene_id: scene.id,
    channel_id: interaction.channel_id,
    guild_id: interaction.guild_id ?? null
  });
  return appendEvents(
    {
      ...state,
      currentSceneId: scene.id,
      scenes: [...(state.scenes ?? []), scene]
    },
    [renderedEvent, deliveredEvent]
  );
}

function persistSceneResponse(state, interaction, response, sourceEventIds = [], shouldPersistScene = true) {
  if (!shouldPersistScene || response.meta?.aiFailed || (response.type !== 4 && response.type !== 7)) {
    return state;
  }
  if (state.phase === "ENDING" || state.experience?.status === "Ended") {
    return state;
  }
  if (!getCurrentExperienceBeat(state)) {
    return state;
  }
  const content = response.data?.content ?? "";
  return publishScene(state, interaction, content, sourceEventIds);
}

function attachExperience(state, experience, flowId) {
  const selectedFlow = typeof flowId === "string" && flowId.trim() ? getFlowById(flowId.trim()) : getFlowById(experience.flowId);
  return {
    ...state,
    experience: {
      ...experience,
      flowId: selectedFlow?.id ?? experience.flowId ?? null,
      coverage: selectedFlow ? buildCoverage(selectedFlow) : experience.coverage ?? buildCoverage(null)
    },
    flows: listFlows(),
    phase: experience.status === "Ended" ? "FINISHED" : experience.status === "Playing" ? "PLAYING" : "READY"
  };
}

function markProcessedInteraction(state, interactionId) {
  const processedInteractionIds = Array.isArray(state?.processedInteractionIds) ? state.processedInteractionIds : [];
  if (!interactionId || processedInteractionIds.includes(interactionId)) {
    return processedInteractionIds;
  }
  return [...processedInteractionIds, interactionId];
}

function prepareSession(state) {
  return state;
}

function stateLogSummary(state) {
  return {
    phase: state?.phase ?? null,
    screen: state?.ui?.screen ?? null,
    experienceStatus: state?.experience?.status ?? null
  };
}

function getInteractionCommandName(interaction) {
  if (interaction.type === 2) {
    return interaction.data?.name ?? "";
  }
  return null;
}

function getInteractionCustomId(interaction) {
  if (interaction.type === 3 || interaction.type === 5) {
    return interaction.data?.custom_id ?? "";
  }
  return null;
}

function getInteractionHandlerName(interaction) {
  const commandName = getInteractionCommandName(interaction);
  const customId = getInteractionCustomId(interaction);
  if (interaction.type === 1) {
    return "ping";
  }
  if (interaction.type === 2) {
    return `command:${commandName || "unknown"}`;
  }
  if (interaction.type === 3) {
    if (customId === "menu:new-game") {
      return "component:menu-new-game";
    }
    if (customId === "menu:join-game") {
      return "component:menu-join-game";
    }
    if (customId === "menu:resume") {
      return "component:menu-resume";
    }
    if (customId === "lobby:join") {
      return "component:lobby-join";
    }
    if (customId.startsWith("lobby:duration:")) {
      return "component:lobby-duration";
    }
    if (customId === "lobby:ready") {
      return "component:lobby-ready";
    }
    if (customId === "scene:record") {
      return "component:scene-record";
    }
    if (customId.startsWith("scene:choice:")) {
      return "component:scene-choice";
    }
    if (customId === "scene:upload-photo") {
      return "component:scene-upload-photo";
    }
    if (customId === "scene:retry-ai") {
      return "component:scene-retry-ai";
    }
    if (customId === "ending:retry-ai") {
      return "component:ending-retry-ai";
    }
    if (customId.startsWith("lobby:duration-modal:")) {
      return "component:lobby-duration-modal-open";
    }
    if (customId.startsWith("flow:")) {
      return "component:flow";
    }
    if (customId.startsWith("scene:record-modal")) {
      return "component:scene-record-modal";
    }
    if (customId.startsWith("game:")) {
      return `component:${customId}`;
    }
    return "component:unknown";
  }
  if (interaction.type === 5) {
    if (customId.startsWith("lobby:duration-modal:")) {
      return "modal:lobby-duration";
    }
    if (customId.startsWith("scene:record-modal")) {
      return "modal:scene-record";
    }
    return "modal:legacy-complete";
  }
  return "interaction:unsupported";
}

function logInteractionLifecycle(interaction, details) {
  console.info("discord interaction handled", {
    interactionId: interaction.id,
    commandName: getInteractionCommandName(interaction),
    customId: getInteractionCustomId(interaction),
    sessionKey: createSessionKey(interaction.guild_id ?? null, interaction.channel_id),
    currentState: stateLogSummary(details.beforeState),
    handler: details.handler ?? interaction.__handlerName ?? getInteractionHandlerName(interaction),
    duplicate: Boolean(details.duplicate),
    beforeState: stateLogSummary(details.beforeState),
    afterState: stateLogSummary(details.afterState),
    saveSucceeded: details.saveSucceeded
  });
}

async function renderCurrentSessionResponse(state, initial = false) {
  if (isPlayingState(state) || state.phase === "ENDING" || state.ui?.endingRetryPending) {
    return await renderPlayStatusResponse(state, initial);
  }
  if (hasLobbyState(state)) {
    return renderLobbyResponse(state);
  }
  if (getSessionUi(state).screen === "main-menu") {
    return renderMainMenuResponse();
  }
  return ephemeralMessage(renderStatusSnapshot(state));
}

async function loadInteractionSession(interaction) {
  const sessionKey = createSessionKey(interaction.guild_id ?? null, interaction.channel_id);
  return await loadSession(sessionKey);
}

function applyLegacyCommand(commandName, interaction, sessionState) {
  switch (commandName) {
    case "start":
      return startGame(parseStartOptions(interaction));
    case "status":
      return sessionState;
    case "complete":
      return sessionState;
    case "checkpoint":
      return goCheckpoint(sessionState);
    case "next":
      return selectNextMission(sessionState);
    case "emergency":
      return useEmergencyMission(sessionState);
    case "ending":
      return generateEnding(sessionState);
    case "finish":
      return finishGame(sessionState);
    case "reset":
      return resetGame();
    default:
      return sessionState;
  }
}

function applySceneContinue(state) {
  if (!state.experience) {
    return selectNextMission(state);
  }
  const flow = getFlowById(state.experience.flowId);
  if (!flow) {
    return {
      ...state,
      statusMessage: "흐름이 아직 결정되지 않았습니다."
    };
  }
  const nextStage = chooseNextStage(flow, state.experience.currentStageId);
  if (!nextStage) {
    return {
      ...state,
      experience: {
        ...state.experience,
        currentStageId: state.experience.currentStageId ?? null,
        status: "Playing"
      },
      phase: "PLAYING",
      statusMessage: "현재 흐름을 유지합니다."
    };
  }
  return {
    ...state,
    experience: {
      ...state.experience,
      currentStageId: nextStage.id,
      currentStoryBeatId: null,
      status: "Playing"
    },
    phase: "PLAYING",
    currentMissionId: state.currentMissionId,
    statusMessage: `${nextStage.name} 단계로 이동합니다.`
  };
}

function handleFlowSelection(state, flowId) {
  const selectedFlow = getFlowById(flowId);
  const baseExperience =
    state.experience ??
    createExperience({
      participantNames: state.players.map((player) => player.name),
      flowId: selectedFlow?.id ?? null
    }).experience;
  const updated = setFlow(baseExperience, selectedFlow?.id ?? null);
  return {
    ...state,
    experience: updated.experience,
    flows: listFlows(),
    players: state.players.length > 0 ? state.players : updated.experience.participants,
    phase: state.phase === "PLAYING" ? "PLAYING" : "READY",
    statusMessage: updated.flow ? `흐름을 ${updated.flow.name}로 선택했습니다.` : "흐름을 선택하지 못했습니다."
  };
}

function getExperienceTimingMessage(experience) {
  const remainingMinutes = getExperienceRemainingMinutes(experience);
  if (remainingMinutes === null) {
    return "남은 시간을 계산할 수 없습니다.";
  }
  return `남은 시간: 약 ${remainingMinutes}분`;
}

function buildEndingStoryMemoryPayload(state) {
  return buildEndingStoryMemoryContext(state.experience, state.storyMemories ?? [], state.results ?? []);
}

async function attemptEndingGeneration(state) {
  const endingContext = buildEndingStoryMemoryPayload(state);
  const endingResult = await renderEndingNarrativeWithAi(endingContext, { timeoutMs: 15000 });
  if (!endingResult) {
    return {
      state: withUi(state, {
        endingRetryPending: true
      }),
      response: {
        type: 7,
        meta: { aiFailed: true },
        data: {
          content: renderEndingFailureContent(),
          components: buildEndingRetryButtons()
        }
      },
      completed: false
    };
  }

  const endedExperience = endExperience({
    ...state.experience,
    endingText: endingResult
  });
  const endedEvent = createEvent("ExperienceEnded", "discord-bot", {
    experience_id: endedExperience.id,
    flow_id: endedExperience.flowId
  });
  const nextState = withUi(
    appendEvents(
      {
        ...state,
        experience: {
          ...endedExperience,
          endingText: endingResult
        },
        endingText: endingResult,
        phase: "ENDING",
        statusMessage: "Experience를 종료했습니다."
      },
      [endedEvent]
    ),
    {
      endingRetryPending: false,
      sceneRetryPending: false
    }
  );
  return {
    state: nextState,
    response: {
      type: 7,
      data: {
        content: endingResult,
        components: []
      }
    },
    completed: true,
    event: endedEvent
  };
}

function recordSceneScene(state, interaction, kind, payload) {
  const event = createEvent(kind, "discord-bot", payload);
  const next = pushEvent(state, event);
  const summary = summarizeMemoryCandidate(event);
  return pushMemory(next, summary, [event.id]);
}

function pushResult(state, result) {
  return {
    ...state,
    results: [...(state.results ?? []), result]
  };
}

function buildSceneCompletionState(state, submission, recordedEventId) {
  const completedResult = createResult(submission.beat.id, "MissionComplete", {
    scene_id: state.currentSceneId ?? null,
    experience_id: state.experience?.id ?? null,
    mission_id: submission.beat.mission?.id ?? null,
    input_types: submission.inputTypes,
    input_type: submission.inputType,
    choice: submission.nextSceneInput?.selectedChoice ?? null,
    text: typeof submission.payload?.text === "string" ? submission.payload.text : null,
    photo_submitted: submission.inputType === "PHOTO"
  });
  const progressedExperience = recordMissionProgress(
    advanceExperienceProgress(state.experience, submission.beat.stage?.name ?? null),
    submission.beat.mission
  );
  const completedState = appendEvents(
    pushResult(
      {
        ...state,
        completedMissionIds:
          submission.beat.mission?.id && !(state.completedMissionIds ?? []).includes(submission.beat.mission.id)
            ? [...(state.completedMissionIds ?? []), submission.beat.mission.id]
            : (state.completedMissionIds ?? []),
        experience: progressedExperience
      },
      completedResult
    ),
    [
      createEvent("MissionCompleted", "discord-bot", {
        scene_id: state.currentSceneId ?? null,
        experience_id: state.experience?.id ?? null,
        input_types: submission.inputTypes,
        choice: submission.nextSceneInput?.selectedChoice ?? null,
        result_id: completedResult.id,
        event_ids: [recordedEventId].filter(Boolean)
      }),
      createEvent("ResultCreated", "discord-bot", {
        result_id: completedResult.id,
        story_beat_id: completedResult.storyBeatId,
        scene_id: state.currentSceneId ?? null,
        experience_id: state.experience?.id ?? null
      }),
      createEvent("ExperienceProgressUpdated", "discord-bot", {
        experience_id: state.experience?.id ?? null,
        completed_stage: submission.beat.stage?.name ?? null,
        achieved: progressedExperience?.coverage?.achieved ?? [],
        pending: progressedExperience?.coverage?.pending ?? []
      })
    ]
  );
  return {
    ...withUi(completedState, {
      sceneInput: null,
      sceneRetryPending: false,
      photoUpload: null
    }),
    completedResult
  };
}

async function attemptSceneCompletion(state, submission) {
  const recordedEventId = state.events?.at(-1)?.id ?? null;
  const completedState = buildSceneCompletionState(state, submission, recordedEventId);
  if (isExperienceTimeExpired(completedState.experience)) {
    const endingAttempt = await attemptEndingGeneration(
      withUi(
        {
          ...completedState,
          phase: "ENDING"
        },
        { endingRetryPending: false }
      )
    );
    return endingAttempt;
  }

  const progressed = withUi(applySceneContinue(completedState), {
    screen: "playing",
    sceneInput: null,
    sceneRetryPending: false,
    endingRetryPending: false
  });
  const renderedContent = await renderSceneContentWithAi(progressed);
  if (!renderedContent) {
    const retryState = withUi(state, {
      screen: "playing",
      sceneRetryPending: true,
      statusMessage: "AI 접근에 실패했습니다."
    });
    return {
      state: retryState,
      response: {
        type: 7,
        meta: { aiFailed: true },
        data: {
          content: renderAiFailureContent(),
          components: buildAiFailureButtons()
        }
      },
      completed: false
    };
  }
  return {
    state: progressed,
    response: {
      type: 7,
      data: {
        content: renderedContent,
        components: buildSceneButtons(progressed)
      }
    },
    completed: true
  };
}

async function retrySceneRender(state) {
  const content = await renderSceneContentWithAi(state);
  if (!content) {
    return {
      state: withUi(state, {
        sceneRetryPending: true,
        statusMessage: "AI 접근에 실패했습니다."
      }),
      response: {
        type: 7,
        meta: { aiFailed: true },
        data: {
          content: renderAiFailureContent(),
          components: buildAiFailureButtons()
        }
      },
      completed: false
    };
  }
  const retryState = withUi(state, {
    sceneRetryPending: false,
    statusMessage: "Scene을 다시 불러왔습니다."
  });
  return {
    state: retryState,
    response: {
      type: 7,
      data: {
        content,
        components: buildSceneButtons(retryState)
      }
    },
    completed: true
  };
}

async function retryEndingRender(state) {
  const endingAttempt = await attemptEndingGeneration(
    withUi(
      {
        ...state,
        phase: "ENDING"
      },
      { endingRetryPending: false }
    )
  );
  return endingAttempt;
}

function buildRetrySceneSubmission(state) {
  const beat = getCurrentExperienceBeat(state);
  if (!beat) {
    return null;
  }
  const sceneInput = getSceneInputState(state);
  const { inputTypes, inputRelation } = getSceneInputDefinition(beat);
  if (!isSceneInputSatisfied(sceneInput, inputTypes, inputRelation)) {
    return null;
  }
  return {
    beat,
    inputTypes,
    nextSceneInput: sceneInput,
    inputType:
      sceneInput.lastSubmittedType ??
      (sceneInput.selectedChoice ? "CHOICE" : sceneInput.photoSubmitted ? "PHOTO" : "TEXT"),
    payload: {}
  };
}

function submitSceneInput(state, interaction, inputType, payload) {
  const eventType =
    inputType === "PHOTO" ? "PlayerUploadedPhoto" : inputType === "CHOICE" ? "PlayerSelectedChoice" : "PlayerSubmittedText";
  const recorded = recordSceneScene(state, interaction, eventType, payload);
  const sceneInput = getSceneInputState(recorded);
  const nextSceneInput = {
    ...sceneInput,
    submittedTypes: [...new Set([...sceneInput.submittedTypes, inputType])]
  };
  if (inputType === "TEXT") {
    nextSceneInput.textSubmitted = true;
  }
  if (inputType === "PHOTO") {
    nextSceneInput.photoSubmitted = true;
  }
  if (inputType === "CHOICE" && typeof payload.choice === "string") {
    nextSceneInput.selectedChoice = payload.choice;
  }
  nextSceneInput.lastSubmittedType = inputType;
  const updated = setSceneInputState(recorded, nextSceneInput);
  const beat = getCurrentExperienceBeat(updated);
  if (!beat) {
    return { state: updated, completed: false };
  }
  const { inputTypes, inputRelation } = getSceneInputDefinition(beat);
  if (!isSceneInputSatisfied(nextSceneInput, inputTypes, inputRelation)) {
    return { state: updated, completed: false, beat, inputTypes, nextSceneInput };
  }
  return {
    state: updated,
    completed: true,
    beat,
    inputTypes,
    nextSceneInput,
    inputType,
    payload
  };
}

export async function handleDiscordInteraction(interaction) {
  const sessionKey = createSessionKey(interaction.guild_id ?? null, interaction.channel_id);
  return await enqueueSessionTask(sessionKey, async () => {
    const session = await loadInteractionSession(interaction);
    const sessionState = session?.state ?? resetGame();
    interaction.__beforeState = sessionState;
    interaction.__handlerName = getInteractionHandlerName(interaction);
    if (sessionState.processedInteractionIds.includes(interaction.id)) {
      const response = await renderCurrentSessionResponse(sessionState);
      logInteractionLifecycle(interaction, {
        handler: interaction.__handlerName,
        duplicate: true,
        beforeState: sessionState,
        afterState: sessionState,
        saveSucceeded: null
      });
      return response;
    }

    if (interaction.type === 1) {
      logInteractionLifecycle(interaction, {
        handler: interaction.__handlerName,
        duplicate: false,
        beforeState: sessionState,
        afterState: sessionState,
        saveSucceeded: null
      });
      return { type: 1 };
    }

    if (interaction.type === 2) {
    const commandName = interaction.data?.name ?? "";
    const author = getAuthor(interaction);
    if (commandName === "begin") {
      const nextState = prepareSession(
        withUi(
          {
            ...sessionState,
            processedInteractionIds: []
          },
          { screen: "main-menu" }
        ),
        interaction
      );
      const response = renderMainMenuResponse();
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    if (commandName === "status") {
      return ephemeralMessage(renderStatusSnapshot(sessionState));
    }
    if (commandName === "start-experience") {
      const { playerNames, flowId, durationMinutes } = parseStartOptions(interaction);
      const starting = createExperience({
        participantNames: playerNames.length > 0 ? playerNames : [author.name],
        flowId,
        plannedDurationMinutes: durationMinutes ?? 60
      });
      const configuredExperience = setFlow(starting.experience, starting.flow?.id ?? null).experience;
      const begunExperience = startExperience(configuredExperience);
      const createdEvent = createEvent("ExperienceCreated", "discord-bot", {
        guild_id: interaction.guild_id ?? null,
        channel_id: interaction.channel_id,
        flow_id: starting.flow?.id ?? null,
        player_names: begunExperience.participants.map((player) => player.name),
        planned_duration_minutes: begunExperience.plannedDurationMinutes,
        planned_end_at: begunExperience.plannedEndAt
      });
      const nextState = prepareSession(
        withUi(
          attachExperience(
            {
              ...appendEvents(resetGame(), [createdEvent]),
              players: begunExperience.participants,
              phase: "PLAYING",
              statusMessage: "Experience를 생성했습니다.",
              experience: begunExperience,
              flows: listFlows()
            },
            begunExperience,
            starting.flow?.id ?? null
          ),
          { screen: "playing" }
        ),
        interaction
      );
      const frame = await buildSceneFrame(nextState);
      const response = {
        type: 4,
        meta: frame.aiFailed ? { aiFailed: true } : undefined,
        data: {
          content: `Experience가 생성되었습니다.\n\n${frame.content}`,
          components: nextState.experience?.flowId == null ? buildFlowButtons() : [...buildFlowButtons(), ...frame.components]
        }
      };
      const published = prepareSession(persistSceneResponse(nextState, interaction, response, [createdEvent.id], true), interaction);
      await saveUpdatedSession(interaction, published, {
        experience: published.experience,
        events: published.events,
        scenes: published.scenes
      });
      return response;
    }
    if (commandName === "extend-time" || commandName === "shorten-time" || commandName === "time-left") {
      if (!sessionState.experience) {
        return ephemeralMessage("진행 중인 Experience가 없습니다.");
      }
      if (sessionState.experience.status === "Ended") {
        return ephemeralMessage("이미 종료된 Experience입니다.");
      }
      const options = collectOptionValues(interaction.data?.options);
      const minutesValue = Number(options.minutes ?? options.duration ?? 30);
      const minutes = Number.isFinite(minutesValue) && minutesValue > 0 ? Math.round(minutesValue) : 30;
      if (commandName === "time-left") {
        return ephemeralMessage(getExperienceTimingMessage(sessionState.experience));
      }
      const nextExperience =
        commandName === "extend-time"
          ? adjustExperiencePlannedDuration(sessionState.experience, minutes)
          : adjustExperiencePlannedDuration(sessionState.experience, -minutes);
      const nextState = prepareSession(
        withUi(
          {
            ...sessionState,
            experience: nextExperience,
            statusMessage: commandName === "extend-time" ? `진행 시간을 연장했습니다. ${getExperienceTimingMessage(nextExperience)}` : `진행 시간을 단축했습니다. ${getExperienceTimingMessage(nextExperience)}`
          },
          { screen: isPlayingState(sessionState) ? "playing" : getSessionUi(sessionState).screen }
        ),
        interaction
      );
      await saveUpdatedSession(interaction, nextState);
      return ephemeralMessage(nextState.statusMessage);
    }
    if (commandName === "join") {
      const joined = joinLobbyState(sessionState, author);
      if (!joined.joined) {
        if (joined.reason === "no-lobby") {
          return ephemeralMessage("진행 중인 로비가 없습니다.");
        }
        if (joined.reason === "already-joined") {
          return ephemeralMessage("이미 참가했습니다.");
        }
        if (joined.reason === "full") {
          return ephemeralMessage("로비가 가득 찼습니다.");
        }
      }
      const nextState = prepareSession(joined.state, interaction);
      const response = renderLobbyResponse(nextState);
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    if (commandName === "leave") {
      if (!hasLobbyState(sessionState)) {
        return ephemeralMessage("진행 중인 로비가 없습니다.");
      }
      const nextPlayers = sessionState.players.filter((player) => player.id !== author.id);
      const nextHostId =
        sessionState.ui?.lobby?.hostId === author.id ? nextPlayers[0]?.id ?? author.id : sessionState.ui?.lobby?.hostId ?? author.id;
      const nextState = prepareSession(
        withUi(
          syncLobbyParticipants(
            {
              ...sessionState,
              statusMessage: `${author.name} 님이 이탈했습니다.`
            },
            nextPlayers
          ),
          {
            screen: "lobby",
            lobby: {
              ...(sessionState.ui?.lobby ?? { capacity: LOBBY_CAPACITY, hostId: author.id }),
              hostId: nextHostId
            }
          }
        ),
        interaction
      );
      await saveUpdatedSession(interaction, nextState);
      return renderLobbyResponse(nextState);
    }
    if (commandName === "choose-flow") {
      const options = collectOptionValues(interaction.data?.options);
      if (options.flow || options.flow_id) {
        const selectedFlowId = options.flow ?? options.flow_id;
        const flowSelectedEvent = createEvent("FlowSelected", "discord-bot", {
          flow_id: selectedFlowId,
          player_id: author.id,
          player_name: author.name
        });
        const nextState = prepareSession(
          appendEvents(handleFlowSelection(sessionState, selectedFlowId), [flowSelectedEvent]),
          interaction
        );
        const response = await updateResponse(nextState);
        const published = prepareSession(persistSceneResponse(nextState, interaction, response, [flowSelectedEvent.id], true), interaction);
        await saveUpdatedSession(interaction, published);
        return response;
      }
      const response = {
        type: 4,
        data: {
          content: "흐름을 선택하세요.",
          components: buildFlowButtons()
        }
      };
      const published = prepareSession(persistSceneResponse(sessionState, interaction, response, [], true), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "continue") {
      if (sessionState.phase === "ENDING" || sessionState.ui?.endingRetryPending) {
        const retriedEnding = await retryEndingRender(sessionState);
        const published = prepareSession(retriedEnding.state, interaction);
        await saveUpdatedSession(interaction, published);
        return retriedEnding.response;
      }
      const continued = prepareSession(withUi(applySceneContinue(sessionState), { screen: "playing" }), interaction);
      const response = await updateResponse(continued);
      const published = prepareSession(persistSceneResponse(continued, interaction, response, [], true), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "end") {
      const currentExperience =
        sessionState.experience ??
        createExperience({
          participantNames: sessionState.players.map((player) => player.name)
        }).experience;
      const endingAttempt = await attemptEndingGeneration(
        withUi(
          {
            ...sessionState,
            experience: currentExperience,
            phase: "ENDING"
          },
          { endingRetryPending: false }
        )
      );
      if (!endingAttempt.completed) {
        const retryState = prepareSession(endingAttempt.state, interaction);
        await saveUpdatedSession(interaction, retryState);
        return endingAttempt.response;
      }
      const ended = prepareSession(
        withUi(
          {
            ...endingAttempt.state,
            experience: endingAttempt.state.experience,
            phase: "ENDING",
            endingText: endingAttempt.state.endingText,
            statusMessage: "Experience를 종료했습니다."
          },
          { screen: "playing" }
        ),
        interaction
      );
      const response = await updateResponse(ended);
      const published = prepareSession(persistSceneResponse(ended, interaction, response, [endingAttempt.event?.id].filter(Boolean), true), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }

    const legacyNextState = applyLegacyCommand(commandName, interaction, sessionState);
    if (commandName === "complete") {
      return completionModal(interaction);
    }
    if (commandName === "reset") {
      await resetSession(createSessionKey(interaction.guild_id ?? null, interaction.channel_id));
      return ephemeralMessage("세션을 초기화했습니다.");
    }
    const prepared = prepareSession(legacyNextState, interaction);
    if (commandName === "start") {
      const response = await panelResponse(withUi(prepared, { screen: "playing" }));
      const published = prepareSession(persistSceneResponse(prepared, interaction, response, [], true), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "status") {
      return ephemeralMessage(buildLegacyStatusContent(prepared));
    }
    const response = await updateResponse(withUi(prepared, { screen: "playing" }));
    const published = prepareSession(persistSceneResponse(prepared, interaction, response, [], true), interaction);
    await saveUpdatedSession(interaction, published);
    return response;
  }

  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id ?? "";
    const author = getAuthor(interaction);
    if (customId === "menu:new-game") {
      const nextState = prepareSession(createExperienceLobbyState(author), interaction);
      await saveUpdatedSession(interaction, nextState);
      return renderLobbyResponse(nextState);
    }
    if (customId === "menu:join-game") {
      const joined = joinLobbyState(sessionState, author);
      if (!joined.joined) {
        return ephemeralMessage(
          joined.reason === "no-lobby"
            ? "진행 중인 로비가 없습니다."
            : joined.reason === "already-joined"
              ? "이미 참가했습니다."
              : "로비가 가득 찼습니다."
        );
      }
      const nextState = prepareSession(joined.state, interaction);
      await saveUpdatedSession(interaction, nextState);
      return renderLobbyResponse(nextState);
    }
    if (customId === "menu:resume") {
      const resumed = resumeScreenState(sessionState);
      if (!resumed) {
        return ephemeralMessage("이어할 진행이 없습니다.");
      }
      const nextState = prepareSession(resumed, interaction);
      const response = isPlayingState(nextState) ? await renderPlayStatusResponse(nextState, false) : renderLobbyResponse(nextState);
      const published = prepareSession(
        persistSceneResponse(nextState, interaction, response, [], isPlayingState(nextState)),
        interaction
      );
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId === "lobby:join") {
      const joined = joinLobbyState(sessionState, author);
      if (!joined.joined) {
        return ephemeralMessage(
          joined.reason === "no-lobby"
            ? "진행 중인 로비가 없습니다."
            : joined.reason === "already-joined"
              ? "이미 참가했습니다."
              : "로비가 가득 찼습니다."
        );
      }
      const nextState = prepareSession(joined.state, interaction);
      await saveUpdatedSession(interaction, nextState);
      return renderLobbyResponse(nextState);
    }
    if (customId.startsWith("lobby:duration:")) {
      if (!hasLobbyState(sessionState)) {
        return ephemeralMessage("진행 중인 로비가 없습니다.");
      }
      if ((sessionState.ui?.lobby?.hostId ?? author.id) !== author.id) {
        return ephemeralMessage("호스트만 진행 시간을 설정할 수 있습니다.");
      }
      if (getLobbySelectedDuration(sessionState)) {
        await saveUpdatedSession(interaction, sessionState);
        return renderLobbyResponse(sessionState);
      }
      const value = customId.slice("lobby:duration:".length);
      if (value === "custom") {
        return buildLobbyDurationModal(`lobby:duration-modal:${interaction.channel_id}`);
      }
      const nextState = prepareSession(applyLobbyDurationSelection(sessionState, Number(value)), interaction);
      await saveUpdatedSession(interaction, nextState);
      return renderLobbyResponse(nextState);
    }
    if (customId === "lobby:ready") {
      if (!hasLobbyState(sessionState)) {
        return ephemeralMessage("진행 중인 로비가 없습니다.");
      }
      const lobbyPlayers = sessionState.players.length > 0 ? sessionState.players : [{ id: author.id, name: author.name }];
      if ((sessionState.ui?.lobby?.hostId ?? author.id) !== author.id) {
        return ephemeralMessage("호스트만 Experience를 시작할 수 있습니다.");
      }
      const selectedDuration = getLobbySelectedDuration(sessionState);
      if (!selectedDuration) {
        return ephemeralMessage("먼저 진행 시간을 선택해 주세요.");
      }
      const baseExperience =
        sessionState.experience ??
        createExperience({
          participantNames: lobbyPlayers.map((player) => player.name),
          plannedDurationMinutes: selectedDuration
        }).experience;
      const durationAwareExperience = setExperiencePlannedDuration(baseExperience, selectedDuration);
      const startedExperience = startExperience(syncExperienceParticipants(durationAwareExperience, lobbyPlayers));
      const nextState = prepareSession(
        withUi(
          {
            ...sessionState,
            experience: startedExperience,
            players: lobbyPlayers,
            phase: "PLAYING",
            statusMessage: `Experience를 준비하고 있습니다... (${selectedDuration}분)`
          },
          { screen: "playing" }
        ),
        interaction
      );
      const response = await renderPlayIntroResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response, [], true), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId === "scene:record") {
      const beat = getCurrentExperienceBeat(sessionState);
      return textMissionModal(interaction, beat);
    }
    if (customId.startsWith("scene:choice:")) {
      const choice = decodeURIComponent(customId.slice("scene:choice:".length));
      const submission = submitSceneInput(sessionState, interaction, "CHOICE", {
        player_id: author.id,
        player_name: author.name,
        choice
      });
      const nextState = prepareSession(submission.state, interaction);
      if (submission.completed) {
        const attempted = await attemptSceneCompletion(nextState, submission);
        if (attempted.completed) {
          const published = prepareSession(persistSceneResponse(attempted.state, interaction, attempted.response), interaction);
          await saveUpdatedSession(interaction, published);
        } else {
          await saveUpdatedSession(interaction, prepareSession(attempted.state, interaction));
        }
        return attempted.response;
      }
      const response = await updateResponse(nextState);
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    if (customId === "scene:upload-photo") {
      const beat = getCurrentExperienceBeat(sessionState);
      const mode = getSceneInputDefinition(beat).photoDeliveryMode;
      const nextState = prepareSession(buildScenePhotoUploadState(sessionState, mode, author), interaction);
      const response = await updateResponse(nextState);
      response.meta = {
        ...(response.meta ?? {}),
        photoUpload: {
          mode,
          sceneId: nextState.currentSceneId ?? null,
          parentChannelId: interaction.channel_id,
          requestedBy: author.id
        }
      };
      response.data = {
        ...(response.data ?? {}),
        content: `${response.data?.content ?? ""}\n\n사진을 올리려면 /upload-photo 명령으로 파일을 첨부하세요.`.trim()
      };
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    if (customId === "scene:retry-ai") {
      const retrySubmission = buildRetrySceneSubmission(sessionState);
      if (retrySubmission) {
      const attempted = await attemptSceneCompletion(sessionState, retrySubmission);
        if (attempted.completed) {
          const published = prepareSession(persistSceneResponse(attempted.state, interaction, attempted.response), interaction);
          await saveUpdatedSession(interaction, published);
        } else {
          await saveUpdatedSession(interaction, prepareSession(attempted.state, interaction));
        }
        return attempted.response;
      }
      const retried = await retrySceneRender(sessionState);
      const published = retried.completed
        ? prepareSession(persistSceneResponse(retried.state, interaction, retried.response), interaction)
        : prepareSession(retried.state, interaction);
      await saveUpdatedSession(interaction, published);
      return retried.response;
    }
    if (customId === "ending:retry-ai") {
      const retriedEnding = await retryEndingRender(sessionState);
      const published = prepareSession(retriedEnding.state, interaction);
      await saveUpdatedSession(interaction, published);
      return retriedEnding.response;
    }
    if (customId.startsWith("lobby:duration-modal:")) {
      return ephemeralMessage("진행 시간 설정은 모달 제출로 처리됩니다.");
    }
    if (customId.startsWith("flow:")) {
      const flowId = customId.slice("flow:".length);
      const nextState = prepareSession(handleFlowSelection(sessionState, flowId), interaction);
      const response = await updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId.startsWith("scene:record-modal")) {
      const values = getModalValues(interaction);
      const submission = submitSceneInput(sessionState, interaction, "TEXT", {
        player_id: author.id,
        player_name: author.name,
        text: values.answer ?? values.text ?? ""
      });
      const nextState = prepareSession(submission.state, interaction);
      if (submission.completed) {
        const attempted = await attemptSceneCompletion(nextState, submission);
        if (attempted.completed) {
          const published = prepareSession(persistSceneResponse(attempted.state, interaction, attempted.response), interaction);
          await saveUpdatedSession(interaction, published);
        } else {
          await saveUpdatedSession(interaction, prepareSession(attempted.state, interaction));
        }
        return attempted.response;
      }
      const response = await updateResponse(nextState);
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    if (customId === "game:complete") {
      return completionModal(interaction);
    }

    const nextState =
      customId === "game:checkpoint"
        ? goCheckpoint(sessionState)
        : customId === "game:next"
          ? selectNextMission(sessionState)
          : customId === "game:emergency"
            ? useEmergencyMission(sessionState)
            : customId === "game:ending"
              ? generateEnding(sessionState)
              : customId === "game:finish"
                ? finishGame(sessionState)
                : customId === "game:reset"
                  ? resetGame()
                  : customId === "game:status"
                    ? sessionState
                    : sessionState;

    if (customId === "game:reset") {
      await resetSession(createSessionKey(interaction.guild_id ?? null, interaction.channel_id));
      return ephemeralMessage("세션을 초기화했습니다.");
    }
    const prepared = prepareSession(nextState, interaction);
    const response = await updateResponse(prepared);
    const published = prepareSession(persistSceneResponse(prepared, interaction, response), interaction);
    await saveUpdatedSession(interaction, published);
    return response;
  }

  if (interaction.type === 5) {
    const values = getModalValues(interaction);
    const author = getAuthor(interaction);
    const customId = interaction.data?.custom_id ?? "";
    if (customId.startsWith("lobby:duration-modal:")) {
      if (!hasLobbyState(sessionState)) {
        return ephemeralMessage("진행 중인 로비가 없습니다.");
      }
      if ((sessionState.ui?.lobby?.hostId ?? author.id) !== author.id) {
        return ephemeralMessage("호스트만 진행 시간을 설정할 수 있습니다.");
      }
      if (getLobbySelectedDuration(sessionState)) {
        await saveUpdatedSession(interaction, sessionState);
        return renderLobbyResponse(sessionState);
      }
      const minutes = Number(values.durationMinutes ?? values.minutes ?? values.duration ?? "");
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return ephemeralMessage("진행 시간을 확인할 수 없습니다.");
      }
      const nextState = prepareSession(applyLobbyDurationSelection(sessionState, minutes), interaction);
      await saveUpdatedSession(interaction, nextState);
      return renderLobbyResponse(nextState);
    }
    if (customId.startsWith("scene:record-modal")) {
      const submission = submitSceneInput(sessionState, interaction, "TEXT", {
        player_id: author.id,
        player_name: author.name,
        text: values.answer ?? values.text ?? ""
      });
      const nextState = prepareSession(submission.state, interaction);
      if (submission.completed) {
        const attempted = await attemptSceneCompletion(nextState, submission);
        if (attempted.completed) {
          const published = prepareSession(persistSceneResponse(attempted.state, interaction, attempted.response), interaction);
          await saveUpdatedSession(interaction, published);
        } else {
          await saveUpdatedSession(interaction, prepareSession(attempted.state, interaction));
        }
        return attempted.response;
      }
      const response = await updateResponse(nextState);
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    const nextState = prepareSession(
      completeMission(sessionState, {
        foreshadowText: values.foreshadowText ?? "",
        mood: values.mood ?? "",
        interactionId: interaction.id,
        authorId: author.id,
        authorName: author.name
      }),
      interaction
    );
    const response = await updateResponse(nextState);
    const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
    await saveUpdatedSession(interaction, published);
    return response;
  }

    return ephemeralMessage("지원하지 않는 interaction 입니다.");
  });
}

function buildObservationEventType(observation) {
  const hasAttachments = Array.isArray(observation.payload?.attachments) && observation.payload.attachments.length > 0;
  if (hasAttachments) {
    return "PlayerUploadedPhoto";
  }
  if (observation.type === "thread") {
    return "SceneThreadMessageCreated";
  }
  if (observation.type === "dm") {
    return "SecretInputReceived";
  }
  if (observation.type === "reaction") {
    return "PlayerReacted";
  }
  if (observation.type === "voice") {
    return "PlayerSubmittedVoice";
  }
  return "PlayerSubmittedText";
}

export async function handleDiscordObservation(sessionKey, observation) {
  return await enqueueSessionTask(sessionKey, async () => {
    const session = await loadSession(sessionKey);
    const state = session?.state ?? resetGame();
    const hasPhotoAttachments = Array.isArray(observation.payload?.attachments) && observation.payload.attachments.length > 0;
    const observationId = observation.id ?? `${Date.now()}`;
    const channelId = session?.channelId ?? observation.channelId ?? sessionKey.split(":").at(-1) ?? "unknown";
    let nextState;
    let response = null;
    let completed = false;
    let event;

  if (hasPhotoAttachments) {
    const submission = submitSceneInput(state, { id: observation.id ?? `${Date.now()}`, channel_id: session?.channelId ?? observation.channelId ?? "unknown" }, "PHOTO", {
      player_id: observation.sourceId,
      player_name: observation.sourceName ?? observation.sourceId ?? "플레이어",
      text: typeof observation.payload?.content === "string" ? observation.payload.content : "",
      attachments: observation.payload.attachments
    });
    const submittedState = prepareSession(submission.state, {
      id: observationId,
      type: 2,
      token: "",
      channel_id: session?.channelId ?? observation.channelId ?? "unknown"
    });
    event = submittedState.events?.at(-1) ?? null;
    if (submission.completed) {
      const attempted = await attemptSceneCompletion(submittedState, submission);
      nextState = prepareSession(attempted.state, {
        id: observationId,
        type: 2,
        token: "",
        channel_id: session?.channelId ?? observation.channelId ?? "unknown"
      });
      response = attempted.response;
      completed = attempted.completed;
    } else {
      nextState = submittedState;
    }
  } else {
    const eventType = buildObservationEventType(observation);
    event = createEvent(eventType, observation.sourceId, observation.payload);
    nextState = prepareSession(
      {
        ...state,
        events: [...(state.events ?? []), event],
        storyMemories: [
          ...(state.storyMemories ?? []),
          {
            id: `memory-${(state.storyMemories?.length ?? 0) + 1}`,
            sourceEventIds: [event.id],
            sourceSceneId: observation.sceneId ?? state.currentSceneId ?? null,
            summary: summarizeMemoryCandidate(event),
            tags: ["callback"],
            callbackWeight: 1
          }
        ]
      },
      {
        id: event.id,
        type: 2,
        token: "",
        channel_id: channelId
      }
    );
  }

  const publishedState = response
    ? prepareSession(
        persistSceneResponse(
          nextState,
          {
            guild_id: null,
            channel_id: channelId
          },
          response,
          event ? [event.id] : [],
          true
        ),
        {
          id: observationId,
          type: 2,
          token: "",
          channel_id: channelId
        }
      )
    : nextState;

    await saveSession({
      ...(session ?? buildSessionRecord(null, publishedState.currentSceneId ?? channelId, publishedState)),
      state: publishedState,
      updatedAt: new Date().toISOString()
    });

    return {
      state: publishedState,
      response,
      completed,
      event,
      sessionKey
    };
  });
}

function ed25519PublicKeyFromHex(hexKey) {
  const raw = Buffer.from(hexKey, "hex");
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return crypto.createPublicKey({
    key: Buffer.concat([prefix, raw]),
    format: "der",
    type: "spki"
  });
}

export function verifyDiscordSignature(body, timestamp, signature, publicKeyHex) {
  const publicKey = ed25519PublicKeyFromHex(publicKeyHex);
  return crypto.verify(null, Buffer.from(`${timestamp}${body}`), publicKey, Buffer.from(signature, "hex"));
}
