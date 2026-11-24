import { NextRequest, NextResponse } from "next/server";
import { getServerBotConfig, saveServerBotConfig } from "@/lib/serverStorage";
import { isAdminRequest, unauthorized } from "@/lib/adminAuth";
import { TelegramBotConfig } from "@/types";
import { setupTelegramWebhook } from "@/lib/telegramBotEngine";

export const dynamic = "force-dynamic";

const publicConfig = (config: TelegramBotConfig, includeAdminFields = false) => ({
  botUsername: config.botUsername,
  webAppUrl: config.webAppUrl || "",
  defaultTimePerQuestion: config.defaultTimePerQuestion ?? 30,
  webhookUrl: config.webhookUrl || "",
  hasBotToken: Boolean(config.botToken),
  hasWebhookSecret: Boolean(config.webhookSecret),
  pollDelayMs: config.pollDelayMs ?? 400,
  // Internal routing details are only shown to an authenticated admin.
  ...(includeAdminFields
    ? {
        adminTelegramId: config.adminTelegramId || "",
        targetGroupId: config.targetGroupId || "",
      }
    : {}),
});

export async function GET(req: NextRequest) {
  const config = await getServerBotConfig();
  // Never return the raw bot token or webhook secret to the browser, even to
  // an authenticated admin. The UI only needs to know whether they exist.
  return NextResponse.json(publicConfig(config, isAdminRequest(req)));
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorized();

  try {
    const body: (Partial<TelegramBotConfig> & {
      setupMenuButton?: boolean;
    }) = await req.json();
    const current = await getServerBotConfig();

    const next: TelegramBotConfig = {
      ...current,
      botUsername:
        String(body.botUsername ?? current.botUsername ?? "").trim() ||
        current.botUsername,
      adminTelegramId: String(
        body.adminTelegramId ?? current.adminTelegramId ?? ""
      ).trim(),
      webAppUrl: String(body.webAppUrl ?? current.webAppUrl ?? "").trim(),
      defaultTimePerQuestion: Math.max(
        10,
        Math.min(
          600,
          Number(body.defaultTimePerQuestion ?? current.defaultTimePerQuestion)
        ) || 30
      ),
      targetGroupId: String(
        body.targetGroupId ?? current.targetGroupId ?? ""
      ).trim(),
      webhookUrl: String(body.webhookUrl ?? current.webhookUrl ?? "").trim(),
      pollDelayMs: Math.max(
        150,
        Math.min(
          10000,
          Number(body.pollDelayMs ?? current.pollDelayMs) || 400
        )
      ),
    };

    // Blank values never overwrite an existing secret/token. This lets the
    // admin panel show "configured" without ever receiving the raw token.
    const incomingToken = String(body.botToken ?? "").trim();
    const tokenChanged = Boolean(incomingToken && incomingToken !== current.botToken);
    next.botToken = incomingToken || current.botToken;
    const incomingSecret = String(body.webhookSecret ?? "").trim();
    next.webhookSecret =
      incomingSecret ||
      current.webhookSecret ||
      process.env.TELEGRAM_WEBHOOK_SECRET ||
      "";

    await saveServerBotConfig(next);

    let webhookResult: any = null;
    if (tokenChanged && next.botToken) {
      try {
        if (current.botToken && current.botToken !== next.botToken) {
          await fetch(`https://api.telegram.org/bot${current.botToken}/deleteWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drop_pending_updates: true }),
          }).catch(() => {});
        }
        const origin =
          req.nextUrl?.origin ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://dailyquizeblitz.vercel.app";
        webhookResult = await setupTelegramWebhook(next, origin, "set");
      } catch (err: any) {
        console.warn("[config] Auto webhook setup error:", err);
      }
    }

    let menuResult: any = null;

    if (body.setupMenuButton && next.botToken) {
      const targetAppUrl =
        next.webAppUrl ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (req.nextUrl ? req.nextUrl.origin : "");

      if (targetAppUrl && targetAppUrl.startsWith("https://")) {
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${next.botToken}/setChatMenuButton`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                menu_button: {
                  type: "web_app",
                  text: "MCQ Master",
                  web_app: { url: targetAppUrl },
                },
              }),
            }
          );
          menuResult = await res.json();
        } catch (err: any) {
          console.warn("Could not set chat menu button:", err);
          menuResult = { ok: false, description: err.message };
        }
      } else {
        menuResult = {
          ok: false,
          description:
            "Telegram WebApp requires HTTPS. Use ngrok or deploy to Vercel/Render for the menu button.",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      config: publicConfig(next, true),
      menuResult,
      webhookResult,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
