import { NextRequest, NextResponse } from "next/server";
import { saveServerQuiz } from "@/lib/serverStorage";
import { TelegramQuiz } from "@/types";

export const dynamic = "force-dynamic";

const MAX_QUESTIONS = 500;

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

    await saveServerQuiz(quiz);
    return NextResponse.json({ ok: true, code: quiz.code });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
