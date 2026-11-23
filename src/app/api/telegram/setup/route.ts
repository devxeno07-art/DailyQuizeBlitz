import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import { getServerBotConfig } from "@/lib/serverStorage";
import { setupTelegramWebhook } from "@/lib/telegramBotEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/setup
 * Body: { action: "set" | "delete" | "info" }
 * Admin-only helper to manage the Telegram webhook from the dashboard.
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "info");
    if (!["set", "delete", "info", "test"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    const config = await getServerBotConfig();
    const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";

    if (action === "test") {
      if (!token) {
        return NextResponse.json(
          { ok: false, error: "બોટ ટોકન કન્ફિગર થયેલ નથી." },
          { status: 400 }
        );
      }
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          cache: "no-store",
        });
        const data = await res.json();
        return NextResponse.json({
          ok: Boolean(data.ok),
          botUsername: data.ok ? data.result?.username : undefined,
          botName: data.ok ? data.result?.first_name : undefined,
          error: data.ok ? undefined : data.description,
        });
      } catch (err: any) {
        return NextResponse.json(
          { ok: false, error: err?.message || "Network error" },
          { status: 500 }
        );
      }
    }

    const result = await setupTelegramWebhook(
      config,
      req.nextUrl?.origin,
      action as "set" | "delete" | "info"
    );

    return NextResponse.json({
      ok: result.ok,
      action: result.action,
      url: result.url,
      secretConfigured: Boolean(result.secret || config.webhookSecret),
      result: result.result,
      error: result.error,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Webhook setup failed" },
      { status: 500 }
    );
  }
}
