import { NextRequest, NextResponse } from "next/server";
import { advanceQuizSessions, finalizeDueSessions } from "@/lib/telegramBotEngine";
import { runDueSchedules } from "@/lib/scheduler";
import { triggerQuizRunner, safeWaitUntil } from "@/lib/quizRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isAuthorized = (req: NextRequest): boolean => {
  const secret =
    process.env.CRON_SECRET ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "";

  // Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = req.headers.get("authorization") || "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";
  const headerSecret =
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-runner-secret") ||
    "";

  if (secret) {
    return (
      auth === `Bearer ${secret}` ||
      querySecret === secret ||
      headerSecret === secret
    );
  }

  // Without a configured secret, allow local development or default.
  if (process.env.NODE_ENV === "production") return true;
  const host = (req.headers.get("host") || "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
};

const runTick = async (req: NextRequest) => {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

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
