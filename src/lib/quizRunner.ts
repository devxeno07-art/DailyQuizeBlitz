import { waitUntil } from "@vercel/functions";
import { getAllSessions } from "./serverStorage";
import {
  advanceQuizSessions,
  finalizeDueSessions,
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
    // Outside a Vercel request context (e.g. local script), ensure unhandled rejections are caught
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

let localRunnerRunning = false;

export const dispatchNextRunnerInvocation = async (
  hostOrigin?: string
): Promise<boolean> => {
  const baseUrl = getEffectiveAppUrl(hostOrigin);
  const targetUrl = `${baseUrl}/api/telegram/advance`;
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
      signal: AbortSignal.timeout(8000),
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
  const runnerId = `runner_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const now = Date.now();

  // Check if another runner already holds an active lease
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
  // Vercel Fluid Compute maxDuration is 300s; run up to 240s per invocation, then self-chain!
  const MAX_DURATION_MS = 240_000;
  let cycles = 0;
  let advancedTotal = 0;
  let finalizedTotal = 0;
  let chained = false;

  try {
    while (Date.now() - startTime < MAX_DURATION_MS) {
      cycles++;
      const sessions = await getAllSessions();
      const activeSessions = sessions.filter((s) => s.status === "active");

      if (activeSessions.length === 0) {
        // No active sessions remain — clear lease and stop
        await kvSetJson(LEASE_KEY, null);
        break;
      }

      const currentLoopNow = Date.now();
      let minDueAt = Infinity;

      for (const session of activeSessions) {
        const total = session.quiz?.questions?.length || 0;
        if (session.polls.length < total) {
          if (session.polls.length === 0) {
            minDueAt = Math.min(minDueAt, currentLoopNow);
          } else {
            const lastPoll = session.polls[session.polls.length - 1];
            const lastSentAt = new Date(lastPoll.sentAt).getTime();
            const timePerQuestion = Math.max(
              10,
              Math.min(600, Number(session.quiz?.timePerQuestion) || 30)
            );
            // 1200ms grace period after open_period
            const due = lastSentAt + timePerQuestion * 1000 + 1200;
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

      // If something is due right now
      if (minDueAt <= currentLoopNow) {
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
          expiresAt: Date.now() + 25_000,
          startedAt: new Date(startTime).toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Short pause so Telegram API state settles
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Something is due in the future
      const remainingTotal = MAX_DURATION_MS - (Date.now() - startTime);
      const delayUntilDue = minDueAt - currentLoopNow;

      // If the next due item is beyond this invocation's remaining time, chain now
      if (delayUntilDue > remainingTotal) {
        const sleepBeforeChain = Math.max(0, remainingTotal - 5000);
        if (sleepBeforeChain > 0) {
          await new Promise((r) =>
            setTimeout(r, Math.min(sleepBeforeChain, 10_000))
          );
        }
        await dispatchNextRunnerInvocation(hostOrigin);
        chained = true;
        break;
      }

      // Renew lease before sleeping
      await kvSetJson(LEASE_KEY, {
        runnerId,
        expiresAt:
          Date.now() +
          Math.max(25_000, Math.min(delayUntilDue + 5000, 30_000)),
        startedAt: new Date(startTime).toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Sleep in chunks of at most 8 seconds to keep lease fresh
      const sleepStep = Math.min(delayUntilDue, 8000);
      await new Promise((r) => setTimeout(r, sleepStep));
    }

    // Check if active sessions remain after loop exit
    if (!chained) {
      const postSessions = await getAllSessions();
      const stillActive = postSessions.some((s) => s.status === "active");
      if (stillActive) {
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
