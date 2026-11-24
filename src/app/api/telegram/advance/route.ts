import { NextRequest, NextResponse } from "next/server";
import { runQuizAdvanceLoop, safeWaitUntil } from "@/lib/quizRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isAuthorized = (req: NextRequest): boolean => {
  const secret =
    process.env.CRON_SECRET ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "";

  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-runner-secret") || "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";

  if (secret) {
    if (
      auth === `Bearer ${secret}` ||
      headerSecret === secret ||
      querySecret === secret
    ) {
      return true;
    }
  }

  // Allow requests from same host (internal chain)
  const host = (req.headers.get("host") || "").split(":")[0];
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) return true;

  // In production, require at least one matched secret if secrets are configured
  return !secret;
};

const handleAdvance = async (req: NextRequest) => {
  if (!isAuthorized(req)) {
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
