import { NextRequest, NextResponse } from "next/server";
import {
  getAllServerQuizzes,
  deleteServerQuiz,
  getServerQuizByCode,
} from "@/lib/serverStorage";
import { isAdminRequest } from "@/lib/adminAuth";
import { Paper } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quizzes = await getAllServerQuizzes();

    // Map TelegramQuiz into Paper model for client consumption
    const papers: Paper[] = quizzes.map((q) => ({
      id: q.paperId || `server_${q.code}`,
      userId: q.creatorPhone || "",
      userName: q.createdBy || "શિક્ષક / વિદ્યાર્થી",
      title: q.title,
      subject: q.subject || "સામાન્ય જ્ઞાન & કરંટ અફેર્સ",
      category: "સ્પર્ધાત્મક પરીક્ષા",
      targetQuestions: q.questions?.length || 0,
      timeLimitMinutes: Math.max(
        10,
        Math.ceil(((q.questions?.length || 20) * (q.timePerQuestion || 30)) / 60)
      ),
      isPublic: true,
      testCode: q.code,
      questions: Array.isArray(q.questions) ? q.questions : [],
      createdAt: q.createdAt || new Date().toISOString(),
      updatedAt: q.createdAt || new Date().toISOString(),
    }));

    return NextResponse.json({ ok: true, papers });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch community papers" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const code = searchParams.get("code") || "";
    const userPhone = searchParams.get("userPhone") || "";

    if (!id && !code) {
      return NextResponse.json(
        { ok: false, error: "Missing paper ID or test code" },
        { status: 400 }
      );
    }

    // Check ownership if code provided
    if (code) {
      const existing = await getServerQuizByCode(code);
      const isAdmin = isAdminRequest(req);
      if (existing && !isAdmin && userPhone) {
        if (
          existing.creatorPhone &&
          existing.creatorPhone !== userPhone &&
          existing.creatorPhone !== `tg_${userPhone}`
        ) {
          return NextResponse.json(
            { ok: false, error: "Only the author can delete this paper" },
            { status: 403 }
          );
        }
      }
    }

    const deleted =
      (await deleteServerQuiz(code)) || (await deleteServerQuiz(id));

    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to delete server paper" },
      { status: 500 }
    );
  }
}
