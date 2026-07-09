import crypto from "node:crypto";
import type { Event, Experience, GameState, SceneRecord } from "@/types/game";
import {
  addParticipant,
  buildCoverage,
  buildStoryBeatForExperience,
  chooseNextStage,
  createEvent,
  createExperience,
  endExperience,
  getFlowById,
  listFlows,
  renderEndingNarrative,
  renderScene,
  setFlow,
  startExperience,
  summarizeMemoryCandidate
} from "@/lib/experience";
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
} from "@/lib/game";
import { loadSession, resetSession, saveSession } from "@/lib/session-store";

export type DiscordInteractionType = 1 | 2 | 3 | 5;

export interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string;
}

export interface DiscordMember {
  user?: DiscordUser;
}

export interface DiscordOption {
  name: string;
  value?: string | number | boolean;
  options?: DiscordOption[];
}

export interface DiscordInteraction {
  id: string;
  type: DiscordInteractionType;
  token: string;
  guild_id?: string | null;
  channel_id: string;
  data?: {
    name?: string;
    custom_id?: string;
    components?: Array<{
      components?: Array<{ custom_id?: string; value?: string }>;
    }>;
    options?: DiscordOption[];
  };
  member?: DiscordMember;
  user?: DiscordUser;
  message?: {
    id: string;
  };
}

export type DiscordButtonStyle = 1 | 2 | 3 | 4 | 5;

export interface DiscordComponentButton {
  type: 2;
  style: DiscordButtonStyle;
  custom_id: string;
  label: string;
  disabled?: boolean;
}

export interface DiscordActionRow {
  type: 1;
  components: DiscordComponentButton[];
}

export interface DiscordModalInput {
  type: 4;
  custom_id: string;
  style: 1 | 2;
  label: string;
  required: boolean;
  placeholder?: string;
  value?: string;
}

interface DiscordMessageResponseData {
  content?: string;
  flags?: number;
  components?: DiscordActionRow[];
}

interface DiscordModalResponseData {
  title: string;
  custom_id: string;
  components: Array<{
    type: 1;
    components: DiscordModalInput[];
  }>;
}

export type DiscordInteractionResponse =
  | { type: 1 }
  | { type: 4; data: DiscordMessageResponseData }
  | { type: 7; data: DiscordMessageResponseData }
  | { type: 9; data: DiscordModalResponseData };

type SessionEnvelope = {
  events?: Event[];
  experience?: Experience;
  scenes?: SceneRecord[];
};

function collectOptionValues(options: DiscordOption[] | undefined, target: Record<string, string> = {}) {
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

function getAuthor(interaction: DiscordInteraction) {
  const user = interaction.member?.user ?? interaction.user;
  return {
    id: user?.id ?? "unknown",
    name: user?.username ?? user?.global_name ?? "플레이어"
  };
}

function parseStartOptions(interaction: DiscordInteraction) {
  const options = collectOptionValues(interaction.data?.options);
  const playerNames = (options.players ?? options.player_names ?? options.players_list ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const environmentTags = (options.tags ?? options.environment_tags ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const flowId = (options.flow ?? options.flow_id ?? options.flowName ?? "").trim() || "adventure";
  return { playerNames, environmentTags, flowId };
}

function getModalValues(interaction: DiscordInteraction) {
  const values: Record<string, string> = {};
  for (const row of interaction.data?.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.custom_id && typeof component.value === "string") {
        values[component.custom_id] = component.value;
      }
    }
  }
  return values;
}

function phaseToSceneTitle(state: GameState) {
  const experience = state.experience;
  if (experience?.status === "Playing") {
    return "🎬 다음 장면";
  }
  if (experience?.status === "Ended") {
    return "🎬 엔딩";
  }
  return "🎬 준비 중";
}

function buildLegacyStatusContent(state: GameState) {
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

function buildSceneContent(state: GameState) {
  const experience = state.experience;
  if (!experience) {
    return buildLegacyStatusContent(state);
  }
  const flow = getFlowById(experience.flowId);
  const stageName = experience.currentStageId ? experience.currentStageId.split("-").slice(1).join("-") : flow?.stageGraph[0] ?? null;
  const currentStageObject =
    flow && stageName
      ? {
          id: `${flow.id}-${stageName}`,
          flowId: flow.id,
          name: stageName,
          purpose:
            stageName.toLowerCase().includes("exploration")
              ? "낯선 장소와 친해진다."
              : stageName.toLowerCase().includes("discovery")
                ? "새로운 단서를 발견한다."
                : stageName.toLowerCase().includes("challenge")
                  ? "작은 긴장과 선택을 만든다."
                  : stageName.toLowerCase().includes("reflection")
                    ? "지나온 장면을 정리한다."
                    : stageName.toLowerCase().includes("conversation")
                      ? "사람과 대화하며 관계를 만든다."
                      : stageName.toLowerCase().includes("cooperation")
                        ? "팀이 함께 움직인다."
                        : stageName.toLowerCase().includes("understanding")
                          ? "서로를 더 잘 이해한다."
                          : stageName.toLowerCase().includes("memory")
                            ? "기억에 남을 장면을 남긴다."
                            : stageName.toLowerCase().includes("question")
                              ? "질문을 던져 시작한다."
                              : stageName.toLowerCase().includes("clue")
                                ? "작은 단서를 수집한다."
                                : stageName.toLowerCase().includes("reveal")
                                  ? "숨은 연결을 드러낸다."
                                  : stageName.toLowerCase().includes("resolution")
                                    ? "정리와 마무리를 만든다."
                                    : "함께 움직인다.",
          allowedNextStageIds: []
        }
      : null;
  const beat = currentStageObject ? buildStoryBeatForExperience(experience, currentStageObject) : null;
  const memory = state.storyMemories?.at(-1) ?? null;
  const rendered = renderScene({
    experience,
    flow,
    stage: currentStageObject,
    beat,
    memory
  });
  return rendered;
}

function buildSceneButtons(state: GameState, disabled = false): DiscordActionRow[] {
  const sceneDisabled = disabled || state.phase === "FINISHED" || state.experience?.status === "Ended";
  const rows: DiscordActionRow[] = [
    {
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: "scene:record", label: "기록하기", disabled: sceneDisabled },
        { type: 2, style: 2, custom_id: "scene:upload-photo", label: "사진 올리기", disabled: sceneDisabled },
        { type: 2, style: 2, custom_id: "scene:choose", label: "선택", disabled: sceneDisabled },
        { type: 2, style: 2, custom_id: "scene:skip", label: "넘기기", disabled: sceneDisabled },
        { type: 2, style: 4, custom_id: "scene:help", label: "어려워요", disabled: sceneDisabled }
      ]
    },
    {
      type: 1,
      components: [
        { type: 2, style: 3, custom_id: "scene:continue", label: "계속", disabled: sceneDisabled },
        { type: 2, style: 3, custom_id: "game:checkpoint", label: "체크포인트", disabled: sceneDisabled },
        { type: 2, style: 2, custom_id: "game:status", label: "상태", disabled: false },
        { type: 2, style: 4, custom_id: "game:reset", label: "리셋", disabled: false }
      ]
    }
  ];
  return rows;
}

function buildFlowButtons(disabled = false): DiscordActionRow[] {
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

function completionModal(interaction: DiscordInteraction): DiscordInteractionResponse {
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

function sceneModal(interaction: DiscordInteraction, kind: "record" | "choose"): DiscordInteractionResponse {
  return {
    type: 9,
    data: {
      title: kind === "record" ? "기록하기" : "선택하기",
      custom_id: `scene:${kind}-modal:${interaction.channel_id}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: kind === "record" ? "text" : "choice",
              label: kind === "record" ? "기록" : "선택",
              style: 2,
              required: true,
              placeholder: kind === "record" ? "지금 장면을 짧게 적어보세요." : "이 장면에서 무엇을 선택했는지 적으세요."
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "reflection",
              label: "짧은 메모",
              style: 2,
              required: false,
              placeholder: "느낌, 메모, 관계를 적어도 됩니다."
            }
          ]
        }
      ]
    }
  };
}

function panelResponse(state: GameState): DiscordInteractionResponse {
  return {
    type: 4,
    data: {
      content: `${phaseToSceneTitle(state)}\n\n${buildSceneContent(state)}`,
      components: buildSceneButtons(state)
    }
  };
}

function updateResponse(state: GameState): DiscordInteractionResponse {
  return {
    type: 7,
    data: {
      content: `${phaseToSceneTitle(state)}\n\n${buildSceneContent(state)}`,
      components: buildSceneButtons(state)
    }
  };
}

function ephemeralMessage(content: string): DiscordInteractionResponse {
  return {
    type: 4,
    data: {
      content,
      flags: 64
    }
  };
}

async function saveUpdatedSession(interaction: DiscordInteraction, state: GameState, extra?: SessionEnvelope) {
  const mergedState: GameState = {
    ...state,
    events: extra?.events ?? state.events,
    experience: extra?.experience ?? state.experience,
    scenes: extra?.scenes ?? state.scenes
  };
  await saveSession({
    ...buildSessionRecord(interaction.guild_id ?? null, interaction.channel_id, mergedState),
    events: mergedState.events,
    experience: mergedState.experience,
    scenes: mergedState.scenes
  });
}

function pushEvent(state: GameState, event: Event) {
  return {
    ...state,
    events: [...(state.events ?? []), event]
  } satisfies GameState;
}

function appendEvents(state: GameState, events: Event[]) {
  return {
    ...state,
    events: [...(state.events ?? []), ...events]
  } satisfies GameState;
}

function pushMemory(state: GameState, summary: string, sourceEventIds: string[]) {
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
  } satisfies GameState;
}

function sceneTitleFromContent(content: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ?? "Scene";
}

function publishScene(state: GameState, interaction: DiscordInteraction, content: string, sourceEventIds: string[] = []) {
  const experienceId = state.experience?.id ?? createSessionKey(interaction.guild_id ?? null, interaction.channel_id);
  const sceneId = `scene-${(state.scenes?.length ?? 0) + 1}`;
  const title = sceneTitleFromContent(content);
  const scene: SceneRecord = {
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

function persistSceneResponse(
  state: GameState,
  interaction: DiscordInteraction,
  response: DiscordInteractionResponse,
  sourceEventIds: string[] = []
) {
  if (response.type !== 4 && response.type !== 7) {
    return state;
  }
  const content = response.data?.content ?? "";
  return publishScene(state, interaction, content, sourceEventIds);
}

function attachExperience(state: GameState, experience: Experience, flowId?: string) {
  const selectedFlow = getFlowById(flowId ?? experience.flowId) ?? getFlowById("adventure");
  const nextState: GameState = {
    ...state,
    experience: {
      ...experience,
      flowId: selectedFlow?.id ?? experience.flowId,
      coverage: selectedFlow ? buildCoverage(selectedFlow) : experience.coverage
    },
    flows: listFlows(),
    phase: experience.status === "Ended" ? "FINISHED" : experience.status === "Playing" ? "PLAYING" : "READY"
  };
  return nextState;
}

function prepareSession(state: GameState, interaction: DiscordInteraction) {
  return {
    ...state,
    processedInteractionIds: state.processedInteractionIds.includes(interaction.id)
      ? state.processedInteractionIds
      : [...state.processedInteractionIds, interaction.id]
  };
}

async function loadInteractionSession(interaction: DiscordInteraction) {
  const sessionKey = createSessionKey(interaction.guild_id ?? null, interaction.channel_id);
  return await loadSession(sessionKey);
}

function ensureExperienceState(state: GameState) {
  return state;
}

function applyLegacyCommand(commandName: string, interaction: DiscordInteraction, sessionState: GameState) {
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

function renderExperienceScene(state: GameState) {
  const experience = state.experience;
  if (!experience) {
    return buildLegacyStatusContent(state);
  }
  const flow = getFlowById(experience.flowId) ?? listFlows()[0] ?? null;
  const stageId = experience.currentStageId;
  const stageName = stageId ? stageId.split("-").slice(1).join("-") : flow?.stageGraph[0] ?? null;
  const currentStage =
    flow && stageName
      ? {
          id: `${flow.id}-${stageName}`,
          flowId: flow.id,
          name: stageName,
          purpose:
            stageName.toLowerCase().includes("exploration")
              ? "낯선 장소와 친해진다."
              : stageName.toLowerCase().includes("discovery")
                ? "새로운 단서를 발견한다."
                : stageName.toLowerCase().includes("challenge")
                  ? "작은 긴장과 선택을 만든다."
                  : stageName.toLowerCase().includes("reflection")
                    ? "지나온 장면을 정리한다."
                    : stageName.toLowerCase().includes("conversation")
                      ? "사람과 대화하며 관계를 만든다."
                      : stageName.toLowerCase().includes("cooperation")
                        ? "팀이 함께 움직인다."
                        : stageName.toLowerCase().includes("understanding")
                          ? "서로를 더 잘 이해한다."
                          : stageName.toLowerCase().includes("memory")
                            ? "기억에 남을 장면을 남긴다."
                            : stageName.toLowerCase().includes("question")
                              ? "질문을 던져 시작한다."
                              : stageName.toLowerCase().includes("clue")
                                ? "작은 단서를 수집한다."
                                : stageName.toLowerCase().includes("reveal")
                                  ? "숨은 연결을 드러낸다."
                                  : stageName.toLowerCase().includes("resolution")
                                    ? "정리와 마무리를 만든다."
                                    : "함께 움직인다.",
          allowedNextStageIds: []
        }
      : null;
  const beat = currentStage ? buildStoryBeatForExperience(experience, currentStage) : null;
  return renderScene({
    experience,
    flow,
    stage: currentStage,
    beat,
    memory: state.storyMemories?.at(-1) ?? null
  });
}

function applySceneContinue(state: GameState) {
  if (!state.experience) {
    return selectNextMission(state);
  }
  const flow = getFlowById(state.experience.flowId) ?? listFlows()[0] ?? null;
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
    } satisfies GameState;
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
  } satisfies GameState;
}

function handleFlowSelection(state: GameState, flowId: string) {
  const baseExperience =
    state.experience ??
    createExperience({
      participantNames: state.players.map((player) => player.name),
      flowId
    }).experience;
  const updated = setFlow(baseExperience, flowId);
  return {
    ...state,
    experience: updated.experience,
    flows: listFlows(),
    players: state.players.length > 0 ? state.players : updated.experience.participants,
    phase: state.phase === "PLAYING" ? "PLAYING" : "READY",
    statusMessage: `흐름을 ${updated.flow.name}로 선택했습니다.`
  } satisfies GameState;
}

function recordSceneScene(state: GameState, interaction: DiscordInteraction, kind: string, payload: Record<string, unknown>) {
  const event = createEvent(kind, "discord-bot", payload);
  const next = pushEvent(state, event);
  const summary = summarizeMemoryCandidate(event);
  return pushMemory(next, summary, [event.id]);
}

export async function handleDiscordInteraction(interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  const session = await loadInteractionSession(interaction);
  const sessionState = ensureExperienceState(session?.state ?? resetGame());
  if (sessionState.processedInteractionIds.includes(interaction.id)) {
    return ephemeralMessage("이미 처리된 요청입니다.");
  }

  if (interaction.type === 1) {
    return { type: 1 };
  }

  if (interaction.type === 2) {
    const commandName = interaction.data?.name ?? "";
    const author = getAuthor(interaction);
    if (commandName === "start-experience") {
      const { playerNames, flowId } = parseStartOptions(interaction);
      const starting = createExperience({
        participantNames: playerNames.length > 0 ? playerNames : [author.name],
        flowId
      });
      const createdEvent = createEvent("ExperienceCreated", "discord-bot", {
        guild_id: interaction.guild_id ?? null,
        channel_id: interaction.channel_id,
        flow_id: starting.flow.id,
        player_names: starting.experience.participants.map((player) => player.name)
      });
      const nextState = prepareSession(
        attachExperience(
          {
            ...appendEvents(resetGame(), [createdEvent]),
            players: starting.experience.participants,
            phase: "READY",
            statusMessage: "Experience를 생성했습니다.",
            experience: starting.experience,
            flows: listFlows()
          },
          starting.experience,
          starting.flow.id
        ),
        interaction
      );
      const response: DiscordInteractionResponse = {
        type: 4,
        data: {
          content: `Experience가 생성되었습니다.\n\n${renderExperienceScene(nextState)}`,
          components: [...buildFlowButtons(), ...buildSceneButtons(nextState)]
        }
      };
      const published = prepareSession(
        persistSceneResponse(nextState, interaction, response, [createdEvent.id]),
        interaction
      );
      await saveUpdatedSession(interaction, published, {
        experience: published.experience,
        events: published.events,
        scenes: published.scenes
      });
      return response;
    }
    if (commandName === "join") {
      const currentExperience =
        sessionState.experience ??
        createExperience({
          participantNames: sessionState.players.map((player) => player.name),
          flowId: "adventure"
        }).experience;
      const updatedExperience = addParticipant(currentExperience, author.name);
      const joinedEvent = createEvent("PlayerJoined", "discord-bot", {
        player_id: author.id,
        player_name: author.name,
        experience_id: updatedExperience.id
      });
      const nextState = prepareSession(
        {
          ...appendEvents(sessionState, [joinedEvent]),
          experience: updatedExperience,
          players: updatedExperience.participants,
          statusMessage: `${author.name} 님이 참가했습니다.`
        },
        interaction
      );
      await saveUpdatedSession(interaction, nextState);
      return ephemeralMessage(`${author.name} 님이 참가했습니다.`);
    }
    if (commandName === "leave") {
      const nextState = {
        ...appendEvents(sessionState, [
          createEvent("PlayerLeft", "discord-bot", {
            player_id: author.id,
            player_name: author.name,
            experience_id: sessionState.experience?.id ?? null
          })
        ]),
        players: sessionState.players.filter((player) => player.name !== author.name),
        statusMessage: `${author.name} 님이 이탈했습니다.`
      };
      const prepared = prepareSession(nextState, interaction);
      await saveUpdatedSession(interaction, prepared);
      return ephemeralMessage(`${author.name} 님이 이탈했습니다.`);
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
        const response = updateResponse(nextState);
        const published = prepareSession(
          persistSceneResponse(nextState, interaction, response, [flowSelectedEvent.id]),
          interaction
        );
        await saveUpdatedSession(interaction, published);
        return response;
      }
      const response: DiscordInteractionResponse = {
        type: 4,
        data: {
          content: "흐름을 선택하세요.",
          components: buildFlowButtons()
        }
      };
      const published = prepareSession(persistSceneResponse(sessionState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "begin") {
      const currentExperience =
        sessionState.experience ??
        createExperience({
          participantNames: sessionState.players.map((player) => player.name),
          flowId: "adventure"
        }).experience;
      const startedExperience = startExperience({
        ...currentExperience,
        status: "Playing"
      });
      const startedEvent = createEvent("ExperienceStarted", "discord-bot", {
        experience_id: startedExperience.id,
        flow_id: startedExperience.flowId
      });
      const started = prepareSession(
        {
          ...appendEvents(sessionState, [startedEvent]),
          experience: startedExperience,
          phase: "PLAYING",
          players: sessionState.players.length > 0 ? sessionState.players : startedExperience.participants,
          flows: listFlows(),
          statusMessage: "Experience를 시작했습니다."
        },
        interaction
      );
      const response = updateResponse(started);
      const published = prepareSession(
        persistSceneResponse(started, interaction, response, [startedEvent.id]),
        interaction
      );
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "continue") {
      const continued = prepareSession(applySceneContinue(sessionState), interaction);
      const response = updateResponse(continued);
      const published = prepareSession(persistSceneResponse(continued, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "status") {
      return ephemeralMessage(renderExperienceScene(sessionState));
    }
    if (commandName === "end") {
      const currentExperience =
        sessionState.experience ??
        createExperience({
          participantNames: sessionState.players.map((player) => player.name),
          flowId: "adventure"
        }).experience;
      const endedExperience = endExperience(currentExperience);
      const endedEvent = createEvent("ExperienceEnded", "discord-bot", {
        experience_id: endedExperience.id,
        flow_id: endedExperience.flowId
      });
      const ended = prepareSession(
        {
          ...appendEvents(sessionState, [endedEvent]),
          experience: endedExperience,
          phase: "ENDING",
          endingText: renderEndingNarrative(endedExperience, sessionState.storyMemories ?? []),
          statusMessage: "Experience를 종료했습니다."
        },
        interaction
      );
      const response = updateResponse(ended);
      const published = prepareSession(persistSceneResponse(ended, interaction, response, [endedEvent.id]), interaction);
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
      const response = panelResponse(prepared);
      const published = prepareSession(persistSceneResponse(prepared, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (commandName === "status") {
      return ephemeralMessage(buildLegacyStatusContent(prepared));
    }
    const response = updateResponse(prepared);
    const published = prepareSession(persistSceneResponse(prepared, interaction, response), interaction);
    await saveUpdatedSession(interaction, published);
    return response;
  }

  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id ?? "";
    const author = getAuthor(interaction);
    if (customId === "scene:record") {
      return sceneModal(interaction, "record");
    }
    if (customId === "scene:choose") {
      return sceneModal(interaction, "choose");
    }
    if (customId === "scene:upload-photo") {
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerUploadedPhoto", {
          player_id: author.id,
          player_name: author.name
        }),
        interaction
      );
      await saveUpdatedSession(interaction, nextState);
      return ephemeralMessage("사진은 스레드에 업로드해 주세요.");
    }
    if (customId === "scene:skip") {
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerSkipped", {
          player_id: author.id,
          player_name: author.name
        }),
        interaction
      );
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId === "scene:help") {
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerDifficultyReported", {
          player_id: author.id,
          player_name: author.name
        }),
        interaction
      );
      await saveUpdatedSession(interaction, nextState);
      return ephemeralMessage("잠시 쉬어도 괜찮습니다. 어려운 부분을 스레드나 DM으로 남겨주세요.");
    }
    if (customId === "scene:continue") {
      const nextState = prepareSession(applySceneContinue(sessionState), interaction);
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId.startsWith("flow:")) {
      const flowId = customId.slice("flow:".length);
      const nextState = prepareSession(handleFlowSelection(sessionState, flowId), interaction);
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId.startsWith("scene:record-modal")) {
      const values = getModalValues(interaction);
      const text = values.text ?? "";
      const reflection = values.reflection ?? "";
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerSubmittedText", {
          player_id: author.id,
          player_name: author.name,
          text,
          reflection
        }),
        interaction
      );
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId.startsWith("scene:choose-modal")) {
      const values = getModalValues(interaction);
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerSelectedChoice", {
          player_id: author.id,
          player_name: author.name,
          choice: values.choice ?? "",
          reflection: values.reflection ?? ""
        }),
        interaction
      );
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
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
    const response = updateResponse(prepared);
    const published = prepareSession(persistSceneResponse(prepared, interaction, response), interaction);
    await saveUpdatedSession(interaction, published);
    return response;
  }

  if (interaction.type === 5) {
    const values = getModalValues(interaction);
    const author = getAuthor(interaction);
    const customId = interaction.data?.custom_id ?? "";
    if (customId.startsWith("scene:record-modal")) {
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerSubmittedText", {
          player_id: author.id,
          player_name: author.name,
          text: values.text ?? "",
          reflection: values.reflection ?? ""
        }),
        interaction
      );
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
      return response;
    }
    if (customId.startsWith("scene:choose-modal")) {
      const nextState = prepareSession(
        recordSceneScene(sessionState, interaction, "PlayerSelectedChoice", {
          player_id: author.id,
          player_name: author.name,
          choice: values.choice ?? "",
          reflection: values.reflection ?? ""
        }),
        interaction
      );
      const response = updateResponse(nextState);
      const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
      await saveUpdatedSession(interaction, published);
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
    const response = updateResponse(nextState);
    const published = prepareSession(persistSceneResponse(nextState, interaction, response), interaction);
    await saveUpdatedSession(interaction, published);
    return response;
  }

  return ephemeralMessage("지원하지 않는 interaction 입니다.");
}

export async function handleDiscordObservation(
  sessionKey: string,
  observation: {
    type: "thread" | "dm" | "reaction" | "voice" | "text";
    sourceId: string;
    sceneId?: string | null;
    payload: Record<string, unknown>;
  }
) {
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
      storyMemories: [...(state.storyMemories ?? []), {
        id: `memory-${(state.storyMemories?.length ?? 0) + 1}`,
        sourceEventIds: [event.id],
        sourceSceneId: observation.sceneId ?? state.currentSceneId ?? null,
        summary: summarizeMemoryCandidate(event),
        tags: ["callback"],
        callbackWeight: 1
      }]
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

function ed25519PublicKeyFromHex(hexKey: string) {
  const raw = Buffer.from(hexKey, "hex");
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return crypto.createPublicKey({
    key: Buffer.concat([prefix, raw]),
    format: "der",
    type: "spki"
  });
}

export function verifyDiscordSignature(body: string, timestamp: string, signature: string, publicKeyHex: string) {
  const publicKey = ed25519PublicKeyFromHex(publicKeyHex);
  return crypto.verify(
    null,
    Buffer.from(`${timestamp}${body}`),
    publicKey,
    Buffer.from(signature, "hex")
  );
}
