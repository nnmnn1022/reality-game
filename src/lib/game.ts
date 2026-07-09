import missions from "../../data/missions.json";
import type {
  CompleteMissionInput,
  Foreshadow,
  GamePhase,
  GameSession,
  GameState,
  Mission,
  StartGameInput
} from "@/types/game";

export const DEFAULT_ENVIRONMENT_TAGS = ["walkable", "group-friendly", "indoor", "rest"];

export const initialGameState: GameState = {
  phase: "IDLE",
  players: [],
  environmentTags: [],
  completedMissionIds: [],
  foreshadows: [],
  fatigue: 0,
  mood: "calm",
  currentMissionId: null,
  endingText: "",
  statusMessage: "게임을 시작해 주세요.",
  processedInteractionIds: []
};

const missionPool = missions as Mission[];

export function createSessionKey(guildId: string | null, channelId: string) {
  return `${guildId ?? "dm"}:${channelId}`;
}

export function createPlayers(playerNames: string[]) {
  return playerNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({ id: `player-${index + 1}`, name }));
}

export function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

export function getMissionById(missionId: string | null) {
  return missionPool.find((mission) => mission.id === missionId) ?? null;
}

export function getAvailableMissions(state: GameState, phase: Mission["phase"] = "any") {
  return missionPool.filter((mission) => {
    if (mission.safetyFlags.some((flag) => ["unsafe", "illegal", "nuisance", "embarrassing"].includes(flag))) {
      return false;
    }
    if (state.completedMissionIds.includes(mission.id)) {
      return false;
    }
    if (phase !== "any" && mission.phase !== "any" && mission.phase !== phase) {
      return false;
    }
    if (!mission.requiredTags.every((tag) => state.environmentTags.includes(tag))) {
      return false;
    }
    if (mission.blockedTags.some((tag) => state.environmentTags.includes(tag))) {
      return false;
    }
    return true;
  });
}

export function selectMission(state: GameState, phase: Mission["phase"] = "any") {
  const available = getAvailableMissions(state, phase);
  return available.sort((left, right) => {
    const scoreLeft = left.category === "rest" ? 0 : left.foreshadowTags.length + left.durationMinutes;
    const scoreRight = right.category === "rest" ? 0 : right.foreshadowTags.length + right.durationMinutes;
    return scoreRight - scoreLeft;
  })[0] ?? null;
}

function getEmergencyMission() {
  return missionPool.find((mission) => mission.category === "emergency") ?? null;
}

function withUpdate(state: GameState, patch: Partial<GameState>): GameState {
  return {
    ...state,
    ...patch
  };
}

function markInteraction(state: GameState, interactionId?: string) {
  if (!interactionId) {
    return state;
  }
  if (state.processedInteractionIds.includes(interactionId)) {
    return state;
  }
  return withUpdate(state, {
    processedInteractionIds: [...state.processedInteractionIds, interactionId]
  });
}

export function startGame(input: StartGameInput): GameState {
  const players = createPlayers(input.playerNames);
  const environmentTags = normalizeTags(input.environmentTags);
  const readyState = withUpdate(initialGameState, {
    phase: "READY",
    players: players.length > 0 ? players : [{ id: "player-1", name: "플레이어 1" }],
    environmentTags: environmentTags.length > 0 ? environmentTags : DEFAULT_ENVIRONMENT_TAGS,
    statusMessage: "세션을 시작했습니다."
  });
  const firstMission = selectMission(readyState, "early");
  if (firstMission) {
    return withUpdate(readyState, {
      phase: "PLAYING",
      currentMissionId: firstMission.id,
      statusMessage: `미션 선택: ${firstMission.title}`
    });
  }
  const fallback = getEmergencyMission();
  if (fallback) {
    return withUpdate(readyState, {
      phase: "PLAYING",
      currentMissionId: fallback.id,
      statusMessage: `범용 미션 선택: ${fallback.title}`
    });
  }
  return withUpdate(readyState, {
    phase: "EMERGENCY_MISSION",
    statusMessage: "적합한 미션이 없어 범용 미션도 찾지 못했습니다."
  });
}

export function completeMission(state: GameState, input: CompleteMissionInput): GameState {
  if (state.phase !== "PLAYING" && state.phase !== "EMERGENCY_MISSION") {
    return state;
  }
  const currentMission = getMissionById(state.currentMissionId);
  if (!currentMission) {
    return withUpdate(state, {
      statusMessage: "현재 미션이 없어 완료 처리할 수 없습니다."
    });
  }

  const foreshadows: Foreshadow[] = input.foreshadowText.trim()
    ? [
        ...state.foreshadows,
        {
          id: `foreshadow-${state.foreshadows.length + 1}`,
          missionId: currentMission.id,
          text: input.foreshadowText.trim(),
          mood: input.mood.trim() || state.mood,
          tags: currentMission.foreshadowTags,
          createdAt: new Date().toISOString(),
          authorId: input.authorId,
          authorName: input.authorName
        }
      ]
    : state.foreshadows;

  const nextState = withUpdate(state, {
    phase: "MISSION_COMPLETE",
    completedMissionIds: state.completedMissionIds.includes(currentMission.id)
      ? state.completedMissionIds
      : [...state.completedMissionIds, currentMission.id],
    foreshadows,
    fatigue: Math.min(5, state.fatigue + 1),
    mood: input.mood.trim() || state.mood,
    statusMessage: `${currentMission.title} 완료`
  });
  return markInteraction(nextState, input.interactionId);
}

export function goCheckpoint(state: GameState): GameState {
  if (state.phase !== "MISSION_COMPLETE") {
    return state;
  }
  return withUpdate(state, {
    phase: "CHECKPOINT",
    statusMessage: "다음 미션을 선택할 수 있습니다."
  });
}

export function selectNextMission(state: GameState, phase: Mission["phase"] = "middle") {
  if (state.phase !== "CHECKPOINT") {
    return state;
  }
  const nextMission = selectMission(state, phase);
  if (!nextMission) {
    const fallback = getEmergencyMission();
    if (!fallback) {
      return withUpdate(state, {
        phase: "EMERGENCY_MISSION",
        statusMessage: "적합한 미션이 없어 범용 미션을 찾지 못했습니다."
      });
    }
    return withUpdate(state, {
      phase: "PLAYING",
      currentMissionId: fallback.id,
      statusMessage: `범용 미션 선택: ${fallback.title}`
    });
  }
  return withUpdate(state, {
    phase: "PLAYING",
    currentMissionId: nextMission.id,
    statusMessage: `다음 미션 대기: ${nextMission.title}`
  });
}

export function useEmergencyMission(state: GameState) {
  const fallback = getEmergencyMission();
  if (!fallback) {
    return withUpdate(state, {
      phase: "CHECKPOINT",
      statusMessage: "범용 미션이 없어 체크포인트에 머뭅니다."
    });
  }
  return withUpdate(state, {
    phase: "PLAYING",
    currentMissionId: fallback.id,
    statusMessage: `범용 미션 선택: ${fallback.title}`
  });
}

export function canGenerateEnding(state: GameState) {
  return state.completedMissionIds.length > 0 || state.foreshadows.length > 0;
}

export function generateEnding(state: GameState): GameState {
  if (!canGenerateEnding(state)) {
    return withUpdate(state, {
      statusMessage: "엔딩을 만들 기록이 아직 부족합니다."
    });
  }
  const foreshadowLines = state.foreshadows.map((item) => item.text).filter(Boolean);
  const missionLines = state.completedMissionIds
    .map((missionId) => getMissionById(missionId)?.title)
    .filter(Boolean);
  const baseText = [
    "오늘의 이야기는 끝까지 웃고, 쉬고, 고른 것들의 기록이다.",
    missionLines.length > 0 ? `지나온 미션: ${missionLines.join(", ")}` : "지나온 미션은 아직 적지만 시작은 충분했다.",
    foreshadowLines.length > 0 ? `남은 복선: ${foreshadowLines.join(" / ")}` : "복선은 다음 회차에서 더 쌓을 수 있다."
  ].join("\n");

  return withUpdate(state, {
    phase: "ENDING",
    endingText: baseText,
    statusMessage: "엔딩을 생성했습니다."
  });
}

export function finishGame(state: GameState): GameState {
  if (state.phase !== "ENDING") {
    return state;
  }
  return withUpdate(state, {
    phase: "FINISHED",
    statusMessage: "게임이 종료되었습니다."
  });
}

export function resetGame(): GameState {
  return structuredClone(initialGameState);
}

export function serializeGameState(state: GameState) {
  return JSON.stringify(state);
}

export function deserializeGameState(raw: string | null): GameState {
  if (!raw) {
    return resetGame();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (!parsed || typeof parsed !== "object") {
      return resetGame();
    }
    return {
      ...resetGame(),
      ...parsed,
      environmentTags: Array.isArray(parsed.environmentTags) ? parsed.environmentTags : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
      completedMissionIds: Array.isArray(parsed.completedMissionIds) ? parsed.completedMissionIds : [],
      foreshadows: Array.isArray(parsed.foreshadows) ? parsed.foreshadows : [],
      processedInteractionIds: Array.isArray(parsed.processedInteractionIds) ? parsed.processedInteractionIds : []
    };
  } catch {
    return resetGame();
  }
}

export function phaseLabel(phase: GamePhase) {
  switch (phase) {
    case "IDLE":
      return "대기";
    case "READY":
      return "준비";
    case "PLAYING":
      return "진행";
    case "CHECKPOINT":
      return "체크포인트";
    case "MISSION_COMPLETE":
      return "완료";
    case "EMERGENCY_MISSION":
      return "범용 미션";
    case "ENDING":
      return "엔딩";
    case "FINISHED":
      return "종료";
  }
}

export function buildSessionRecord(guildId: string | null, channelId: string, state: GameState): GameSession {
  return {
    sessionKey: createSessionKey(guildId, channelId),
    guildId,
    channelId,
    state,
    updatedAt: new Date().toISOString()
  };
}
