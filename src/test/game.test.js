import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canGenerateEnding, completeMission, generateEnding, initialGameState, startGame } from "../lib/game.js";
import { listFlows } from "../lib/experience.js";

describe("discord reality mission engine", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeUser(id, username) {
    return {
      id,
      username
    };
  }

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

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

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

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

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

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

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
    expect(session?.state.ui?.screen).toBe("playing");
    expect(session?.state.storyMemories?.at(-1)?.summary).toContain("오늘의 첫 기록");
  });

  it("tracks documented flows and persists public scenes", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    expect(listFlows().map((flow) => flow.id)).toEqual(["adventure", "bond", "mystery", "chaos-trip", "random"]);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

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

  it("opens the main menu on /begin and keeps it as a single edited message", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    const response = await handleDiscordInteraction({
      id: "interaction-begin-1",
      type: 2,
      token: "token",
      guild_id: "guild-lobby",
      channel_id: "channel-lobby",
      data: {
        name: "begin"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("🎮 Reality Mission Engine");
    expect(response.data?.content).toContain("오늘의 Experience를 시작합니다.");
    expect(response.data?.components?.[0]?.components?.map((button) => button.custom_id)).toEqual([
      "menu:new-game",
      "menu:join-game",
      "menu:resume"
    ]);

    const session = await loadSession("guild-lobby:channel-lobby");
    expect(session?.state.ui?.screen).toBe("main-menu");
  });

  it("creates an experience lobby, allows joining, and transitions into play", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await handleDiscordInteraction({
      id: "interaction-begin-2",
      type: 2,
      token: "token",
      guild_id: "guild-lobby",
      channel_id: "channel-lobby",
      data: {
        name: "begin"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    const lobbyResponse = await handleDiscordInteraction({
      id: "interaction-mode-1",
      type: 3,
      token: "token",
      guild_id: "guild-lobby",
      channel_id: "channel-lobby",
      data: {
        custom_id: "menu:new-game"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    expect(lobbyResponse.type).toBe(7);
    expect(lobbyResponse.data?.content).toContain("Experience");
    expect(lobbyResponse.data?.content).toContain("아직 시작되지 않았습니다.");
    expect(lobbyResponse.data?.content).toContain("1 / 4");
    expect(lobbyResponse.data?.components?.[0]?.components?.map((button) => button.custom_id)).toEqual([
      "lobby:join",
      "lobby:ready"
    ]);

    const joinedResponse = await handleDiscordInteraction({
      id: "interaction-lobby-join-1",
      type: 3,
      token: "token",
      guild_id: "guild-lobby",
      channel_id: "channel-lobby",
      data: {
        custom_id: "lobby:join"
      },
      member: {
        user: makeUser("user-guest", "게스트")
      }
    });

    expect(joinedResponse.type).toBe(7);
    expect(joinedResponse.data?.content).toContain("2 / 4");
    expect(joinedResponse.data?.content).toContain("✅ 게스트");

    const startResponse = await handleDiscordInteraction({
      id: "interaction-lobby-start-1",
      type: 3,
      token: "token",
      guild_id: "guild-lobby",
      channel_id: "channel-lobby",
      data: {
        custom_id: "lobby:ready"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    expect(startResponse.type).toBe(7);
    expect(startResponse.data?.content).toContain("Experience를 준비하고 있습니다...");
    expect(startResponse.data?.content).toContain("🎬 오늘의 장면");
    expect(startResponse.data?.content).not.toContain("Adventure");
    expect(startResponse.data?.components?.[0]?.components?.map((button) => button.custom_id)).toEqual([
      "scene:record",
      "scene:upload-photo"
    ]);

    const session = await loadSession("guild-lobby:channel-lobby");
    expect(session?.state.phase).toBe("PLAYING");
    expect(session?.state.ui?.screen).toBe("playing");
    expect(session?.state.experience?.status).toBe("Playing");
    expect(session?.state.currentSceneId).toBeTruthy();
    expect(session?.state.scenes?.at(-1)?.content).toContain("Experience를 준비하고 있습니다...");
  });

  it("automatically advances to the next scene when all mission inputs are submitted", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await handleDiscordInteraction({
      id: "interaction-begin-3",
      type: 2,
      token: "token",
      guild_id: "guild-auto",
      channel_id: "channel-auto",
      data: {
        name: "begin"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    await handleDiscordInteraction({
      id: "interaction-auto-new",
      type: 3,
      token: "token",
      guild_id: "guild-auto",
      channel_id: "channel-auto",
      data: {
        custom_id: "menu:new-game"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    await handleDiscordInteraction({
      id: "interaction-auto-join",
      type: 3,
      token: "token",
      guild_id: "guild-auto",
      channel_id: "channel-auto",
      data: {
        custom_id: "lobby:ready"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    const textResponse = await handleDiscordInteraction({
      id: "interaction-auto-text",
      type: 5,
      token: "token",
      guild_id: "guild-auto",
      channel_id: "channel-auto",
      data: {
        custom_id: "scene:record-modal:channel-auto",
        components: [
          {
            components: [{ custom_id: "text", value: "오늘 분위기를 짧게 적습니다." }]
          },
          {
            components: [{ custom_id: "reflection", value: "첫 입력" }]
          }
        ]
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    expect(textResponse.type).toBe(7);

    const photoResponse = await handleDiscordInteraction({
      id: "interaction-auto-photo",
      type: 3,
      token: "token",
      guild_id: "guild-auto",
      channel_id: "channel-auto",
      data: {
        custom_id: "scene:upload-photo"
      },
      member: {
        user: makeUser("user-host", "호스트")
      }
    });

    expect(photoResponse.type).toBe(4);
    expect(photoResponse.data?.content).toContain("🎬 오늘의 장면");

    const session = await loadSession("guild-auto:channel-auto");
    expect(session?.state.scenes?.length).toBeGreaterThanOrEqual(2);
    expect(session?.state.currentSceneId).toBe(session?.state.scenes?.at(-1)?.id);
    expect(session?.state.ui?.sceneInput).toBeFalsy();
  });
});
