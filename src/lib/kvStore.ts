/**
 * Server-side JSON storage with pluggable backends.
 *
 * Priority:
 *  1. Upstash Redis / Vercel KV REST API (persistent, serverless-safe)
 *  2. Local JSON files under ./data (great for localhost / VPS)
 *  3. /tmp files on Vercel when no KV is configured (ephemeral warning)
 *  4. In-memory map as the last resort
 *
 * This module must only be imported by server code (API routes / lib
 * modules used by API routes).
 */

import fs from "fs";
import path from "path";
import os from "os";

const KV_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";
const USE_REDIS = Boolean(KV_URL && KV_TOKEN);
const KEY_PREFIX = "gsrtc:";

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "gsrtc-data")
  : path.join(process.cwd(), "data");

let warnedAboutEphemeralStorage = false;
const memoryStore = new Map<string, string>();

export const getStorageMode = (): "redis" | "file" | "memory" => {
  if (USE_REDIS) return "redis";
  try {
    ensureDataDir();
    return "file";
  } catch {
    return "memory";
  }
};

const ensureDataDir = (): void => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const warnIfEphemeral = (): void => {
  if (
    !USE_REDIS &&
    process.env.VERCEL &&
    !warnedAboutEphemeralStorage
  ) {
    warnedAboutEphemeralStorage = true;
    console.warn(
      "[storage] No KV_REST_API_URL configured. Using ephemeral /tmp storage on Vercel — data will be lost between deployments/instances. Configure Upstash Redis for persistence."
    );
  }
};

const redisUrl = (key: string): string =>
  `${KV_URL.replace(/\/$/, "")}/set/${encodeURIComponent(KEY_PREFIX + key)}`;

const redisGet = async (key: string): Promise<string | null> => {
  const res = await fetch(`${KV_URL.replace(/\/$/, "")}/get/${encodeURIComponent(KEY_PREFIX + key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`KV GET failed (${res.status})`);
  }
  const data = (await res.json()) as { result?: string | null };
  return data.result ?? null;
};

const redisSet = async (key: string, value: string): Promise<void> => {
  const res = await fetch(redisUrl(key), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: value,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`KV SET failed (${res.status})`);
  }
};

const filePath = (key: string): string => {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(DATA_DIR, safeKey.endsWith(".json") ? safeKey : `${safeKey}.json`);
};

const fileGet = async (key: string): Promise<string | null> => {
  ensureDataDir();
  const target = filePath(key);
  if (!fs.existsSync(target)) return null;
  return fs.promises.readFile(target, "utf-8");
};

const fileSet = async (key: string, value: string): Promise<void> => {
  ensureDataDir();
  const target = filePath(key);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, value, "utf-8");
  await fs.promises.rename(tmp, target);
};

/** Read and parse a JSON document. Returns the fallback when missing/invalid. */
export const kvGetJson = async <T>(key: string, fallback: T): Promise<T> => {
  let raw: string | null = null;

  if (USE_REDIS) {
    try {
      raw = await redisGet(key);
    } catch (err) {
      console.warn(
        `[storage] Redis read failed for ${key}, trying local fallback:`,
        err
      );
      raw = memoryStore.get(key) ?? null;
      if (raw == null) {
        try {
          raw = await fileGet(key);
        } catch (fileErr) {
          console.warn(`[storage] File fallback failed for ${key}:`, fileErr);
        }
      }
    }
  } else {
    warnIfEphemeral();
    try {
      raw = await fileGet(key);
    } catch (err) {
      console.warn(`[storage] File read failed for ${key}, using memory:`, err);
      raw = memoryStore.get(key) ?? null;
    }
  }

  if (raw == null) {
    raw = memoryStore.get(key) ?? null;
  }
  if (raw == null) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[storage] Could not parse ${key}:`, err);
    return fallback;
  }
};

/** Serialize and persist a JSON document. */
export const kvSetJson = async <T>(key: string, value: T): Promise<void> => {
  const raw = JSON.stringify(value);
  memoryStore.set(key, raw);

  if (USE_REDIS) {
    try {
      await redisSet(key, raw);
      return;
    } catch (err) {
      console.warn(`[storage] Redis write failed for ${key}, falling back to file:`, err);
    }
  }

  try {
    await fileSet(key, raw);
  } catch (err) {
    console.warn(`[storage] File write failed for ${key}, kept in memory only:`, err);
  }
};

export const kvDelete = async (key: string): Promise<void> => {
  memoryStore.delete(key);
  if (USE_REDIS) {
    try {
      const res = await fetch(
        `${KV_URL.replace(/\/$/, "")}/del/${encodeURIComponent(
          KEY_PREFIX + key
        )}`,
        {
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          cache: "no-store",
        }
      );
      if (!res.ok) throw new Error(`KV DEL failed (${res.status})`);
      return;
    } catch (err) {
      console.warn(`[storage] Redis delete failed for ${key}:`, err);
    }
  }
  try {
    const target = filePath(key);
    if (fs.existsSync(target)) await fs.promises.unlink(target);
  } catch (err) {
    console.warn(`[storage] File delete failed for ${key}:`, err);
  }
};

// Simple in-process keyed lock so read-modify-write cycles don't interleave
// inside a single Node instance. Redis/Upstash users should also avoid
// running multiple concurrent writers for the same key.
const keyLocks = new Map<string, Promise<void>>();

export const withKeyLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const previous = keyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  keyLocks.set(key, queued);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    // Only the last waiter removes the entry, so the map does not grow
    // forever while still serializing concurrent writers.
    if (keyLocks.get(key) === queued) {
      keyLocks.delete(key);
    }
  }
};

export { DATA_DIR };
