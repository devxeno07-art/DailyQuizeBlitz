import { NextRequest, NextResponse } from "next/server";
import { getServerQuizByCode, saveServerQuiz } from "@/lib/serverStorage";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code;
    if (!code) {
      return NextResponse.json(
        { error: "Quiz code is required" },
        { status: 400 }
      );
    }

    const quiz = await getServerQuizByCode(code);
    if (!quiz) {
      return NextResponse.json(
        { error: "Quiz not found with code " + code },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, quiz });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch quiz" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  // Editing an existing quiz is an admin-only operation.
  if (!isAdminRequest(req)) return unauthorized();

  try {
    const body = await req.json();
    if (!body || !Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json(
        { error: "Invalid quiz payload" },
        { status: 400 }
      );
    }

    await saveServerQuiz({ ...body, code: body.code || params.code });
    return NextResponse.json({ success: true, code: body.code || params.code });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save quiz" },
      { status: 500 }
    );
  }
}
