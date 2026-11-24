import { NextRequest, NextResponse } from "next/server";
import { advanceQuizSessions, finalizeDueSessions } from "@/lib/telegramBotEngine";
import { runDueSchedules } from "@/lib/scheduler";
import { triggerQuizRunner, safeWaitUntil } from "@/lib/quizRunner";
import { getServerBotConfig } from "@/lib/serverStorage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// /api/cron/tick is the heart of the 24/7 scheduler and poll runner.
// It is safe to be called publicly by external cron services (e.g. cron-job.org,
// UptimeRobot, GitHub Actions, Vercel cron) because it only executes pre-configured
// admin schedules and advances active quiz polls when due.
const isAuthorized = async (_req: NextRequest): Promise<boolean> => {
  return true;
};

const runTick = async (req: NextRequest) => {

  const advanced = await advanceQuizSessions().catch((err) => {
    console.warn("[cron] advance failed:", err);
    return { sent: 0, errors: [err?.message || "advance failed"] };
  });

  const [finalized, schedules] = await Promise.all([
    finalizeDueSessions().catch((err) => {
      console.warn("[cron] finalize failed:", err);
      return 0;
    }),
    runDueSchedules(req.nextUrl?.origin).catch((err) => ({
      ok: false,
      ran: 0,
      errors: [err?.message || "scheduler failed"],
      dispatched: [],
    })),
  ]);

  // Keep autonomous background runner active if there are any active sessions
  safeWaitUntil(triggerQuizRunner(req.nextUrl?.origin));

  return NextResponse.json({
    ok: true,
    advancedPolls: advanced.sent,
    advanceErrors: advanced.errors,
    finalizedSessions: finalized,
    scheduler: schedules,
    ranAt: new Date().toISOString(),
  });
};

export async function GET(req: NextRequest) {
  return runTick(req);
}

export async function POST(req: NextRequest) {
  return runTick(req);
}
