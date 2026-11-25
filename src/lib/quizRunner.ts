import { waitUntil } from "@vercel/functions";
import { getAllSessions } from "./serverStorage";
import {
  advanceQuizSessions,
  finalizeDueSessions,
} from "./telegramBotEngine";

export const safeWaitUntil = (promise: Promise<any>): void => {
  try {
    waitUntil(promise);
  } catch {
    promise.catch((err) =>
      console.warn("[quizRunner] background error:", err?.message || err)
    );
  }
};

let runnerInProgress = false;

/**
 * Fast, serverless-safe quiz advancement runner.
 * Executes in < 3 seconds: checks active sessions, advances polls if due,
 * and finalizes finished quizzes. Does not keep long 4-minute loops alive,
 * preventing fair-use compute exhaustion on Vercel Hobby accounts.
 */
export const runQuizAdvanceLoop = async (
  _hostOrigin?: string
): Promise<{
  ok: boolean;
  runnerId: string;
  advancedTotal: number;
  finalizedTotal: number;
}> => {
  if (runnerInProgress) {
    return { ok: true, runnerId: "concurrent_skipped", advancedTotal: 0, finalizedTotal: 0 };
  }

  runnerInProgress = true;
  const runnerId = `runner_${Date.now()}`;
  let advancedTotal = 0;
  let finalizedTotal = 0;

  try {
    const sessions = await getAllSessions();
    const activeSessions = sessions.filter((s) => s.status === "active");

    if (activeSessions.length === 0) {
      return { ok: true, runnerId, advancedTotal: 0, finalizedTotal: 0 };
    }

    // Advance any session that is due right now
    const adv = await advanceQuizSessions().catch((err) => {
      console.warn("[quizRunner] advanceQuizSessions error:", err);
      return { sent: 0, errors: [err?.message || "Advance error"] };
    });
    advancedTotal += adv.sent;

    // Finalize any session that has completed all questions
    const fin = await finalizeDueSessions().catch((err) => {
      console.warn("[quizRunner] finalizeDueSessions error:", err);
      return 0;
    });
    finalizedTotal += fin;
  } finally {
    runnerInProgress = false;
  }

  return {
    ok: true,
    runnerId,
    advancedTotal,
    finalizedTotal,
  };
};

export const triggerQuizRunner = async (
  hostOrigin?: string
): Promise<void> => {
  try {
    safeWaitUntil(runQuizAdvanceLoop(hostOrigin));
  } catch (err: any) {
    console.warn("[quizRunner] triggerQuizRunner error:", err?.message || err);
  }
};
