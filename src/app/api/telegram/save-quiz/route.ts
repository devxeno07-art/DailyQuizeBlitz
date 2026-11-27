import { NextRequest, NextResponse } from "next/server";
import { getServerQuizByCode, saveServerQuiz } from "@/lib/serverStorage";
import { isAdminRequest } from "@/lib/adminAuth";
import { TelegramQuiz } from "@/types";

export const dynamic = "force-dynamic";

const MAX_QUESTIONS = 2000;

export async function POST(req: NextRequest) {
  try {
    const quiz: TelegramQuiz = await req.json();

    if (!quiz || !quiz.code || !Array.isArray(quiz.questions)) {
      return NextResponse.json(
        { ok: false, error: "Invalid quiz data" },
        { status: 400 }
      );
    }

    if (quiz.questions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Quiz must contain at least one question" },
        { status: 400 }
      );
    }

    if (quiz.questions.length > MAX_QUESTIONS) {
      return NextResponse.json(
        { ok: false, error: `Max ${MAX_QUESTIONS} questions per quiz` },
        { status: 400 }
      );
    }

    if (!/^[A-Za-z0-9_-]{2,40}$/.test(quiz.code.trim())) {
      return NextResponse.json(
        { ok: false, error: "Invalid quiz code format" },
        { status: 400 }
      );
    }

    // Ownership check: If a quiz with this code already exists, ensure only
    // the original creator or an admin can update it.
    const existing = await getServerQuizByCode(quiz.code);
    if (existing) {
      const isCreator =
        Boolean(existing.creatorPhone && quiz.creatorPhone && existing.creatorPhone === quiz.creatorPhone) ||
        Boolean(existing.paperId && quiz.paperId && existing.paperId === quiz.paperId);
      const isAdmin = isAdminRequest(req);

      if (!isCreator && !isAdmin) {
        return NextResponse.json(
          {
            ok: false,
            error: "આ ટેસ્ટ કોડ પહેલેથી જ અસ્તિત્વમાં છે. અન્ય યુઝરનો ટેસ્ટ કોઈ એડિટ કરી શકતું નથી.",
          },
          { status: 403 }
        );
      }
    }

    await saveServerQuiz(quiz);
    return NextResponse.json({ ok: true, code: quiz.code });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
