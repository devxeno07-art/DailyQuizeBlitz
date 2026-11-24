import { NextRequest, NextResponse } from "next/server";
import { advanceQuizSessions, finalizeDueSessions } from "@/lib/telegramBotEngine";
import { runDueSchedules } from "@/lib/scheduler";
import { triggerQuizRunner, safeWaitUntil } from "@/lib/quizRunner";
import { getServerBotConfig } from "@/lib/serverStorage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isAuthorized = async (req: NextRequest): Promise<boolean> => {
  const config = await getServerBotConfig().catch(() => null);
  const allowedSecrets = [
    process.env.CRON_SECRET,
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.ADMIN_SESSION_SECRET,
    config?.webhookSecret,
  ].filter(Boolean) as string[];

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";
  const headerSecret =
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-runner-secret") ||
    "";
  const provided = auth || headerSecret || querySecret;

  if (allowedSecrets.length > 0) {
    if (provided && allowedSecrets.includes(provided)) {
      return true;
    }
  }

  // Without a configured secret or for internal/local, allow
  if (process.env.NODE_ENV === "production" && allowedSecrets.length > 0) return false;
  return true;
};

const runTick = async (req: NextRequest) => {
  const authorized = await isAuthorized(req);
  if (!authorized) {
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
