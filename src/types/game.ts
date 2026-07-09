export type ExperienceStatus = "Created" | "Configured" | "Ready" | "Playing" | "Resolving" | "Ended";

export type GamePhase =
  | "IDLE"
  | "READY"
  | "PLAYING"
  | "CHECKPOINT"
  | "MISSION_COMPLETE"
  | "EMERGENCY_MISSION"
  | "ENDING"
  | "FINISHED";

export type MissionCategory = "variety" | "emotional" | "rest" | "emergency";

export type FlowTarget = "Exploration" | "Discovery" | "Challenge" | "Reflection" | "Bond" | "Mystery" | "Chaos" | "Random";

export interface Player {
  id: string;
  name: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  requiredTags: string[];
  optionalTags: string[];
  blockedTags: string[];
  durationMinutes: number;
  budgetPerPerson: number;
  phase: "early" | "middle" | "late" | "any";
  category: MissionCategory;
  foreshadowTags: string[];
  safetyFlags: string[];
  interactionPattern?: "Move" | "Observe" | "Choose" | "Talk" | "Capture" | "Create" | "Collaborate" | "Wait";
  constraint?: string;
  inputType?: "Text" | "Photo" | "Voice" | "Choice" | "Feedback" | "Secret";
  promptHint?: string;
}

export interface Flow {
  id: string;
  name: string;
  target: FlowTarget;
  coverageDefinition: string[];
  stageGraph: string[];
}

export interface Stage {
  id: string;
  flowId: string;
  name: string;
  purpose: string;
  allowedNextStageIds: string[];
}

export interface StoryBeatMission {
  interaction_pattern: string;
  constraint: string;
  input_type: string;
  prompt_hint: string;
}

export interface PlayRule {
  visibility: string;
  participation: string;
  response_policy: string;
  timeout: string;
  completion_condition: string;
}

export interface StoryBeat {
  id: string;
  stageId: string;
  lifecycle: "Prepared" | "Active" | "Resolved";
  mission: StoryBeatMission;
  playRule: PlayRule;
  trigger: string;
  result: string;
}

export interface Input {
  id: string;
  experienceId: string;
  storyBeatId: string | null;
  playerId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Event {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Result {
  id: string;
  storyBeatId: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface StoryMemory {
  id: string;
  sourceEventIds: string[];
  sourceSceneId: string | null;
  summary: string;
  tags: string[];
  callbackWeight: number;
}

export interface ExperienceCoverage {
  achieved: string[];
  pending: string[];
}

export interface Experience {
  id: string;
  status: ExperienceStatus;
  flowId: string | null;
  participants: Player[];
  currentStageId: string | null;
  currentStoryBeatId: string | null;
  coverage: ExperienceCoverage;
  createdAt: string;
  endedAt: string | null;
}

export interface Foreshadow {
  id: string;
  missionId: string;
  text: string;
  mood: string;
  tags: string[];
  createdAt: string;
  authorId?: string;
  authorName?: string;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  environmentTags: string[];
  completedMissionIds: string[];
  foreshadows: Foreshadow[];
  fatigue: number;
  mood: string;
  currentMissionId: string | null;
  endingText: string;
  statusMessage: string;
  processedInteractionIds: string[];
  experience?: Experience;
  flows?: Flow[];
  stages?: Stage[];
  storyBeats?: StoryBeat[];
  events?: Event[];
  inputs?: Input[];
  results?: Result[];
  storyMemories?: StoryMemory[];
  currentSceneId?: string | null;
  scenes?: SceneRecord[];
}

export interface GameSession {
  sessionKey: string;
  guildId: string | null;
  channelId: string;
  state: GameState;
  updatedAt: string;
  events?: Event[];
  experience?: Experience;
  scenes?: SceneRecord[];
}

export interface SceneRecord {
  id: string;
  experienceId: string;
  title: string;
  content: string;
  createdAt: string;
  threadId: string | null;
  sourceEventIds: string[];
}

export interface StartGameInput {
  playerNames: string[];
  environmentTags: string[];
  interactionId?: string;
}

export interface CompleteMissionInput {
  foreshadowText: string;
  mood: string;
  interactionId?: string;
  authorId?: string;
  authorName?: string;
}

export interface SessionContext {
  guildId: string | null;
  channelId: string;
  interactionId: string;
  authorId?: string;
  authorName?: string;
}
