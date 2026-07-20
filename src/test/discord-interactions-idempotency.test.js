import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeUser(id, username) {
  return {
    id,
    username
  };
}

function beginInteraction(id, channelId = "channel-idempotency") {
  return {
    id,
    type: 2,
    token: "token",
    guild_id: "guild-idempotency",
    channel_id: channelId,
    data: {
      name: "begin"
    },
    member: {
      user: makeUser("user-host", "호스트")
    }
  };
}

function buttonInteraction(id, customId, user = makeUser("user-host", "호스트"), channelId = "channel-idempotency") {
  return {
    id,
    type: 3,
    token: "token",
    guild_id: "guild-idempotency",
    channel_id: channelId,
    data: {
      custom_id: customId
    },
    member: {
      user
    }
  };
}

function durationModalInteraction(id, minutes, user = makeUser("user-host", "호스트"), channelId = "channel-idempotency") {
  return {
    id,
    type: 5,
    token: "token",
    guild_id: "guild-idempotency",
    channel_id: channelId,
    data: {
      custom_id: `lobby:duration-modal:${channelId}`,
      components: [
        {
          components: [{ custom_id: "durationMinutes", value: String(minutes) }]
        }
      ]
    },
    member: {
      user
    }
  };
}

async function startLobby(handleDiscordInteraction, channelId = "channel-idempotency") {
  await handleDiscordInteraction(beginInteraction(`begin-${channelId}`, channelId));
  return await handleDiscordInteraction(buttonInteraction(`new-game-${channelId}`, "menu:new-game", makeUser("user-host", "호스트"), channelId));
}

describe("discord interaction idempotency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stores a selected lobby duration and keeps the host in the lobby", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction);
    const response = await handleDiscordInteraction(buttonInteraction("duration-60", "lobby:duration:60"));

    expect(response.type).toBe(7);
    expect(response.data?.content).toContain("진행 시간: 60분");
    expect(response.data?.content).not.toContain("이미 처리된 요청입니다");

    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.ui?.screen).toBe("lobby");
    expect(session?.state.ui?.lobby?.hostId).toBe("user-host");
    expect(session?.state.ui?.lobby?.plannedDurationMinutes).toBe(60);
    expect(session?.state.experience?.plannedDurationMinutes).toBe(60);
    expect(session?.state.players).toEqual([{ id: "user-host", name: "호스트" }]);
  });

  it("supports every fixed and custom lobby duration option", async () => {
    for (const minutes of [30, 60, 120]) {
      const channelId = `channel-duration-${minutes}`;
      const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), `discord-sessions-${minutes}.json`);
      vi.resetModules();
      vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

      const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
      const { loadSession } = await import("../lib/session-store.js");

      await startLobby(handleDiscordInteraction, channelId);
      const response = await handleDiscordInteraction(buttonInteraction(`duration-${minutes}`, `lobby:duration:${minutes}`, makeUser("user-host", "호스트"), channelId));

      expect(response.type).toBe(7);
      expect(response.data?.content).toContain(`진행 시간: ${minutes}분`);
      const session = await loadSession(`guild-idempotency:${channelId}`);
      expect(session?.state.experience?.plannedDurationMinutes).toBe(minutes);
      vi.unstubAllEnvs();
    }

    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions-custom.json");
    vi.resetModules();
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);
    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction, "channel-duration-custom");
    const response = await handleDiscordInteraction(durationModalInteraction("duration-custom-submit", 45, makeUser("user-host", "호스트"), "channel-duration-custom"));

    expect(response.type).toBe(7);
    expect(response.data?.content).toContain("진행 시간: 45분");
    const session = await loadSession("guild-idempotency:channel-duration-custom");
    expect(session?.state.experience?.plannedDurationMinutes).toBe(45);
  });

  it("restores the lobby for a repeated duration interaction without duplicating state", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction);
    const first = await handleDiscordInteraction(buttonInteraction("duration-retry", "lobby:duration:60"));
    const second = await handleDiscordInteraction(buttonInteraction("duration-retry", "lobby:duration:60"));

    expect(first.type).toBe(7);
    expect(second.type).toBe(7);
    expect(second.data?.content).toContain("진행 시간: 60분");
    expect(second.data?.content).not.toContain("이미 처리된 요청입니다");

    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.experience?.plannedDurationMinutes).toBe(60);
    expect(session?.state.events ?? []).toHaveLength(0);
    expect(session?.state.processedInteractionIds.filter((id) => id === "duration-retry")).toHaveLength(1);
  });

  it("keeps the first accepted duration for rapid repeated clicks", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction);
    const [first, second] = await Promise.all([
      handleDiscordInteraction(buttonInteraction("duration-click-1", "lobby:duration:60")),
      handleDiscordInteraction(buttonInteraction("duration-click-2", "lobby:duration:60"))
    ]);

    expect(first.type).toBe(7);
    expect(second.type).toBe(7);
    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.experience?.plannedDurationMinutes).toBe(60);
    expect(session?.state.players).toHaveLength(1);
  });

  it("keeps the first accepted duration when different duration buttons arrive quickly", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction);
    await Promise.all([
      handleDiscordInteraction(buttonInteraction("duration-choice-1", "lobby:duration:60")),
      handleDiscordInteraction(buttonInteraction("duration-choice-2", "lobby:duration:120"))
    ]);

    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.experience?.plannedDurationMinutes).toBe(60);
    expect(session?.state.ui?.lobby?.plannedDurationMinutes).toBe(60);
  });

  it("does not mark a duration interaction as processed when saving fails", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    let modules = await import("../lib/discord-interactions.js");
    let store = await import("../lib/session-store.js");
    await startLobby(modules.handleDiscordInteraction);

    const sessionBefore = await store.loadSession("guild-idempotency:channel-idempotency");
    expect(sessionBefore?.state.ui?.lobby?.plannedDurationMinutes).toBeNull();

    vi.resetModules();
    vi.doMock("../lib/session-store.js", async () => {
      const actual = await vi.importActual("../lib/session-store.js");
      return {
        ...actual,
        saveSession: vi.fn(async () => {
          throw new Error("save failed");
        })
      };
    });

    modules = await import("../lib/discord-interactions.js");

    await expect(modules.handleDiscordInteraction(buttonInteraction("duration-save-fails", "lobby:duration:60"))).rejects.toThrow("save failed");

    vi.doUnmock("../lib/session-store.js");
    vi.resetModules();
    store = await import("../lib/session-store.js");
    const sessionAfter = await store.loadSession("guild-idempotency:channel-idempotency");

    expect(sessionAfter?.state.ui?.lobby?.plannedDurationMinutes).toBeNull();
    expect(sessionAfter?.state.processedInteractionIds).not.toContain("duration-save-fails");
  });

  it("rejects non-host duration selection without creating an experience update", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction);
    const response = await handleDiscordInteraction(buttonInteraction("duration-non-host", "lobby:duration:60", makeUser("user-guest", "게스트")));

    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("호스트만 진행 시간을 설정할 수 있습니다.");

    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.ui?.lobby?.plannedDurationMinutes).toBeNull();
    expect(session?.state.experience?.plannedDurationMinutes).toBeNull();
  });

  it("restores selected duration after module reload", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    let { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    await startLobby(handleDiscordInteraction);
    await handleDiscordInteraction(buttonInteraction("duration-before-restart", "lobby:duration:60"));

    vi.resetModules();
    ({ handleDiscordInteraction } = await import("../lib/discord-interactions.js"));
    const response = await handleDiscordInteraction(buttonInteraction("resume-after-restart", "menu:resume"));

    expect(response.type).toBe(7);
    expect(response.data?.content).toContain("진행 시간: 60분");

    const { loadSession } = await import("../lib/session-store.js");
    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.ui?.screen).toBe("lobby");
    expect(session?.state.experience?.plannedDurationMinutes).toBe(60);
  });

  it("serializes host duration selection with a concurrent guest join", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");
    const { loadSession } = await import("../lib/session-store.js");

    await startLobby(handleDiscordInteraction);
    await Promise.all([
      handleDiscordInteraction(buttonInteraction("duration-with-join", "lobby:duration:60")),
      handleDiscordInteraction(buttonInteraction("guest-join", "lobby:join", makeUser("user-guest", "게스트")))
    ]);

    const session = await loadSession("guild-idempotency:channel-idempotency");
    expect(session?.state.experience?.plannedDurationMinutes).toBe(60);
    expect(session?.state.players).toEqual([
      { id: "user-host", name: "호스트" },
      { id: "user-guest", name: "게스트" }
    ]);
  });

  it("logs a single selected handler for a duration interaction", async () => {
    const storagePath = join(mkdtempSync(join(tmpdir(), "reality-game-")), "discord-sessions.json");
    vi.stubEnv("DISCORD_STORAGE_PATH", storagePath);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { handleDiscordInteraction } = await import("../lib/discord-interactions.js");

    await startLobby(handleDiscordInteraction);
    await handleDiscordInteraction(buttonInteraction("duration-logged", "lobby:duration:60"));

    const durationLogs = info.mock.calls
      .map(([message, details]) => ({ message, details }))
      .filter(({ details }) => details?.interactionId === "duration-logged" && details?.handler === "component:lobby-duration");

    expect(durationLogs).toHaveLength(1);
    expect(durationLogs[0]?.details.duplicate).toBe(false);
    expect(durationLogs[0]?.details.saveSucceeded).toBe(true);
  });
});
