import { NextRequest, NextResponse } from "next/server";
import {
  getAllServerQuizzes,
  getAllServerPapers,
  saveServerPaper,
  saveServerPapersBatch,
  deleteServerQuiz,
  deleteServerPaperRecord,
  getServerQuizByCode,
  normalizeUserId,
} from "@/lib/serverStorage";
import { isAdminRequest } from "@/lib/adminAuth";
import { Paper } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const filterUserId = normalizeUserId(
      req.nextUrl.searchParams.get("userId") || ""
    );

    const [serverPapers, quizzes] = await Promise.all([
      getAllServerPapers(),
      getAllServerQuizzes(),
    ]);

    const map = new Map<string, Paper>();

    // 1. Seed with full server papers (includes 0-question and >500-question papers)
    for (const p of serverPapers) {
      const uid = normalizeUserId(p.userId || p.creatorPhone || "");
      const key = p.id || `${p.title}_${uid}`;
      map.set(key, {
        ...p,
        userId: uid || p.userId,
        creatorPhone: uid || p.creatorPhone,
      });
    }

    // 2. Merge master quizzes from Telegram quiz store without losing questions
    for (const q of quizzes) {
      const pid = String(q.paperId || "");
      if (
        q.setMeta ||
        q.parentPaperId ||
        pid.includes("::set_") ||
        pid.startsWith("sched_")
      ) {
        continue;
      }

      const creatorId = normalizeUserId(q.creatorPhone || "");
      const mapped: Paper = {
        id: q.paperId || `server_${q.code}`,
        userId: creatorId,
        creatorPhone: creatorId,
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
      };

      const byId = map.get(mapped.id);
      const byCode = !byId && mapped.testCode
        ? Array.from(map.values()).find(
            (item) =>
              item.testCode &&
              item.testCode.toUpperCase() === mapped.testCode!.toUpperCase()
          )
        : undefined;
      const existing = byId || byCode;

      if (!existing) {
        map.set(mapped.id, mapped);
      } else if (
        (mapped.questions?.length || 0) > (existing.questions?.length || 0)
      ) {
        map.set(existing.id, {
          ...existing,
          questions: mapped.questions,
          targetQuestions: mapped.questions.length,
          testCode: existing.testCode || mapped.testCode,
          userId: existing.userId || mapped.userId,
          userName: existing.userName || mapped.userName,
          updatedAt:
            new Date(mapped.updatedAt || 0).getTime() >
            new Date(existing.updatedAt || 0).getTime()
              ? mapped.updatedAt
              : existing.updatedAt,
        });
      }
    }

    let papers = Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    );

    if (filterUserId) {
      papers = papers.filter(
        (p) => normalizeUserId(p.userId || p.creatorPhone || "") === filterUserId
      );
    }

    // Ultra-fast metadata mode for client delta sync (excludes heavy question arrays)
    if (req.nextUrl.searchParams.get("meta") === "1") {
      const meta = papers.map((p) => ({
        id: p.id,
        userId: p.userId,
        testCode: p.testCode,
        updatedAt: p.updatedAt,
        questionCount: p.questions?.length || 0,
      }));
      return NextResponse.json({ ok: true, meta, total: meta.length });
    }

    // Payload-safe auto-chunking so Vercel never hits 4.5MB FUNCTION_PAYLOAD_TOO_LARGE
    // even when 50–200+ large exams exist in Supabase.
    const MAX_RESPONSE_BYTES = 3_200_000;
    const rawOffset = Number(req.nextUrl.searchParams.get("offset") || 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

    const total = papers.length;
    const chunk: Paper[] = [];
    let runningBytes = 0;

    for (let i = offset; i < papers.length; i++) {
      const p = papers[i];
      const approxBytes = Buffer.byteLength(JSON.stringify(p), "utf8");
      if (chunk.length > 0 && runningBytes + approxBytes > MAX_RESPONSE_BYTES) {
        break;
      }
      chunk.push(p);
      runningBytes += approxBytes;
    }

    const nextOffset = offset + chunk.length;
    const hasMore = nextOffset < total;

    return NextResponse.json({
      ok: true,
      papers: chunk,
      total,
      offset,
      nextOffset,
      hasMore,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch papers" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body && Array.isArray(body.papers)) {
      const saved = await saveServerPapersBatch(body.papers, {
        alsoSyncQuizzes: Boolean(body.alsoSyncQuizzes ?? true),
      });
      return NextResponse.json({ ok: true, count: saved.length });
    }

    const paper: Paper = body;
    if (!paper || !paper.id) {
      return NextResponse.json(
        { ok: false, error: "Invalid paper payload" },
        { status: 400 }
      );
    }

    const saved = await saveServerPaper(paper);
    return NextResponse.json({ ok: true, paper: saved });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to save paper" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const code = searchParams.get("code") || "";
    const userPhone = normalizeUserId(searchParams.get("userPhone") || "");

    if (!id && !code) {
      return NextResponse.json(
        { ok: false, error: "Missing paper ID or test code" },
        { status: 400 }
      );
    }

    if (code) {
      const existing = await getServerQuizByCode(code);
      const isAdmin = isAdminRequest(req);
      if (existing && !isAdmin && userPhone) {
        const owner = normalizeUserId(existing.creatorPhone || "");
        if (owner && owner !== userPhone) {
          return NextResponse.json(
            { ok: false, error: "Only the author can delete this paper" },
            { status: 403 }
          );
        }
      }
    }

    const [deletedPaper, deletedQuizByCode, deletedQuizById] = await Promise.all([
      deleteServerPaperRecord(id, code),
      code ? deleteServerQuiz(code) : Promise.resolve(false),
      id ? deleteServerQuiz(id) : Promise.resolve(false),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: Boolean(deletedPaper || deletedQuizByCode || deletedQuizById),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to delete server paper" },
      { status: 500 }
    );
  }
}
