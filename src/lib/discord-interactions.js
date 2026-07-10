import crypto from "node:crypto";
import {
  buildCoverage,
  buildStoryBeatForExperience,
  advanceExperienceProgress,
  chooseNextStage,
  createEvent,
  createExperience,
  createResult,
  endExperience,
  getFlowById,
  listFlows,
  renderEndingNarrative,
  renderScene,
  setFlow,
  startExperience,
  summarizeMemoryCandidate
} from "./experience.js";
import { renderScenePromptWithAi } from "./ai-renderer.js";
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
  return { playerNames, environmentTags, flowId };
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

function buildLobbyButtons(disabled = false) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: "lobby:join", label: "참가하기", disabled },
        { type: 2, style: 3, custom_id: "lobby:ready", label: "준비 완료", disabled }
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
  return lines.join("\n");
}

function renderLobbyResponse(state) {
  return {
    type: 7,
    data: {
      content: renderLobbyContent(state),
      components: buildLobbyButtons()
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
    participantNames: initialPlayers.map((player) => player.name)
  });
  return withUi(
    {
      ...baseState,
      players: initialPlayers,
      phase: "READY",
      statusMessage: "Experience를 생성했습니다.",
      experience: {
        ...created.experience,
        status: "Created"
      },
      flows: listFlows()
    },
    {
      screen: "lobby",
      lobby: {
        capacity: LOBBY_CAPACITY,
        hostId: author.id
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
  const types = inputType
    .split(/[+,]/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return types.length > 0 ? types : ["TEXT"];
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
  const beat = stage ? buildStoryBeatForExperience(experience, stage) : null;
  return beat ? { ...beat, flow, stage } : null;
}

function getSceneInputDefinition(beat) {
  const inputTypes = normalizeSceneInputTypes(beat?.mission?.input_type);
  const choiceOptions = normalizeSceneChoiceOptions(beat?.mission?.input_options);
  return {
    inputTypes,
    choiceOptions
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

function isSceneInputSatisfied(sceneInput, inputTypes) {
  if (inputTypes.includes("CHOICE") && !sceneInput.selectedChoice) {
    return false;
  }
  return inputTypes.every((type) => {
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
  });
}

function renderSceneContent(state) {
  if (state.experience?.status === "Ended" && state.endingText) {
    return renderEndingNarrative(state.experience, state.storyMemories ?? []);
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
  const { inputTypes } = getSceneInputDefinition(beat);
  const completed = isSceneInputSatisfied(sceneInput, inputTypes);
  return renderScene({
    title: completed ? "✅ Mission Complete" : "🎬 오늘의 장면",
    prompt: beat.mission.prompt_hint,
    detail: completed ? "입력이 모두 제출되었습니다." : null,
    memory: state.storyMemories?.at(-1) ?? null
  });
}

async function renderSceneContentWithAi(state) {
  if (state.experience?.status === "Ended" && state.endingText) {
    return renderEndingNarrative(state.experience, state.storyMemories ?? []);
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
  const { inputTypes, choiceOptions } = getSceneInputDefinition(beat);
  const completed = isSceneInputSatisfied(sceneInput, inputTypes);
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
  if (state.ui?.sceneRetryPending) {
    return buildAiFailureButtons(disabled);
  }
  const beat = getCurrentExperienceBeat(state);
  if (!beat) {
    return [];
  }
  const sceneDisabled = disabled || state.phase === "FINISHED" || state.experience?.status === "Ended";
  const sceneInput = getSceneInputState(state);
  const { inputTypes, choiceOptions } = getSceneInputDefinition(beat);
  const completed = isSceneInputSatisfied(sceneInput, inputTypes);
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
      buttons.push({ type: 2, style: 2, custom_id: "scene:upload-photo", label: "사진 올리기", disabled: sceneDisabled });
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
  const mergedState = {
    ...state,
    events: extra.events ?? state.events,
    experience: extra.experience ?? state.experience,
    scenes: extra.scenes ?? state.scenes
  };
  await saveSession({
    ...buildSessionRecord(interaction.guild_id ?? null, interaction.channel_id, mergedState),
    events: mergedState.events,
    experience: mergedState.experience,
    scenes: mergedState.scenes
  });
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

function prepareSession(state, interaction) {
  return {
    ...state,
    processedInteractionIds: state.processedInteractionIds.includes(interaction.id)
      ? state.processedInteractionIds
      : [...state.processedInteractionIds, interaction.id]
  };
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
        status: "Ended",
        endedAt: new Date().toISOString()
      },
      phase: "ENDING",
      endingText: renderEndingNarrative(state.experience, state.storyMemories ?? []),
      statusMessage: "경험을 마무리했습니다."
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
    input_types: submission.inputTypes,
    input_type: submission.inputType,
    choice: submission.nextSceneInput?.selectedChoice ?? null,
    text: typeof submission.payload?.text === "string" ? submission.payload.text : null,
    photo_submitted: submission.inputType === "PHOTO"
  });
  const nextExperience = advanceExperienceProgress(state.experience, submission.beat.stage?.name ?? null);
  const completedState = appendEvents(
    pushResult(
      {
        ...state,
        experience: nextExperience
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
        achieved: nextExperience?.coverage?.achieved ?? [],
        pending: nextExperience?.coverage?.pending ?? []
      })
    ]
  );
  return {
    ...withUi(completedState, {
      sceneInput: null,
      sceneRetryPending: false
    }),
    completedResult
  };
}

async function attemptSceneCompletion(state, submission) {
  const recordedEventId = state.events?.at(-1)?.id ?? null;
  const completedState = buildSceneCompletionState(state, submission, recordedEventId);
  const progressed = withUi(applySceneContinue(completedState), {
    screen: "playing",
    sceneInput: null,
    sceneRetryPending: false
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

function buildRetrySceneSubmission(state) {
  const beat = getCurrentExperienceBeat(state);
  if (!beat) {
    return null;
  }
  const sceneInput = getSceneInputState(state);
  const { inputTypes } = getSceneInputDefinition(beat);
  if (!isSceneInputSatisfied(sceneInput, inputTypes)) {
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
  const { inputTypes } = getSceneInputDefinition(beat);
  if (!isSceneInputSatisfied(nextSceneInput, inputTypes)) {
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
  const session = await loadInteractionSession(interaction);
  const sessionState = session?.state ?? resetGame();
  if (sessionState.processedInteractionIds.includes(interaction.id)) {
    return ephemeralMessage("이미 처리된 요청입니다.");
  }

  if (interaction.type === 1) {
    return { type: 1 };
  }

  if (interaction.type === 2) {
    const commandName = interaction.data?.name ?? "";
    const author = getAuthor(interaction);
    if (commandName === "begin") {
      const nextState = prepareSession(withUi(sessionState, { screen: "main-menu" }), interaction);
      const response = renderMainMenuResponse();
      await saveUpdatedSession(interaction, nextState);
      return response;
    }
    if (commandName === "status") {
      return ephemeralMessage(renderStatusSnapshot(sessionState));
    }
    if (commandName === "start-experience") {
      const { playerNames, flowId } = parseStartOptions(interaction);
      const starting = createExperience({
        participantNames: playerNames.length > 0 ? playerNames : [author.name],
        flowId
      });
      const begunExperience = startExperience(starting.experience);
      const createdEvent = createEvent("ExperienceCreated", "discord-bot", {
        guild_id: interaction.guild_id ?? null,
        channel_id: interaction.channel_id,
        flow_id: starting.flow?.id ?? null,
        player_names: begunExperience.participants.map((player) => player.name)
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
      const endedExperience = endExperience(currentExperience);
      const endedEvent = createEvent("ExperienceEnded", "discord-bot", {
        experience_id: endedExperience.id,
        flow_id: endedExperience.flowId
      });
      const ended = prepareSession(
        withUi(
          {
            ...appendEvents(sessionState, [endedEvent]),
            experience: endedExperience,
            phase: "ENDING",
            endingText: renderEndingNarrative(endedExperience, sessionState.storyMemories ?? []),
            statusMessage: "Experience를 종료했습니다."
          },
          { screen: "playing" }
        ),
        interaction
      );
      const response = await updateResponse(ended);
      const published = prepareSession(persistSceneResponse(ended, interaction, response, [endedEvent.id], true), interaction);
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
    if (customId === "lobby:ready") {
      if (!hasLobbyState(sessionState)) {
        return ephemeralMessage("진행 중인 로비가 없습니다.");
      }
      const lobbyPlayers = sessionState.players.length > 0 ? sessionState.players : [{ id: author.id, name: author.name }];
      if ((sessionState.ui?.lobby?.hostId ?? author.id) !== author.id) {
        return ephemeralMessage("호스트만 Experience를 시작할 수 있습니다.");
      }
      const baseExperience =
        sessionState.experience ??
        createExperience({ participantNames: lobbyPlayers.map((player) => player.name) }).experience;
      const startedExperience = startExperience(syncExperienceParticipants(baseExperience, lobbyPlayers));
      const nextState = prepareSession(
        withUi(
          {
            ...sessionState,
            experience: startedExperience,
            players: lobbyPlayers,
            phase: "PLAYING",
            statusMessage: "Experience를 준비하고 있습니다..."
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
      const submission = submitSceneInput(sessionState, interaction, "PHOTO", {
        player_id: author.id,
        player_name: author.name
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
    if (customId.startsWith("scene:record-modal")) {
      const submission = submitSceneInput(sessionState, interaction, "TEXT", {
        player_id: author.id,
        player_name: author.name,
        text: values.answer ?? values.text ?? ""
      });
      const nextState = prepareSession(submission.state, interaction);
      const response = submission.completed ? await panelResponse(nextState) : await updateResponse(nextState);
      if (submission.completed) {
        const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
        await saveUpdatedSession(interaction, published);
      } else {
        await saveUpdatedSession(interaction, nextState);
      }
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
}

export async function handleDiscordObservation(sessionKey, observation) {
  const session = await loadSession(sessionKey);
  const state = session?.state ?? resetGame();
  const eventType =
    observation.type === "thread"
      ? "SceneThreadMessageCreated"
      : observation.type === "dm"
        ? "SecretInputReceived"
        : observation.type === "reaction"
          ? "PlayerReacted"
          : observation.type === "voice"
            ? "PlayerSubmittedVoice"
            : "PlayerSubmittedText";
  const event = createEvent(eventType, observation.sourceId, observation.payload);
  const nextState = prepareSession(
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
      channel_id: session?.channelId ?? sessionKey.split(":").at(-1) ?? "unknown"
    }
  );
  await saveSession({
    ...(session ?? buildSessionRecord(null, nextState.currentSceneId ?? sessionKey.split(":").at(-1) ?? "unknown", nextState)),
    state: nextState,
    updatedAt: new Date().toISOString()
  });
  return nextState;
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
