import { NextRequest, NextResponse } from "next/server";
import { getTelegramQuizByCode, saveTelegramQuiz } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code;
    if (!code) {
      return NextResponse.json({ error: "Quiz code is required" }, { status: 400 });
    }

    const quiz = await getTelegramQuizByCode(code);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found with code " + code }, { status: 404 });
    }

    return NextResponse.json({ success: true, quiz });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch quiz" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const body = await req.json();
    if (!body || !body.questions || body.questions.length === 0) {
      return NextResponse.json({ error: "Invalid quiz payload" }, { status: 400 });
    }

    await saveTelegramQuiz(body);
    return NextResponse.json({ success: true, code: body.code });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to save quiz" }, { status: 500 });
  }
}
