import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  getAllServerPapers,
  getAllServerQuizzes,
  getAllServerUsers,
  normalizeUserId,
  saveServerUser,
  toggleServerUserLibraryAccess,
} from "@/lib/serverStorage";
import { Paper, UserProfile } from "@/types";

export const dynamic = "force-dynamic";

const buildUnifiedServerPapers = async (): Promise<Paper[]> => {
  const [serverPapers, quizzes] = await Promise.all([
    getAllServerPapers(),
    getAllServerQuizzes(),
  ]);

  const map = new Map<string, Paper>();

  for (const p of serverPapers) {
    const key = p.id || (p.testCode ? p.testCode.toUpperCase() : "");
    if (!key) continue;
    map.set(key, p);
  }

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

    const mapped: Paper = {
      id: q.paperId || `server_${q.code}`,
      userId: normalizeUserId(q.creatorPhone || ""),
      creatorPhone: normalizeUserId(q.creatorPhone || ""),
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

    const existing =
      map.get(mapped.id) ||
      Array.from(map.values()).find(
        (item) =>
          mapped.testCode &&
          item.testCode &&
          item.testCode.toUpperCase() === mapped.testCode.toUpperCase()
      );

    if (!existing) {
      map.set(mapped.id, mapped);
    } else if (
      (mapped.questions?.length || 0) > (existing.questions?.length || 0)
    ) {
      map.set(existing.id, {
        ...mapped,
        id: existing.id,
        userId: existing.userId || mapped.userId,
        userName: existing.userName || mapped.userName,
      });
    }
  }

  return Array.from(map.values());
};

export async function GET(req: NextRequest) {
  try {
    const phoneParam = req.nextUrl.searchParams.get("phone");

    // Public single-user lookup by exact phone/id (for cross-device login & Library permission sync)
    if (phoneParam) {
      const cleanId = normalizeUserId(phoneParam);
      if (!cleanId) {
        return NextResponse.json({ ok: true, user: null });
      }
      const allUsers = await getAllServerUsers();
      const found =
        allUsers.find(
          (u) => normalizeUserId(u.id || u.phoneNumber) === cleanId
        ) || null;
      return NextResponse.json({ ok: true, user: found });
    }

    // Full registered user list is Admin-only
    if (!isAdminRequest(req)) {
      return unauthorized();
    }

    const [storedUsers, unifiedPapers] = await Promise.all([
      getAllServerUsers(),
      buildUnifiedServerPapers(),
    ]);

    const userMap = new Map<string, UserProfile>();
    for (const u of storedUsers) {
      const uid = normalizeUserId(u.id || u.phoneNumber);
      if (!uid) continue;
      userMap.set(uid, {
        ...u,
        id: uid,
        phoneNumber: uid,
      });
    }

    // Also include any paper creators who saved quizzes before /api/users existed
    for (const p of unifiedPapers) {
      const uid = normalizeUserId(p.userId || p.creatorPhone || "");
      if (!uid || uid === "server") continue;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          id: uid,
          phoneNumber: uid,
          name: p.userName || "શિક્ષક / વિદ્યાર્થી",
          createdAt: p.createdAt || new Date().toISOString(),
          lastActive: p.updatedAt || p.createdAt || new Date().toISOString(),
          hasLibraryAccess: false,
        });
      }
    }

    // Attach accurate paper & question counts per user
    const enriched = Array.from(userMap.values()).map((u) => {
      const userPapers = unifiedPapers.filter(
        (p) => normalizeUserId(p.userId || p.creatorPhone || "") === u.id
      );
      const totalQ = userPapers.reduce(
        (sum, p) => sum + (p.questions?.length || 0),
        0
      );
      return {
        ...u,
        papersCount: userPapers.length,
        questionsCount: totalQ,
      };
    });

    enriched.sort(
      (a, b) =>
        new Date(b.lastActive || 0).getTime() -
        new Date(a.lastActive || 0).getTime()
    );

    return NextResponse.json({ ok: true, users: enriched });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load users" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawPhone = String(body?.phoneNumber || body?.id || "").trim();
    const cleanId = normalizeUserId(rawPhone);
    const name = String(body?.name || "").trim();

    if (!cleanId) {
      return NextResponse.json(
        { ok: false, error: "Phone number / user ID is required" },
        { status: 400 }
      );
    }

    const saved = await saveServerUser({
      id: cleanId,
      phoneNumber: cleanId,
      name: name || "વિદ્યાર્થી",
      createdAt: body?.createdAt || new Date().toISOString(),
      lastActive: body?.lastActive || new Date().toISOString(),
      hasLibraryAccess: body?.hasLibraryAccess,
      papersCount: body?.papersCount,
      questionsCount: body?.questionsCount,
    });

    return NextResponse.json({ ok: true, user: saved });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to register user" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return unauthorized();
  }

  try {
    const body = await req.json();
    const userId = normalizeUserId(String(body?.userId || body?.id || ""));
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId is required" },
        { status: 400 }
      );
    }

    let updated = await toggleServerUserLibraryAccess(userId);
    if (!updated) {
      // If user existed only via papers, materialize and grant library access
      updated = await saveServerUser({
        id: userId,
        phoneNumber: userId,
        name: String(body?.name || "વિદ્યાર્થી"),
        hasLibraryAccess: true,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
