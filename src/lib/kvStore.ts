/**
 * Server-side JSON storage with pluggable backends.
 *
 * Priority:
 *  1. Supabase PostgreSQL (`app_settings` table, prefix `kv:gsrtc:`) — persistent,
 *     serverless-safe, generous free tier (500MB, no daily Redis command cap)
 *  2. Upstash Redis / Vercel KV REST API (used only when healthy; automatically
 *     circuit-broken if quota/Fixed-plan limits are reached)
 *  3. Local JSON files under ./data (localhost / VPS) or /tmp (last resort)
 *  4. In-memory map fallback
 *
 * This module must only be imported by server code (API routes / lib
 * modules used by API routes).
 */

import fs from "fs";
import path from "path";
import os from "os";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

const KV_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";
const HAS_REDIS = Boolean(KV_URL && KV_TOKEN);
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const KEY_PREFIX = "gsrtc:";

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "gsrtc-data")
  : path.join(process.cwd(), "data");

// Read-only bundled ./data fallback for initial seed if cloud is blank
const REPO_DATA_DIR = path.join(process.cwd(), "data");

let warnedAboutEphemeralStorage = false;
let redisTrippedUntil = 0;
const memoryStore = new Map<string, string>();

const isRedisHealthy = (): boolean => HAS_REDIS && Date.now() > redisTrippedUntil;

const tripRedisIfQuotaError = (msg: string): void => {
  const lower = String(msg || "").toLowerCase();
  if (
    lower.includes("limit") ||
    lower.includes("quota") ||
    lower.includes("fixed plan") ||
    lower.includes("maxdaily")
  ) {
    // Pause Redis calls for 10 minutes so requests stay sub-50ms via Supabase
    redisTrippedUntil = Date.now() + 10 * 60 * 1000;
  }
};

export const getStorageMode = (): "supabase" | "redis" | "file" | "memory" => {
  if (HAS_SUPABASE) return "supabase";
  if (isRedisHealthy()) return "redis";
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
    !HAS_SUPABASE &&
    !HAS_REDIS &&
    process.env.VERCEL &&
    !warnedAboutEphemeralStorage
  ) {
    warnedAboutEphemeralStorage = true;
    console.warn(
      "[storage] No Supabase or Redis configured. Using ephemeral /tmp storage on Vercel."
    );
  }
};

// ==========================================
// Supabase REST KV Backend (`public.app_settings`)
// ==========================================

const SB_CHUNK_SIZE = 500_000; // ~500KB per row keeps Supabase PostgREST fast & reliable even at 50+ huge exams

const sbKeyName = (key: string): string => `kv:${KEY_PREFIX}${key}`;
const sbChunkName = (key: string, idx: number): string =>
  `${sbKeyName(key)}::chunk:${idx}`;

const supabaseHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  ...extra,
});

const supabaseGet = async (key: string): Promise<string | null> => {
  const base = SUPABASE_URL.replace(/\/$/, "");
  const target = sbKeyName(key);
  const res = await fetch(
    `${base}/rest/v1/app_settings?key=eq.${encodeURIComponent(
      target
    )}&select=value`,
    {
      headers: supabaseHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) {
    throw new Error(`Supabase GET failed (${res.status})`);
  }
  const rows = (await res.json()) as Array<{ value?: string }>;
  const raw = Array.isArray(rows) && rows.length > 0 ? rows[0].value ?? null : null;
  if (!raw) return null;

  // Transparently reassemble chunked documents
  if (raw.startsWith('{"__chunked":true')) {
    try {
      const meta = JSON.parse(raw) as { __chunked?: boolean; chunks?: number };
      const count = Number(meta.chunks) || 0;
      if (meta.__chunked && count > 0) {
        const chunkKeys = Array.from({ length: count }, (_, i) => sbChunkName(key, i));
        const inList = chunkKeys.map((k) => `"${encodeURIComponent(k)}"`).join(",");
        const cRes = await fetch(
          `${base}/rest/v1/app_settings?key=in.(${inList})&select=key,value`,
          {
            headers: supabaseHeaders(),
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }
        );
        if (!cRes.ok) {
          throw new Error(`Supabase chunk GET failed (${cRes.status})`);
        }
        const cRows = (await cRes.json()) as Array<{ key: string; value: string }>;
        const byKey = new Map(cRows.map((r) => [r.key, r.value || ""]));
        let combined = "";
        for (const ck of chunkKeys) {
          const part = byKey.get(ck);
          if (part === undefined) {
            throw new Error(`Missing chunk ${ck}`);
          }
          combined += part;
        }
        return combined;
      }
    } catch (err) {
      console.warn(`[storage] Failed to reassemble chunked key ${key}:`, err);
      return null;
    }
  }

  return raw;
};

const supabaseUpsertBatch = async (
  rows: Array<{ key: string; value: string; updated_at: string }>
): Promise<void> => {
  const base = SUPABASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/app_settings`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase SET failed (${res.status}): ${errText}`);
  }
};

const supabaseSet = async (key: string, value: string): Promise<void> => {
  const now = new Date().toISOString();
  const target = sbKeyName(key);

  if (value.length <= SB_CHUNK_SIZE) {
    await supabaseUpsertBatch([{ key: target, value, updated_at: now }]);
    return;
  }

  // Split large payloads (>500KB) into chunks so Supabase stays fast for 50–200+ exams
  const totalChunks = Math.ceil(value.length / SB_CHUNK_SIZE);
  const chunkRows: Array<{ key: string; value: string; updated_at: string }> = [];
  for (let i = 0; i < totalChunks; i++) {
    chunkRows.push({
      key: sbChunkName(key, i),
      value: value.slice(i * SB_CHUNK_SIZE, (i + 1) * SB_CHUNK_SIZE),
      updated_at: now,
    });
  }

  // Upsert chunks individually (3 concurrent) so each PostgREST body stays <= 500KB
  for (let i = 0; i < chunkRows.length; i += 3) {
    await Promise.all(
      chunkRows.slice(i, i + 3).map((row) => supabaseUpsertBatch([row]))
    );
  }

  // Commit manifest pointing to the newly written chunks
  await supabaseUpsertBatch([
    {
      key: target,
      value: JSON.stringify({ __chunked: true, chunks: totalChunks }),
      updated_at: now,
    },
  ]);
};

const supabaseDelete = async (key: string): Promise<void> => {
  const base = SUPABASE_URL.replace(/\/$/, "");
  const target = sbKeyName(key);
  const res = await fetch(
    `${base}/rest/v1/app_settings?or=(key.eq.${encodeURIComponent(
      target
    )},key.like.${encodeURIComponent(`${target}::chunk:*`)})`,
    {
      method: "DELETE",
      headers: supabaseHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    throw new Error(`Supabase DELETE failed (${res.status})`);
  }
};

// ==========================================
// Upstash Redis REST Backend (Optional / Secondary)
// ==========================================

const redisUrl = (key: string): string =>
  `${KV_URL.replace(/\/$/, "")}/set/${encodeURIComponent(KEY_PREFIX + key)}`;

const redisGet = async (key: string): Promise<string | null> => {
  const res = await fetch(
    `${KV_URL.replace(/\/$/, "")}/get/${encodeURIComponent(KEY_PREFIX + key)}`,
    {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    result?: string | null;
    error?: string;
  };
  if (!res.ok || data.error) {
    const errMsg = data.error || `KV GET failed (${res.status})`;
    tripRedisIfQuotaError(errMsg);
    throw new Error(errMsg);
  }
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
    signal: AbortSignal.timeout(5000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok || data.error) {
    const errMsg = data.error || `KV SET failed (${res.status})`;
    tripRedisIfQuotaError(errMsg);
    throw new Error(errMsg);
  }
};

// ==========================================
// Local File Backend
// ==========================================

const safeFilename = (key: string): string => {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeKey.endsWith(".json") ? safeKey : `${safeKey}.json`;
};

const filePath = (key: string): string => path.join(DATA_DIR, safeFilename(key));

const fileGet = async (key: string): Promise<string | null> => {
  const target = filePath(key);
  if (fs.existsSync(target)) {
    return fs.promises.readFile(target, "utf-8");
  }
  // Also check bundled repo ./data folder on cold cloud start
  if (REPO_DATA_DIR !== DATA_DIR) {
    const bundled = path.join(REPO_DATA_DIR, safeFilename(key));
    if (fs.existsSync(bundled)) {
      return fs.promises.readFile(bundled, "utf-8");
    }
  }
  return null;
};

const fileSet = async (key: string, value: string): Promise<void> => {
  ensureDataDir();
  const target = filePath(key);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, value, "utf-8");
  await fs.promises.rename(tmp, target);
};

// ==========================================
// Unified JSON API
// ==========================================

/** Read and parse a JSON document. Returns the fallback when missing/invalid. */
export const kvGetJson = async <T>(key: string, fallback: T): Promise<T> => {
  let raw: string | null = null;

  // 1. Primary: Supabase PostgreSQL KV
  if (HAS_SUPABASE) {
    try {
      raw = await supabaseGet(key);
    } catch (err) {
      console.warn(`[storage] Supabase read failed for ${key}:`, err);
    }
  }

  // 2. Fallback: Redis (only if healthy and Supabase missed/failed)
  if (raw == null && isRedisHealthy()) {
    try {
      raw = await redisGet(key);
      if (raw != null && HAS_SUPABASE) {
        // Backfill into Supabase automatically
        supabaseSet(key, raw).catch(() => {});
      }
    } catch (err) {
      console.warn(`[storage] Redis read failed for ${key}:`, err);
    }
  }

  // 3. Fallback: local file or bundled seed or memory
  if (raw == null) {
    warnIfEphemeral();
    try {
      raw = await fileGet(key);
    } catch (err) {
      console.warn(`[storage] File read failed for ${key}:`, err);
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

  let persistedCloud = false;

  // 1. Primary: Supabase PostgreSQL KV
  if (HAS_SUPABASE) {
    try {
      await supabaseSet(key, raw);
      persistedCloud = true;
    } catch (err) {
      console.warn(`[storage] Supabase write failed for ${key}:`, err);
    }
  }

  // 2. Secondary: Upstash Redis (mirror when healthy; never blocks on quota error)
  if (isRedisHealthy()) {
    try {
      await redisSet(key, raw);
      persistedCloud = true;
    } catch (err) {
      if (!persistedCloud) {
        console.warn(`[storage] Redis write failed for ${key}:`, err);
      }
    }
  }

  if (!persistedCloud || !process.env.VERCEL) {
    try {
      await fileSet(key, raw);
    } catch (err) {
      if (!persistedCloud) {
        console.warn(`[storage] File write failed for ${key}, kept in memory only:`, err);
      }
    }
  }
};

export const kvDelete = async (key: string): Promise<void> => {
  memoryStore.delete(key);

  if (HAS_SUPABASE) {
    try {
      await supabaseDelete(key);
    } catch (err) {
      console.warn(`[storage] Supabase delete failed for ${key}:`, err);
    }
  }

  if (isRedisHealthy()) {
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
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        tripRedisIfQuotaError(data.error || `KV DEL failed (${res.status})`);
      }
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
// inside a single Node instance.
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
    if (keyLocks.get(key) === queued) {
      keyLocks.delete(key);
    }
  }
};

export { DATA_DIR };

// ==========================================
// Distributed Atomic Locks (Supabase Primary + Redis Fallback)
// ==========================================

const localLockFallbacks = new Map<string, number>();

const acquireSupabaseLock = async (
  fullKey: string,
  validTtl: number
): Promise<boolean | null> => {
  try {
    const base = SUPABASE_URL.replace(/\/$/, "");
    const expiredCutoff = new Date(Date.now() - validTtl).toISOString();

    // Remove expired lock rows for this key first
    await fetch(
      `${base}/rest/v1/app_settings?key=eq.${encodeURIComponent(
        fullKey
      )}&updated_at=lt.${encodeURIComponent(expiredCutoff)}`,
      {
        method: "DELETE",
        headers: supabaseHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      }
    ).catch(() => {});

    // Atomic INSERT without upsert: primary key constraint ensures only one winner
    const ins = await fetch(`${base}/rest/v1/app_settings`, {
      method: "POST",
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify({
        key: fullKey,
        value: String(Date.now() + validTtl),
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (ins.status === 201 || ins.status === 200) return true;
    if (ins.status === 409) return false;
    return null;
  } catch {
    return null;
  }
};

const releaseSupabaseLock = async (fullKey: string): Promise<void> => {
  try {
    await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/app_settings?key=eq.${encodeURIComponent(
        fullKey
      )}`,
      {
        method: "DELETE",
        headers: supabaseHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      }
    );
  } catch {
    // TTL cleanup handles stale lock rows automatically
  }
};

/**
 * Acquires an atomic lock across all serverless instances.
 * Uses Supabase primary key uniqueness (or Redis NX PX when healthy),
 * with in-memory TTL fallback.
 */
export const acquireRedisLock = async (
  lockKey: string,
  ttlMs: number
): Promise<boolean> => {
  const validTtl = Math.max(500, Math.floor(ttlMs));
  const sbLockKey = `kv_lock:${KEY_PREFIX}${lockKey}`;
  const fullKey = `${KEY_PREFIX}lock:${lockKey}`;

  if (HAS_SUPABASE) {
    const sbResult = await acquireSupabaseLock(sbLockKey, validTtl);
    if (sbResult !== null) return sbResult;
  }

  if (isRedisHealthy()) {
    try {
      const res = await fetch(KV_URL.replace(/\/$/, ""), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["SET", fullKey, "1", "NX", "PX", String(validTtl)]),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: string | null;
        error?: string;
      };
      if (res.ok && !data.error) {
        return data.result === "OK";
      }
      tripRedisIfQuotaError(data.error || `Lock failed (${res.status})`);
    } catch (err) {
      console.warn(`[lock] Redis lock failed for ${lockKey}:`, err);
    }
  }

  const now = Date.now();
  const expiresAt = localLockFallbacks.get(fullKey) || 0;
  if (expiresAt > now) {
    return false;
  }
  localLockFallbacks.set(fullKey, now + validTtl);
  return true;
};

export const releaseRedisLock = async (lockKey: string): Promise<void> => {
  const sbLockKey = `kv_lock:${KEY_PREFIX}${lockKey}`;
  const fullKey = `${KEY_PREFIX}lock:${lockKey}`;
  localLockFallbacks.delete(fullKey);

  if (HAS_SUPABASE) {
    await releaseSupabaseLock(sbLockKey);
  }

  if (isRedisHealthy()) {
    try {
      await fetch(KV_URL.replace(/\/$/, ""), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["DEL", fullKey]),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // Lock expires automatically by TTL
    }
  }
};

/**
 * Executes `fn` while holding a distributed lock across serverless instances.
 * Spins briefly up to `waitMs` if another instance holds the lock.
 */
export const withDistributedLock = async <T>(
  lockKey: string,
  ttlMs: number,
  fn: () => Promise<T>,
  waitMs = 2500
): Promise<T> => {
  const deadline = Date.now() + waitMs;
  let acquired = await acquireRedisLock(lockKey, ttlMs);

  while (!acquired && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 120));
    acquired = await acquireRedisLock(lockKey, ttlMs);
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      await releaseRedisLock(lockKey);
    }
  }
};
