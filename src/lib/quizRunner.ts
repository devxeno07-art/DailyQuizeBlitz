import { waitUntil } from "@vercel/functions";
import { getAllSessions, saveSession } from "./serverStorage";
import {
  advanceQuizSessions,
  finalizeDueSessions,
  getSessionTimePerQuestion,
  NEXT_POLL_GRACE_MS,
} from "./telegramBotEngine";
import { kvGetJson, kvSetJson } from "./kvStore";

interface RunnerLease {
  runnerId: string;
  expiresAt: number;
  startedAt: string;
  updatedAt: string;
}

const LEASE_KEY = "quiz_runner_lease.json";

export const safeWaitUntil = (promise: Promise<any>): void => {
  try {
    waitUntil(promise);
  } catch {
    promise.catch((err) =>
      console.warn("[quizRunner] background error:", err?.message || err)
    );
  }
};

export const getEffectiveAppUrl = (hostOrigin?: string): string => {
  let url =
    (hostOrigin || "").trim() ||
    (process.env.APP_URL || "").trim() ||
    (process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://dailyquizeblitz.vercel.app";

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
};

export const dispatchNextRunnerInvocation = async (
  hostOrigin?: string
): Promise<boolean> => {
  const baseUrl = getEffectiveAppUrl(hostOrigin);
  const targetUrl = `${baseUrl}/api/telegram/advance?async=1`;
  const secret =
    process.env.CRON_SECRET ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "internal";

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-runner-secret": secret,
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        triggeredAt: new Date().toISOString(),
        source: "chain",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch (err: any) {
    console.warn(
      `[quizRunner] Failed to chain runner to ${targetUrl}:`,
      err?.message || err
    );
    return false;
  }
};

let localRunnerRunning = false;

/**
 * High-speed, zero-latency quiz advancement runner.
 * 
 * - While active sessions exist, it sleeps precisely towards the next poll's open_period.
 * - Dispatches next questions within 100ms of timer expiration (eliminates the 7-8s lag).
 * - Safe against runaway loops:
 *   - Only runs while active sessions have pending questions.
 *   - When all questions & leaderboard are finished, exits immediately and clears the lease.
 *   - Invocation capped at ~48 seconds; chains to next invocation ONLY if active sessions still remain.
 *   - Stale sessions (> 30 min) are automatically completed to prevent infinite loops.
 */
export const runQuizAdvanceLoop = async (
  hostOrigin?: string
): Promise<{
  ok: boolean;
  runnerId: string;
  cycles: number;
  advancedTotal: number;
  finalizedTotal: number;
  chained: boolean;
}> => {
  const runnerId = `runner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();

  // Distributed lease check in Redis
  const currentLease = await kvGetJson<RunnerLease | null>(LEASE_KEY, null);
  if (
    currentLease &&
    now < currentLease.expiresAt &&
    currentLease.runnerId !== runnerId
  ) {
    return {
      ok: true,
      runnerId: currentLease.runnerId,
      cycles: 0,
      advancedTotal: 0,
      finalizedTotal: 0,
      chained: false,
    };
  }

  if (localRunnerRunning) {
    return {
      ok: true,
      runnerId,
      cycles: 0,
      advancedTotal: 0,
      finalizedTotal: 0,
      chained: false,
    };
  }

  localRunnerRunning = true;
  const startTime = Date.now();
  const MAX_INVOCATION_DURATION_MS = 48_000;
  let cycles = 0;
  let advancedTotal = 0;
  let finalizedTotal = 0;
  let chained = false;

  try {
    // Initial lease acquisition
    await kvSetJson(LEASE_KEY, {
      runnerId,
      expiresAt: Date.now() + 15_000,
      startedAt: new Date(startTime).toISOString(),
      updatedAt: new Date().toISOString(),
    });

    while (Date.now() - startTime < MAX_INVOCATION_DURATION_MS) {
      cycles++;
      const sessions = await getAllSessions();
      const currentLoopNow = Date.now();

      // Filter active sessions and close any stale ones (> 30 min)
      const activeSessions: typeof sessions = [];
      for (const s of sessions) {
        if (s.status !== "active") continue;
        const ageMs = currentLoopNow - new Date(s.startedAt).getTime();
        if (ageMs > 30 * 60 * 1000) {
          s.status = "completed";
          s.error = "Session auto-completed after 30m timeout";
          await saveSession(s);
          continue;
        }
        activeSessions.push(s);
      }

      if (activeSessions.length === 0) {
        // No active sessions remain! Clear lease and stop immediately.
        await kvSetJson(LEASE_KEY, null);
        break;
      }

      // Calculate next due timestamp across all active sessions
      let minDueAt = Infinity;

      for (const session of activeSessions) {
        const total = session.quiz?.questions?.length || 0;
        if (session.polls.length < total) {
          if (session.polls.length === 0) {
            minDueAt = Math.min(minDueAt, currentLoopNow);
          } else {
            const lastPoll = session.polls[session.polls.length - 1];
            const lastSentAt = new Date(lastPoll.sentAt).getTime();
            const timePerQuestion = getSessionTimePerQuestion(session);
            const due = lastSentAt + timePerQuestion * 1000 + NEXT_POLL_GRACE_MS;
            minDueAt = Math.min(minDueAt, due);
          }
        } else {
          // All polls sent; waiting for finalization
          const finalizeAt = session.finalizeAt
            ? new Date(session.finalizeAt).getTime()
            : currentLoopNow;
          minDueAt = Math.min(minDueAt, finalizeAt);
        }
      }

      // If something is due right now (or within 40ms)
      if (minDueAt <= currentLoopNow + 40) {
        const adv = await advanceQuizSessions().catch((err) => {
          console.warn("[quizRunner] advanceQuizSessions error:", err);
          return { sent: 0, errors: [err?.message || "Advance error"] };
        });
        advancedTotal += adv.sent;

        const fin = await finalizeDueSessions().catch((err) => {
          console.warn("[quizRunner] finalizeDueSessions error:", err);
          return 0;
        });
        finalizedTotal += fin;

        // Renew lease
        await kvSetJson(LEASE_KEY, {
          runnerId,
          expiresAt: Date.now() + 15_000,
          startedAt: new Date(startTime).toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Small pause for state persistence
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }

      // Next due item is in the future
      const remainingTimeInInvocation =
        MAX_INVOCATION_DURATION_MS - (Date.now() - startTime);
      const delayUntilDue = minDueAt - currentLoopNow;

      // If next due event is beyond this invocation's safe duration, hand off to next invocation
      if (delayUntilDue > remainingTimeInInvocation) {
        await kvSetJson(LEASE_KEY, null);
        await dispatchNextRunnerInvocation(hostOrigin);
        chained = true;
        break;
      }

      // Renew lease
      await kvSetJson(LEASE_KEY, {
        runnerId,
        expiresAt:
          Date.now() +
          Math.max(15_000, Math.min(delayUntilDue + 5000, 25_000)),
        startedAt: new Date(startTime).toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Sleep precisely towards due time in chunks of at most 1000ms
      const sleepStep = Math.max(20, Math.min(delayUntilDue, 1000));
      await new Promise((r) => setTimeout(r, sleepStep));
    }

    // Check if any active sessions STILL remain after loop exit
    if (!chained) {
      const postSessions = await getAllSessions();
      const stillActive = postSessions.some(
        (s) =>
          s.status === "active" &&
          (s.polls.length < (s.quiz?.questions?.length || 0) ||
            !s.leaderboardSentAt)
      );
      if (stillActive) {
        await kvSetJson(LEASE_KEY, null);
        await dispatchNextRunnerInvocation(hostOrigin);
        chained = true;
      } else {
        await kvSetJson(LEASE_KEY, null);
      }
    }
  } finally {
    localRunnerRunning = false;
  }

  return {
    ok: true,
    runnerId,
    cycles,
    advancedTotal,
    finalizedTotal,
    chained,
  };
};

export const triggerQuizRunner = async (
  hostOrigin?: string
): Promise<void> => {
  try {
    const sessions = await getAllSessions();
    const hasActive = sessions.some((s) => s.status === "active");
    if (!hasActive) return;

    safeWaitUntil(runQuizAdvanceLoop(hostOrigin));
  } catch (err: any) {
    console.warn("[quizRunner] triggerQuizRunner error:", err?.message || err);
  }
};
