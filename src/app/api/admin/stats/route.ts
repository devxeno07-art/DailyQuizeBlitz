import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  getAllSessions,
  getServerOverviewStats,
} from "@/lib/serverStorage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  const [stats, sessions] = await Promise.all([
    getServerOverviewStats(),
    getAllSessions(),
  ]);

  const recentSessions = sessions.slice(0, 10).map((s) => ({
    id: s.id,
    code: s.code,
    chatId: s.chatId,
    status: s.status,
    startedAt: s.startedAt,
    questions: s.quiz?.questions?.length || 0,
    pollsSent: s.polls.length,
    participants: Object.values(s.participants || {}).filter(
      (p) => p.answeredCount > 0
    ).length,
  }));

  return NextResponse.json({ ok: true, stats, recentSessions });
}
