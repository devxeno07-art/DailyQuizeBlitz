import { NextRequest, NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/telegramBotEngine";
import { getServerBotConfig } from "@/lib/serverStorage";
import { kvGetJson, kvSetJson, withKeyLock } from "@/lib/kvStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEDUPE_KEY = "webhook_updates.json";
const DEDUPE_LIMIT = 500;

export async function GET() {
  return NextResponse.json({
    status: "online",
    message: "Telegram Quiz & Mini App Webhook Endpoint is ready.",
    usage: "Send POST updates from Telegram Bot API webhook."
  });
}

export async function POST(req: NextRequest) {
  try {
    const config = await getServerBotConfig();
    const expectedSecret =
      config.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || "";

    if (expectedSecret) {
      const received =
        req.headers.get("x-telegram-bot-api-secret-token") || "";
      if (received !== expectedSecret) {
        return NextResponse.json(
          { ok: false, error: "Invalid webhook secret" },
          { status: 401 }
        );
      }
    } else {
      // Fail closed outside local development. Without a secret anyone could
      // POST forged updates (including fake admin commands).
      const hostname = req.nextUrl?.hostname || "";
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
      if (!isLocal) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Webhook secret is not configured. Set TELEGRAM_WEBHOOK_SECRET or configure the webhook from the admin panel.",
          },
          { status: 503 }
        );
      }
    }

    const update = await req.json();
    if (!update || typeof update !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid update payload" },
        { status: 400 }
      );
    }

    // Idempotency: Telegram retries webhook deliveries, so ignore updates
    // we've already handled. Poll answers may legitimately repeat when a
    // user changes their answer, so never dedupe those.
    const updateId = Number(update.update_id || 0);
    if (updateId > 0 && !update.poll_answer) {
      const duplicate = await withKeyLock(DEDUPE_KEY, async () => {
        const recent = await kvGetJson<number[]>(DEDUPE_KEY, []);
        if (recent.includes(updateId)) return true;
        await kvSetJson(
          DEDUPE_KEY,
          [updateId, ...recent].slice(0, DEDUPE_LIMIT)
        );
        return false;
      });
      if (duplicate) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

    const hostOrigin = req.nextUrl?.origin;
    const result = await processTelegramUpdate(update, hostOrigin);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("Telegram Webhook Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
