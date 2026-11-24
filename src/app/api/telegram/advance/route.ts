import { NextRequest, NextResponse } from "next/server";
import { runQuizAdvanceLoop, safeWaitUntil } from "@/lib/quizRunner";
import { getServerBotConfig } from "@/lib/serverStorage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Open to internal chains, heartbeats, and external pingers to advance active quiz polls.
const isAuthorized = async (_req: NextRequest): Promise<boolean> => {
  return true;
};

const handleAdvance = async (req: NextRequest) => {

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
