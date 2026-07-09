import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canGenerateEnding,
  completeMission,
  generateEnding,
  initialGameState,
  startGame
} from "@/lib/game";
import { listFlows } from "@/lib/experience";

describe("discord reality mission engine", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts with an idle state and can open a playable session", () => {
    expect(initialGameState.phase).toBe("IDLE");
    const state = startGame({
      playerNames: ["민지", "지훈"],
      environmentTags: ["walkable", "group-friendly", "indoor", "rest"]
    });
    expect(state.phase).toBe("PLAYING");
    expect(state.currentMissionId).toBeTruthy();
  });

  it("records foreshadow and builds ending", () => {
    const started = startGame({
      playerNames: ["민지"],
      environmentTags: ["walkable", "group-friendly", "indoor", "rest"]
    });
    const completed = completeMission(started, {
      foreshadowText: "색이 다시 나타난다",
      mood: "curious",
      interactionId: "interaction-1"
    });
    expect(completed.completedMissionIds.length).toBeGreaterThan(0);
    expect(canGenerateEnding(completed)).toBe(true);
    const ending = generateEnding(completed);
    expect(ending.endingText).toContain("색이 다시 나타난다");
  });

  it("handles a discord start interaction and persists the session", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);
    vi.stubEnv("DISCORD_SKIP_SIGNATURE_CHECK", "true");

    const { handleDiscordInteraction } = await import("@/lib/discord-interactions");
    const { loadSession } = await import("@/lib/session-store");

    const response = await handleDiscordInteraction({
      id: "interaction-start-1",
      type: 2,
      token: "token",
      guild_id: "guild-1",
      channel_id: "channel-1",
      data: {
        name: "start",
        options: [
          { name: "players", value: "민지, 지훈" },
          { name: "tags", value: "walkable,group-friendly,indoor,rest" }
        ]
      },
      member: {
        user: {
          id: "user-1",
          username: "민지"
        }
      }
    });

    expect(response.type).toBe(4);
    const session = await loadSession("guild-1:channel-1");
    expect(session?.state.phase).toBe("PLAYING");
    expect(session?.state.currentMissionId).toBeTruthy();
  });

  it("handles modal completion through the discord interaction handler", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);
    vi.stubEnv("DISCORD_SKIP_SIGNATURE_CHECK", "true");

    const { handleDiscordInteraction } = await import("@/lib/discord-interactions");
    const { loadSession } = await import("@/lib/session-store");

    await handleDiscordInteraction({
      id: "interaction-start-2",
      type: 2,
      token: "token",
      guild_id: "guild-1",
      channel_id: "channel-1",
      data: {
        name: "start",
        options: [
          { name: "players", value: "민지" },
          { name: "tags", value: "walkable,group-friendly,indoor,rest" }
        ]
      },
      member: {
        user: {
          id: "user-1",
          username: "민지"
        }
      }
    });

    const modalResponse = await handleDiscordInteraction({
      id: "interaction-modal-1",
      type: 5,
      token: "token",
      guild_id: "guild-1",
      channel_id: "channel-1",
      data: {
        components: [
          {
            components: [{ custom_id: "foreshadowText", value: "오늘의 색은 다시 등장한다" }]
          },
          {
            components: [{ custom_id: "mood", value: "curious" }]
          }
        ]
      },
      member: {
        user: {
          id: "user-1",
          username: "민지"
        }
      }
    });

    expect(modalResponse.type).toBe(7);
    const session = await loadSession("guild-1:channel-1");
    expect(session?.state.completedMissionIds.length).toBeGreaterThan(0);
    expect(session?.state.foreshadows.at(-1)?.text).toBe("오늘의 색은 다시 등장한다");
  });

  it("supports the new experience start and scene record flow", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);
    vi.stubEnv("DISCORD_SKIP_SIGNATURE_CHECK", "true");

    const { handleDiscordInteraction } = await import("@/lib/discord-interactions");
    const { loadSession } = await import("@/lib/session-store");

    const startResponse = await handleDiscordInteraction({
      id: "interaction-new-start",
      type: 2,
      token: "token",
      guild_id: "guild-2",
      channel_id: "channel-2",
      data: {
        name: "start-experience",
        options: [
          { name: "players", value: "민지, 지훈" },
          { name: "flow", value: "adventure" }
        ]
      },
      member: {
        user: {
          id: "user-2",
          username: "민지"
        }
      }
    });

    expect(startResponse.type).toBe(4);

    const beginResponse = await handleDiscordInteraction({
      id: "interaction-new-begin",
      type: 2,
      token: "token",
      guild_id: "guild-2",
      channel_id: "channel-2",
      data: {
        name: "begin"
      },
      member: {
        user: {
          id: "user-2",
          username: "민지"
        }
      }
    });

    expect(beginResponse.type).toBe(7);

    const modalResponse = await handleDiscordInteraction({
      id: "interaction-new-record",
      type: 5,
      token: "token",
      guild_id: "guild-2",
      channel_id: "channel-2",
      data: {
        custom_id: "scene:record-modal:channel-2",
        components: [
          {
            components: [{ custom_id: "text", value: "오늘의 첫 기록" }]
          },
          {
            components: [{ custom_id: "reflection", value: "장면이 시작됐다" }]
          }
        ]
      },
      member: {
        user: {
          id: "user-2",
          username: "민지"
        }
      }
    });

    expect(modalResponse.type).toBe(7);
    const session = await loadSession("guild-2:channel-2");
    expect(session?.state.experience?.status).toBe("Playing");
    expect(session?.state.storyMemories?.at(-1)?.summary).toContain("오늘의 첫 기록");
  });

  it("tracks documented flows and persists public scenes", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);
    vi.stubEnv("DISCORD_SKIP_SIGNATURE_CHECK", "true");

    expect(listFlows().map((flow) => flow.id)).toEqual(["adventure", "bond", "mystery", "chaos-trip", "random"]);

    const { handleDiscordInteraction } = await import("@/lib/discord-interactions");
    const { loadSession } = await import("@/lib/session-store");

    await handleDiscordInteraction({
      id: "interaction-start-3",
      type: 2,
      token: "token",
      guild_id: "guild-3",
      channel_id: "channel-3",
      data: {
        name: "start-experience",
        options: [
          { name: "players", value: "민지, 지훈" },
          { name: "flow", value: "random" }
        ]
      },
      member: {
        user: {
          id: "user-3",
          username: "민지"
        }
      }
    });

    const session = await loadSession("guild-3:channel-3");
    expect(session?.state.events?.some((event) => event.type === "ExperienceCreated")).toBe(true);
    expect(session?.state.events?.some((event) => event.type === "SceneRendered")).toBe(true);
    expect(session?.state.events?.some((event) => event.type === "SceneDelivered")).toBe(true);
    expect(session?.state.scenes?.at(-1)?.content).toContain("Experience가 생성되었습니다.");
    expect(session?.state.currentSceneId).toBe(session?.state.scenes?.at(-1)?.id);
  });
});
