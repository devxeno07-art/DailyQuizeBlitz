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
  const mode: ScheduledDailyTest["mode"] =
    body?.mode === "subject_wise" ? "subject_wise" : "all_mixed";
  const scheduledTime = String(
    body?.scheduledTime ?? existing?.scheduledTime ?? "21:00"
  ).trim();

  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
    throw new Error("Invalid scheduledTime, expected HH:mm");
  }

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
        : "",
    questionCount: Math.max(
      1,
      Math.min(
        200,
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
    lastRunAt: existing?.lastRunAt,
    lastRunDay: existing?.lastRunDay,
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
