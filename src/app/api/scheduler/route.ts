import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  deleteServerSchedule,
  getAllServerSchedules,
  saveServerSchedule,
} from "@/lib/serverStorage";
import { ScheduledDailyTest } from "@/types";

export const dynamic = "force-dynamic";

const sanitizeSchedule = (
  body: any,
  existing?: ScheduledDailyTest
): ScheduledDailyTest => {
  const now = new Date().toISOString();
  let mode: ScheduledDailyTest["mode"] = "all_mixed";
  if (body?.mode === "specific_test") {
    mode = "specific_test";
  } else if (body?.mode === "subject_wise") {
    mode = "subject_wise";
  } else if (existing?.mode) {
    mode = existing.mode;
  }

  const scheduledTime = String(
    body?.scheduledTime ?? existing?.scheduledTime ?? "21:00"
  ).trim();

  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
    throw new Error("Invalid scheduledTime, expected HH:mm");
  }

  const shuffleQuestions =
    body?.shuffleQuestions !== undefined
      ? Boolean(body.shuffleQuestions)
      : existing?.shuffleQuestions !== undefined
      ? Boolean(existing.shuffleQuestions)
      : true;

  const selectedSubjectsRaw =
    mode === "all_mixed"
      ? Array.isArray(body?.selectedSubjects)
        ? body.selectedSubjects
        : existing?.selectedSubjects
      : undefined;

  const selectedSubjects =
    Array.isArray(selectedSubjectsRaw) && selectedSubjectsRaw.length > 0
      ? Array.from(
          new Set(
            selectedSubjectsRaw
              .map((s: any) => String(s || "").trim().slice(0, 120))
              .filter(Boolean)
          )
        ).slice(0, 50)
      : undefined;

  const reminderRaw =
    body?.reminderMinutesBefore !== undefined
      ? Number(body.reminderMinutesBefore)
      : existing?.reminderMinutesBefore;

  return {
    id:
      String(body?.id ?? existing?.id ?? "").trim() ||
      `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title:
      String(body?.title ?? existing?.title ?? "").trim().slice(0, 200) ||
      "ડેઇલી મોક ટેસ્ટ",
    mode,
    subject:
      mode === "subject_wise"
        ? String(body?.subject ?? existing?.subject ?? "").trim().slice(0, 120)
        : mode === "all_mixed" && selectedSubjects && selectedSubjects.length > 0
        ? selectedSubjects.join(", ").slice(0, 180)
        : "",
    selectedSubjects,
    specificTestCode:
      mode === "specific_test"
        ? String(body?.specificTestCode ?? existing?.specificTestCode ?? "")
            .trim()
            .toUpperCase()
        : undefined,
    specificPaperId:
      mode === "specific_test"
        ? String(body?.specificPaperId ?? existing?.specificPaperId ?? "").trim()
        : undefined,
    shuffleQuestions,
    useSetProgression:
      mode === "specific_test"
        ? Boolean(body?.useSetProgression ?? existing?.useSetProgression)
        : false,
    currentSetIndex:
      body?.currentSetIndex !== undefined
        ? Math.max(0, Number(body.currentSetIndex) || 0)
        : existing?.currentSetIndex || 0,
    totalPaperQuestions:
      body?.totalPaperQuestions !== undefined
        ? Number(body.totalPaperQuestions) || undefined
        : existing?.totalPaperQuestions,
    questionCount: Math.max(
      1,
      Math.min(
        500,
        Number(body?.questionCount ?? existing?.questionCount) || 20
      )
    ),
    timePerQuestion: Math.max(
      10,
      Math.min(
        600,
        Number(body?.timePerQuestion ?? existing?.timePerQuestion) || 30
      )
    ),
    scheduledTime,
    isActive: Boolean(body?.isActive ?? existing?.isActive ?? true),
    targetGroupId: String(
      body?.targetGroupId ?? existing?.targetGroupId ?? ""
    ).trim(),
    reminderMinutesBefore:
      reminderRaw !== undefined && Number.isFinite(reminderRaw)
        ? Math.max(0, Math.min(240, reminderRaw))
        : 60,
    lastRunAt:
      existing && scheduledTime !== existing.scheduledTime
        ? undefined
        : existing?.lastRunAt,
    lastRunDay:
      existing && scheduledTime !== existing.scheduledTime
        ? undefined
        : existing?.lastRunDay,
    lastGeneratedCode: existing?.lastGeneratedCode,
    createdAt: existing?.createdAt || now,
  };
};

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();
  const schedules = await getAllServerSchedules();
  return NextResponse.json({ ok: true, schedules });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  try {
    const body = await req.json();
    const id = String(body?.id || "");
    const schedules = await getAllServerSchedules();
    const existing = id ? schedules.find((s) => s.id === id) : undefined;
    const schedule = sanitizeSchedule(body, existing);
    await saveServerSchedule(schedule);
    return NextResponse.json({ ok: true, schedule });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Invalid schedule" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  const id =
    req.nextUrl.searchParams.get("id") ||
    (await req
      .json()
      .then((body) => String(body?.id || ""))
      .catch(() => ""));

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Schedule id is required" },
      { status: 400 }
    );
  }

  await deleteServerSchedule(id);
  return NextResponse.json({ ok: true });
}
