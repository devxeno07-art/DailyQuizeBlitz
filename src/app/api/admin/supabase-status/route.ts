import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import {
  testSupabaseConnection,
  getAdminPasswordFromSupabase,
  setAdminPasswordInSupabase,
  SUPABASE_URL,
  SUPABASE_SETUP_SQL,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return unauthorized();
  }

  try {
    const test = await testSupabaseConnection();
    const currentPin = await getAdminPasswordFromSupabase();

    return NextResponse.json({
      ok: true,
      supabaseUrl: SUPABASE_URL,
      connected: test.ok,
      tableExists: test.tableExists,
      hasPinInSupabase: test.hasPin,
      currentPin: currentPin || null,
      latencyMs: test.latencyMs,
      error: test.error,
      setupSql: SUPABASE_SETUP_SQL,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to inspect Supabase" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return unauthorized();
  }

  try {
    const body = await req.json();
    const newPin = String(body?.pin || "").trim();

    if (!newPin || newPin.length < 3 || newPin.length > 64) {
      return NextResponse.json(
        { ok: false, error: "Password / PIN must be between 3 and 64 characters." },
        { status: 400 }
      );
    }

    const result = await setAdminPasswordInSupabase(newPin);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || "Failed to save password in Supabase" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Admin password successfully saved in Supabase!",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
