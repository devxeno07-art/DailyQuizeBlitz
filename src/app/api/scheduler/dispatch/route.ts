import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import { getAllServerSchedules } from "@/lib/serverStorage";
import { dispatchSchedule } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/scheduler/dispatch
 * Body: { id: string } or { schedule: ScheduledDailyTest }
 * Immediately builds and launches a scheduled test (admin only).
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  try {
    const body = await req.json();
    let schedule = body?.schedule;

    if (!schedule) {
      const id = String(body?.id || "");
      if (!id) {
        return NextResponse.json(
          { ok: false, error: "Schedule id is required" },
          { status: 400 }
        );
      }
      const schedules = await getAllServerSchedules();
      schedule = schedules.find((s) => s.id === id);
      if (!schedule) {
        return NextResponse.json(
          { ok: false, error: "Schedule not found" },
          { status: 404 }
        );
      }
    }

    const result = await dispatchSchedule(schedule, {
      force: true,
      hostOrigin: req.nextUrl?.origin,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Dispatch failed" },
      { status: 500 }
    );
  }
}
