import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  getAllServerQuizzes,
  getAllServerPapers,
  saveServerQuiz,
  saveServerPapersBatch,
  saveServerUser,
  normalizeUserId,
} from "@/lib/serverStorage";
import { Paper, TelegramQuiz } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KV_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";

const readRedisKeyRaw = async (
  key: string
): Promise<{ ok: boolean; value?: any; error?: string; quotaBlocked?: boolean }> => {
  if (!KV_URL || !KV_TOKEN) {
    return { ok: false, error: "Upstash Redis URL/Token not configured" };
  }
  try {
    const res = await fetch(
      `${KV_URL.replace(/\/$/, "")}/get/${encodeURIComponent("gsrtc:" + key)}`,
      {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      result?: string | null;
      error?: string;
    };
    if (!res.ok || data.error) {
      const err = data.error || `HTTP ${res.status}`;
      const lower = err.toLowerCase();
      return {
        ok: false,
        error: err,
        quotaBlocked:
          lower.includes("limit") ||
          lower.includes("quota") ||
          lower.includes("fixed plan"),
      };
    }
    if (!data.result) return { ok: true, value: null };
    return { ok: true, value: JSON.parse(data.result) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Redis connection failed" };
  }
};

const importItemsToSupabase = async (
  items: any[]
): Promise<{ quizzesImported: number; papersImported: number; usersImported: number }> => {
  const papersToBatch: Paper[] = [];
  const extraSubsetQuizzes: TelegramQuiz[] = [];
  const usersSeen = new Set<string>();
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const code = String(item.code || item.testCode || "").trim().toUpperCase();
    const questions = Array.isArray(item.questions) ? item.questions : [];
    const uid = normalizeUserId(String(item.creatorPhone || item.userId || ""));
    const userName = String(item.createdBy || item.userName || "શિક્ષક / વિદ્યાર્થી");
    if (uid && uid !== "server") usersSeen.add(uid);

    const pid = String(item.paperId || item.id || "");
    const isSubset =
      Boolean(item.setMeta) ||
      Boolean(item.parentPaperId) ||
      pid.includes("::set_") ||
      pid.startsWith("sched_");

    if (isSubset && code && questions.length > 0) {
      extraSubsetQuizzes.push({
        code,
        paperId: pid || `server_${code}`,
        parentPaperId: item.parentPaperId,
        setMeta: item.setMeta,
        title: String(item.title || `મોક ટેસ્ટ [${code}]`),
        subject: String(item.subject || item.category || "સામાન્ય જ્ઞાન & કરંટ અફેર્સ"),
        timePerQuestion: Number(item.timePerQuestion) || 30,
        questions,
        createdBy: userName,
        creatorPhone: uid || "server",
        createdAt: item.createdAt || now,
      });
    } else if (!isSubset && (item.id || code)) {
      papersToBatch.push({
        id: String(item.paperId || item.id || `server_${code}`),
        userId: uid || String(item.userId || ""),
        creatorPhone: uid || String(item.creatorPhone || ""),
        userName,
        title: String(item.title || "મોક ટેસ્ટ"),
        subject: String(item.subject || item.category || "સામાન્ય જ્ઞાન & કરંટ અફેર્સ"),
        category: String(item.category || "સ્પર્ધાત્મક પરીક્ષા"),
        targetQuestions: questions.length || Number(item.targetQuestions) || 50,
        timeLimitMinutes:
          Number(item.timeLimitMinutes) ||
          Math.max(10, Math.ceil(((questions.length || 20) * (Number(item.timePerQuestion) || 30)) / 60)),
        isPublic: true,
        testCode: code || undefined,
        questions,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || item.createdAt || now,
      });
    }
  }

  let papersImported = 0;
  let quizzesImported = 0;
  if (papersToBatch.length > 0) {
    const saved = await saveServerPapersBatch(papersToBatch, { alsoSyncQuizzes: true });
    papersImported = saved.length;
    quizzesImported = saved.filter((p) => p.testCode && (p.questions?.length || 0) > 0).length;
  }

  for (const sq of extraSubsetQuizzes) {
    await saveServerQuiz(sq);
    quizzesImported++;
  }

  return { quizzesImported, papersImported, usersImported: usersSeen.size };
};

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  const [quizzesProbe, papersProbe, sbQuizzes, sbPapers] = await Promise.all([
    readRedisKeyRaw("quizzes.json"),
    readRedisKeyRaw("papers.json"),
    getAllServerQuizzes(),
    getAllServerPapers(),
  ]);

  let redisHost = "";
  try {
    if (KV_URL) redisHost = new URL(KV_URL).host;
  } catch {}

  return NextResponse.json({
    ok: true,
    redisHost,
    redisConfigured: Boolean(KV_URL && KV_TOKEN),
    redisBlocked: Boolean(quizzesProbe.quotaBlocked || papersProbe.quotaBlocked),
    redisError: quizzesProbe.ok ? null : quizzesProbe.error,
    redisCounts: {
      quizzes: Array.isArray(quizzesProbe.value) ? quizzesProbe.value.length : 0,
      papers: Array.isArray(papersProbe.value) ? papersProbe.value.length : 0,
    },
    supabaseCounts: {
      quizzes: sbQuizzes.length,
      papers: sbPapers.length,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));

    // Mode 1: Manual JSON paste/upload exported from Upstash Console Data Browser
    if (typeof body?.rawJson === "string" && body.rawJson.trim()) {
      let parsed: any = JSON.parse(body.rawJson.trim());
      // Handle Upstash REST wrapper {"result":"[...]"} if pasted directly
      if (parsed && typeof parsed.result === "string") {
        parsed = JSON.parse(parsed.result);
      } else if (parsed && Array.isArray(parsed.result)) {
        parsed = parsed.result;
      }
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }
      const stats = await importItemsToSupabase(parsed);
      return NextResponse.json({
        ok: true,
        source: "json_upload",
        ...stats,
      });
    }

    // Mode 2: Pull directly from Upstash Redis
    const [quizzesRes, papersRes, usersRes] = await Promise.all([
      readRedisKeyRaw("quizzes.json"),
      readRedisKeyRaw("papers.json"),
      readRedisKeyRaw("users.json"),
    ]);

    if (!quizzesRes.ok && !papersRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          quotaBlocked: Boolean(quizzesRes.quotaBlocked || papersRes.quotaBlocked),
          error:
            quizzesRes.error ||
            papersRes.error ||
            "Upstash Redis is unreachable",
        },
        { status: 503 }
      );
    }

    const combinedItems: any[] = [
      ...(Array.isArray(quizzesRes.value) ? quizzesRes.value : []),
      ...(Array.isArray(papersRes.value) ? papersRes.value : []),
    ];

    if (Array.isArray(usersRes.value)) {
      for (const u of usersRes.value) {
        if (u && (u.id || u.phoneNumber)) {
          await saveServerUser(u).catch(() => {});
        }
      }
    }

    const stats = await importItemsToSupabase(combinedItems);
    return NextResponse.json({
      ok: true,
      source: "upstash_redis",
      ...stats,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Migration failed" },
      { status: 400 }
    );
  }
}
