import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  deletePaperSetDispatch,
  getAllPaperSetDispatches,
  getAllServerQuizzes,
  getPaperSetDispatchesFor,
  getServerBotConfig,
  resetPaperSetDispatches,
  savePaperSetDispatch,
  saveServerQuiz,
} from "@/lib/serverStorage";
import { dispatchQuizToChat } from "@/lib/telegramBotEngine";
import { PaperSetDispatchRecord, Question, TelegramQuiz } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const shuffleQuestions = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const paperId = searchParams.get("paperId") || undefined;
    const testCode = searchParams.get("testCode") || undefined;

    const records =
      paperId || testCode
        ? await getPaperSetDispatchesFor(paperId, testCode)
        : await getAllPaperSetDispatches();

    return NextResponse.json({ ok: true, records });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch set progress" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "").trim();

    if (action === "record_quiz_set") {
      const paperId = String(body?.paperId || "").trim();
      const setNumber = Math.max(1, Number(body?.setNumber) || 1);
      const setSize = Math.max(1, Number(body?.setSize) || 30);
      const totalSets = Math.max(1, Number(body?.totalSets) || 1);
      const startQuestion = Math.max(1, Number(body?.startQuestion) || 1);
      const endQuestion = Math.max(startQuestion, Number(body?.endQuestion) || startQuestion);
      const quizCode = String(body?.quizCode || "").trim().toUpperCase();
      const testCode = String(body?.testCode || "").trim().toUpperCase() || undefined;

      if (!paperId) {
        return NextResponse.json(
          { ok: false, error: "paperId is required" },
          { status: 400 }
        );
      }

      const keyBase = testCode || paperId;
      const record: PaperSetDispatchRecord = {
        id: `${keyBase}::${setSize}::${setNumber}`,
        paperId,
        testCode,
        setSize,
        setNumber,
        totalSets,
        startQuestion,
        endQuestion,
        quizCode: quizCode || undefined,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: String(body?.dispatchedBy || "Quiz Creator").slice(0, 80),
      };

      await savePaperSetDispatch(record);
      return NextResponse.json({ ok: true, record });
    }

    // All administrative actions require Admin auth
    if (!isAdminRequest(req)) return unauthorized();

    if (action === "mark_done") {
      const paperId = String(body?.paperId || "").trim();
      const testCode = String(body?.testCode || "").trim().toUpperCase() || undefined;
      const setSize = Math.max(1, Number(body?.setSize) || 30);
      const setNumber = Math.max(1, Number(body?.setNumber) || 1);
      const totalSets = Math.max(1, Number(body?.totalSets) || 1);
      const startQuestion = Math.max(1, Number(body?.startQuestion) || 1);
      const endQuestion = Math.max(startQuestion, Number(body?.endQuestion) || startQuestion);

      const keyBase = testCode || paperId;
      const record: PaperSetDispatchRecord = {
        id: `${keyBase}::${setSize}::${setNumber}`,
        paperId,
        testCode,
        setSize,
        setNumber,
        totalSets,
        startQuestion,
        endQuestion,
        quizCode: body?.quizCode ? String(body.quizCode).toUpperCase() : undefined,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: "Admin (Manual)",
      };
      await savePaperSetDispatch(record);
      return NextResponse.json({ ok: true, record });
    }

    if (action === "mark_pending") {
      const id = String(body?.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { ok: false, error: "Record id is required" },
          { status: 400 }
        );
      }
      await deletePaperSetDispatch(id);
      return NextResponse.json({ ok: true });
    }

    if (action === "reset") {
      const paperId = String(body?.paperId || "").trim() || undefined;
      const testCode = String(body?.testCode || "").trim().toUpperCase() || undefined;
      const setSize = body?.setSize ? Number(body.setSize) : undefined;
      await resetPaperSetDispatches(paperId, testCode, setSize);
      return NextResponse.json({ ok: true });
    }

    if (action === "dispatch_set") {
      const paperId = String(body?.paperId || "").trim();
      const testCode = String(body?.testCode || "").trim().toUpperCase();
      const setSize = Math.max(1, Number(body?.setSize) || 30);
      const setNumber = Math.max(1, Number(body?.setNumber) || 1);
      const startIndex = Math.max(0, Number(body?.startIndex) || 0);
      const endIndex = Math.max(startIndex + 1, Number(body?.endIndex) || startIndex + setSize);
      const timePerQuestion = Math.max(5, Math.min(600, Number(body?.timePerQuestion) || 30));
      const shouldShuffle = Boolean(body?.shuffle);

      const botConfig = await getServerBotConfig();
      const targetGroupId = String(
        body?.targetGroupId || botConfig.targetGroupId || ""
      ).trim();

      if (!targetGroupId) {
        return NextResponse.json(
          {
            ok: false,
            error: "કોઈ ટાર્ગેટ ગ્રૂપ ID સેટ નથી. કૃપા કરીને ગ્રૂપ સિલેક્ટ કરો.",
          },
          { status: 400 }
        );
      }

      const quizzes = await getAllServerQuizzes();
      const matched = quizzes.find(
        (q) =>
          (Boolean(testCode) && q.code?.toUpperCase() === testCode) ||
          (Boolean(paperId) && q.paperId === paperId)
      );

      const sourceQuestions: Question[] =
        matched?.questions?.length
          ? matched.questions
          : Array.isArray(body?.fallbackQuestions)
          ? body.fallbackQuestions
          : [];

      if (sourceQuestions.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "આ પેપરના પ્રશ્નો સર્વર પર મળ્યા નથી.",
          },
          { status: 404 }
        );
      }

      const totalSets = Math.ceil(sourceQuestions.length / setSize);
      const sliced = sourceQuestions.slice(startIndex, endIndex);
      if (sliced.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "આ સેટ માટે પ્રશ્નો ઉપલબ્ધ નથી.",
          },
          { status: 400 }
        );
      }

      const orderedQuestions = (shouldShuffle ? shuffleQuestions(sliced) : sliced).map(
        (q, i) => ({
          ...q,
          questionNumber: i + 1,
        })
      );

      const existingCodes = new Set(quizzes.map((q) => q.code.toUpperCase()));
      const basePrefix =
        (testCode?.replace(/-\d+$/, "").replace(/[^A-Z0-9]/g, "").slice(0, 6) ||
          "SET");
      let code = `${basePrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      for (let i = 0; i < 20; i++) {
        if (!existingCodes.has(code)) break;
        code = `${basePrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const baseTitle = String(body?.paperTitle || matched?.title || "મોક ટેસ્ટ").trim();
      const subjectLabel = String(body?.subject || matched?.subject || baseTitle).trim();
      const startQ = startIndex + 1;
      const endQ = Math.min(sourceQuestions.length, startIndex + sliced.length);

      const setQuiz: TelegramQuiz = {
        code,
        paperId: `${paperId || testCode}::set_${setSize}_${setNumber}`,
        parentPaperId: paperId || matched?.paperId,
        setMeta: {
          setNumber,
          totalSets,
          setSize,
          startQuestion: startQ,
          endQuestion: endQ,
        },
        title: `${baseTitle} [Set ${setNumber}/${totalSets} • Q${startQ}-${endQ}]`,
        subject: subjectLabel,
        timePerQuestion,
        questions: orderedQuestions,
        createdBy: "Admin Set Dispatcher",
        creatorPhone: "server",
        createdAt: new Date().toISOString(),
      };

      await saveServerQuiz(setQuiz);

      const result = await dispatchQuizToChat({
        quiz: setQuiz,
        chatId: targetGroupId,
        chatTitle: setQuiz.title,
        hostOrigin: req.nextUrl?.origin,
        startedBy: { id: "0", name: "Admin Set Dispatcher" },
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error || "Telegram ગ્રૂપમાં ટેસ્ટ શરૂ થઈ શકી નહીં." },
          { status: 400 }
        );
      }

      const keyBase = testCode || paperId;
      const record: PaperSetDispatchRecord = {
        id: `${keyBase}::${setSize}::${setNumber}`,
        paperId: paperId || matched?.paperId || testCode,
        testCode: testCode || undefined,
        setSize,
        setNumber,
        totalSets,
        startQuestion: startQ,
        endQuestion: endQ,
        quizCode: setQuiz.code,
        groupId: targetGroupId,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: "Admin",
      };
      await savePaperSetDispatch(record);

      return NextResponse.json({
        ok: true,
        quiz: setQuiz,
        record,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Set action failed" },
      { status: 500 }
    );
  }
}
