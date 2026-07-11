import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const defaultStoragePath = process.env.DISCORD_STORAGE_PATH ?? "data/discord-sessions.json";
let storeQueue = Promise.resolve();

function enqueueStoreTask(task) {
  const run = storeQueue.then(task, task);
  storeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureStorageDirectory() {
  await mkdir(dirname(defaultStoragePath), { recursive: true });
}

async function readStore() {
  try {
    const raw = await readFile(defaultStoragePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.sessions || typeof parsed.sessions !== "object") {
      return { sessions: {} };
    }
    return { sessions: parsed.sessions };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("세션 저장소를 읽는 중 오류가 발생했습니다.", error);
    }
    return { sessions: {} };
  }
}

async function writeStore(store) {
  await ensureStorageDirectory();
  const tempPath = `${defaultStoragePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
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
  return await enqueueStoreTask(async () => {
    const store = await readStore();
    store.sessions[session.sessionKey] = session;
    await writeStore(store);
    return session;
  });
}

export async function resetSession(sessionKey) {
  return await enqueueStoreTask(async () => {
    const store = await readStore();
    delete store.sessions[sessionKey];
    await writeStore(store);
  });
}

export async function resetAllSessions() {
  return await enqueueStoreTask(async () => {
    await writeStore({ sessions: {} });
  });
}

export async function updateSession(sessionKey, updater) {
  return await enqueueStoreTask(async () => {
    const store = await readStore();
    const current = store.sessions[sessionKey] ?? null;
    const next = await updater(current);
    if (next === null) {
      delete store.sessions[sessionKey];
    } else {
      store.sessions[sessionKey] = next;
    }
    await writeStore(store);
    return next;
  });
}
