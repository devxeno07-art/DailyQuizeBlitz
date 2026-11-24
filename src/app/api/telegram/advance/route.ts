import { NextRequest, NextResponse } from "next/server";
import { runQuizAdvanceLoop, safeWaitUntil } from "@/lib/quizRunner";
import { getServerBotConfig } from "@/lib/serverStorage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isAuthorized = async (req: NextRequest): Promise<boolean> => {
  const isAsync = req.nextUrl.searchParams.get("async") === "1";
  // Safe heartbeat mode only wakes the runner for existing active sessions
  if (isAsync) return true;

  const config = await getServerBotConfig().catch(() => null);
  const allowedSecrets = [
    process.env.CRON_SECRET,
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.ADMIN_SESSION_SECRET,
    config?.webhookSecret,
  ].filter(Boolean) as string[];

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const headerSecret = req.headers.get("x-runner-secret") || "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";
  const provided = auth || headerSecret || querySecret;

  if (allowedSecrets.length > 0) {
    if (provided && allowedSecrets.includes(provided)) {
      return true;
    }
  }

  // Allow requests from same host (internal chain)
  const host = (req.headers.get("host") || "").split(":")[0];
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) return true;

  // In production, allow if no secrets configured or internal
  return allowedSecrets.length === 0;
};

const handleAdvance = async (req: NextRequest) => {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const origin = req.nextUrl?.origin;
  const isAsync = req.nextUrl.searchParams.get("async") === "1";

  if (isAsync) {
    safeWaitUntil(runQuizAdvanceLoop(origin));
    return NextResponse.json({
      ok: true,
      mode: "async_dispatched",
      at: new Date().toISOString(),
    });
  }

  const result = await runQuizAdvanceLoop(origin);
  return NextResponse.json({
    ...result,
    ranAt: new Date().toISOString(),
  });
};

export async function GET(req: NextRequest) {
  return handleAdvance(req);
}

export async function POST(req: NextRequest) {
  return handleAdvance(req);
}
