import { NextRequest, NextResponse } from "next/server";
import {
  getAllServerAttempts,
  getServerAttemptsFor,
  saveServerAttempt,
} from "@/lib/serverStorage";
import { TestAttemptResult } from "@/types";

export const dynamic = "force-dynamic";

const MAX_BODY_ATTEMPTS = 500;

/** Remove personally identifiable information before public exposure. */
const sanitizeAttempt = (attempt: TestAttemptResult) => ({
  id: attempt.id,
  testCode: attempt.testCode,
  paperId: attempt.paperId,
  paperTitle: attempt.paperTitle,
  subject: attempt.subject,
  studentName: (attempt.studentName || "વિદ્યાર્થી").slice(0, 60),
  score: Number(attempt.score) || 0,
  totalQuestions: Number(attempt.totalQuestions) || 0,
  wrongCount: Number(attempt.wrongCount) || 0,
  percentage: Number(attempt.percentage) || 0,
  grade: String(attempt.grade || "").slice(0, 3),
  completedAt: attempt.completedAt,
});

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || undefined;
  const paperId = req.nextUrl.searchParams.get("paperId") || undefined;
  const filter = code || paperId;

  const attempts = filter
    ? await getServerAttemptsFor(filter)
    : await getAllServerAttempts();

  const sorted = [...attempts].sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return NextResponse.json({
    ok: true,
    attempts: sorted.slice(0, MAX_BODY_ATTEMPTS).map(sanitizeAttempt),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<TestAttemptResult>;

    if (!body || !body.id || !body.testCode || !body.studentName) {
      return NextResponse.json(
        { ok: false, error: "Invalid attempt payload" },
        { status: 400 }
      );
    }

    const total = Math.max(0, Number(body.totalQuestions) || 0);
    const score = Math.max(0, Math.min(total || 99999, Number(body.score) || 0));

    const attempt: TestAttemptResult = {
      id: String(body.id).slice(0, 80),
      testCode: String(body.testCode).slice(0, 40),
      paperId: String(body.paperId || "").slice(0, 80),
      paperTitle: String(body.paperTitle || "").slice(0, 200),
      subject: String(body.subject || "").slice(0, 120),
      studentName: String(body.studentName).slice(0, 60),
      studentPhone: String(body.studentPhone || "").slice(0, 20),
      score,
      totalQuestions: total,
      wrongCount: Math.max(0, Number(body.wrongCount) || 0),
      percentage: Math.max(
        0,
        Math.min(100, Number(body.percentage) || 0)
      ),
      grade: String(body.grade || "").slice(0, 3),
      completedAt: body.completedAt || new Date().toISOString(),
    };

    await saveServerAttempt(attempt);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Invalid request" },
      { status: 400 }
    );
  }
}
