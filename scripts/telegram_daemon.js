/**
 * MCQ Master - Telegram bot + scheduler daemon
 *
 * Continuously drives the app's server routes:
 *   1. GET /api/telegram/poll  -> fetches Telegram updates (when no webhook)
 *   2. GET /api/cron/tick      -> finalizes due quiz sessions and runs due
 *                                 daily-test schedules
 *
 * Usage (local development):
 *   npm run bot
 *
 * Environment (see .env.example):
 *   APP_URL                  default http://localhost:3000
 *   TELEGRAM_POLL_SECRET     must match the server value
 *   CRON_SECRET              must match the server value
 *   BOT_POLL_INTERVAL_MS     default 1000
 *   BOT_CRON_INTERVAL_MS     default 60000
 *
 * Load .env.local automatically when run outside Next.js.
 */

const fs = require("fs");
const path = require("path");

const loadEnvFile = (fileName) => {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

loadEnvFile(".env.local");
loadEnvFile(".env");

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);
const POLL_SECRET =
  process.env.TELEGRAM_POLL_SECRET || process.env.ADMIN_API_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

const toPositiveInt = (value, fallback, min = 100) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
};

const POLL_INTERVAL_MS = toPositiveInt(
  process.env.BOT_POLL_INTERVAL_MS,
  1000,
  250
);
const CRON_INTERVAL_MS = toPositiveInt(
  process.env.BOT_CRON_INTERVAL_MS,
  60000,
  10000
);

let isRunning = true;
let errorStreak = 0;
let lastCronAt = 0;
let processedTotal = 0;
let finalizedTotal = 0;

const authHeaders = (secret) => {
  const headers = { "Cache-Control": "no-cache" };
  if (secret) {
    headers["x-poll-secret"] = secret;
    headers["Authorization"] = `Bearer ${secret}`;
  }
  return headers;
};

const log = (...args) => {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
};

async function pollOnce() {
  const res = await fetch(`${APP_URL}/api/telegram/poll`, {
    cache: "no-store",
    headers: authHeaders(POLL_SECRET),
  });

  if (res.status === 401) {
    throw new Error(
      "Poll unauthorized. Set TELEGRAM_POLL_SECRET in .env.local and restart the daemon."
    );
  }
  if (!res.ok) {
    throw new Error(`Poll HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "Poll request failed");
  }

  if (data.processedCount > 0) {
    processedTotal += data.processedCount;
    log(`✓ Processed ${data.processedCount} Telegram update(s):`);
    (data.processed || []).forEach((item) => {
      log(`  -> update #${item.update_id}: ${item.res?.action || "done"}`);
    });
  }

  if (data.advancedPolls > 0) {
    log(`📨 Sent ${data.advancedPolls} next question poll(s).`);
  }
  (data.advanceErrors || []).forEach((error) => {
    console.warn("[Bot Daemon] Quiz advance warning:", error);
  });

  if (data.finalized > 0) {
    finalizedTotal += data.finalized;
    log(`🏁 Finalized ${data.finalized} quiz session(s), leaderboard sent.`);
  }

  return data;
}

async function cronOnce() {
  const res = await fetch(`${APP_URL}/api/cron/tick`, {
    cache: "no-store",
    headers: authHeaders(CRON_SECRET),
  });

  if (res.status === 401) {
    throw new Error(
      "Cron unauthorized. Set CRON_SECRET in .env.local and restart the daemon."
    );
  }
  if (!res.ok) {
    throw new Error(`Cron HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.finalizedSessions > 0) {
    finalizedTotal += data.finalizedSessions;
    log(`🏁 Cron finalized ${data.finalizedSessions} quiz session(s).`);
  }
  if (data.scheduler?.ran > 0) {
    log(`📅 Cron dispatched ${data.scheduler.ran} scheduled test(s).`);
  }
  (data.scheduler?.errors || []).forEach((error) => {
    console.warn("[Bot Daemon] Scheduler warning:", error);
  });
}

async function loop() {
  console.log("==================================================");
  console.log("🤖 MCQ Master Telegram Bot + Scheduler Daemon");
  console.log(`   App URL       : ${APP_URL}`);
  console.log(`   Poll secret   : ${POLL_SECRET ? "configured" : "NOT SET"}`);
  console.log(`   Cron secret   : ${CRON_SECRET ? "configured" : "NOT SET"}`);
  console.log(`   Poll interval : ${POLL_INTERVAL_MS} ms`);
  console.log(`   Cron interval : ${CRON_INTERVAL_MS} ms`);
  console.log("==================================================");

  if (!POLL_SECRET) {
    console.warn(
      "[Bot Daemon] TELEGRAM_POLL_SECRET is empty. This only works on localhost."
    );
  }

  while (isRunning) {
    try {
      await pollOnce();
      errorStreak = 0;
    } catch (err) {
      errorStreak += 1;
      if (errorStreak === 1 || errorStreak % 30 === 0) {
        console.warn(
          `[Bot Daemon] Poll error (${errorStreak}):`,
          err?.message || err
        );
      }
    }

    if (Date.now() - lastCronAt >= CRON_INTERVAL_MS) {
      lastCronAt = Date.now();
      try {
        await cronOnce();
      } catch (err) {
        console.warn("[Bot Daemon] Cron error:", err?.message || err);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

const shutdown = (signal) => {
  console.log(
    `\n[Bot Daemon] ${signal} received. Updates: ${processedTotal}, finalized sessions: ${finalizedTotal}`
  );
  isRunning = false;
};

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(0);
});

loop().catch((err) => {
  console.error("[Bot Daemon] Fatal error:", err);
  process.exit(1);
});
