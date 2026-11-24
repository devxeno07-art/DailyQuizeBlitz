import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminToken,
  verifyAdminPin,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Very small in-memory brute-force guard (per server instance).
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const getClientKey = (req: NextRequest): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "local";

export async function POST(req: NextRequest) {
  const key = getClientKey(req);
  const now = Date.now();
  const record = attempts.get(key);

  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      {
        ok: false,
        error: "ઘણા ખોટા પ્રયાસો. 10 મિનિટ પછી ફરી પ્રયાસ કરો.",
      },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const isValid = await verifyAdminPin(String(body?.pin || ""));
    if (!isValid) {
      const next =
        record && record.resetAt > now
          ? { count: record.count + 1, resetAt: record.resetAt }
          : { count: 1, resetAt: now + WINDOW_MS };
      attempts.set(key, next);
      return NextResponse.json(
        { ok: false, error: "ખોટો Admin Password / PIN." },
        { status: 401 }
      );
    }

    attempts.delete(key);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, createAdminToken(), adminCookieOptions());
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Invalid request" },
      { status: 400 }
    );
  }
}
