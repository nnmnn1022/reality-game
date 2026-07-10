import { dirname } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const defaultStoragePath = process.env.DISCORD_STORAGE_PATH ?? "data/discord-sessions.json";

async function readStore() {
  try {
    const raw = await readFile(defaultStoragePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.sessions || typeof parsed.sessions !== "object") {
      return { sessions: {} };
    }
    return { sessions: parsed.sessions };
  } catch {
    return { sessions: {} };
  }
}

async function writeStore(store) {
  await mkdir(dirname(defaultStoragePath), { recursive: true });
  const tempPath = `${defaultStoragePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, defaultStoragePath);
}

export async function loadSession(sessionKey) {
  const store = await readStore();
  return store.sessions[sessionKey] ?? null;
}

export async function listSessions() {
  const store = await readStore();
  return Object.values(store.sessions);
}

export async function saveSession(session) {
  const store = await readStore();
  store.sessions[session.sessionKey] = session;
  await writeStore(store);
}

export async function resetSession(sessionKey) {
  const store = await readStore();
  delete store.sessions[sessionKey];
  await writeStore(store);
}

export async function resetAllSessions() {
  await writeStore({ sessions: {} });
}
