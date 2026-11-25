import { NextRequest, NextResponse } from "next/server";
import {
  advanceQuizSessions,
  executeDelayedDelete,
  finalizeDueSessions,
  processDuePendingDeletes,
} from "@/lib/telegramBotEngine";
import {
  getImminentScheduleWaitMs,
  runDueSchedules,
  runUpcomingTestReminders,
} from "@/lib/scheduler";
import { acquireRedisLock } from "@/lib/kvStore";
import { triggerQuizRunner, safeWaitUntil } from "@/lib/quizRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// /api/cron/tick is the heart of the 24/7 scheduler, reminder engine, and poll runner.
// Safe for external cron services (GitHub Actions, cron-job.org, UptimeRobot, Vercel cron)
// and frontend heartbeats. Protected against duplicate execution by distributed Redis locks.
const runTick = async (req: NextRequest) => {
  const origin = req.nextUrl?.origin;

  const advanced = await advanceQuizSessions().catch((err) => {
    console.warn("[cron] advance failed:", err);
    return { sent: 0, errors: [err?.message || "advance failed"] };
  });

  const [finalized, schedules, reminders, deletedMsgs] = await Promise.all([
    finalizeDueSessions().catch((err) => {
      console.warn("[cron] finalize failed:", err);
      return 0;
    }),
    runDueSchedules(origin).catch((err) => ({
      ok: false,
      ran: 0,
      errors: [err?.message || "scheduler failed"],
      dispatched: [],
    })),
    runUpcomingTestReminders().catch(() => ({
      sent: 0,
      scheduledDeletes: [],
    })),
    processDuePendingDeletes().catch(() => 0),
  ]);

  // Schedule exact 3-minute auto-deletion for any newly sent upcoming reminders
  for (const item of reminders.scheduledDeletes) {
    safeWaitUntil(
      executeDelayedDelete(item.chatId, item.messageId, item.delayMs)
    );
  }

  // Precision pre-launch wait: if a scheduled test starts within 1-4 minutes,
  // wait in the background and launch it right on the exact scheduled minute.
  const imminentWaitMs = await getImminentScheduleWaitMs().catch(() => 0);
  if (imminentWaitMs > 0) {
    safeWaitUntil(
      (async () => {
        const gotLock = await acquireRedisLock(
          "imminent_sched_wait",
          imminentWaitMs + 20_000
        );
        if (!gotLock) return;
        await new Promise((r) => setTimeout(r, imminentWaitMs));
        await runDueSchedules(origin).catch(() => {});
      })()
    );
  }

  // Keep autonomous background runner active if there are any active sessions
  safeWaitUntil(triggerQuizRunner(origin));

  return NextResponse.json({
    ok: true,
    advancedPolls: advanced.sent,
    advanceErrors: advanced.errors,
    finalizedSessions: finalized,
    scheduler: schedules,
    upcomingRemindersSent: reminders.sent,
    deletedMessages: deletedMsgs,
    imminentScheduleWaitMs: imminentWaitMs,
    ranAt: new Date().toISOString(),
  });
};

export async function GET(req: NextRequest) {
  return runTick(req);
}

export async function POST(req: NextRequest) {
  return runTick(req);
}
