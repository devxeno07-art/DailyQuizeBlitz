import { NextRequest, NextResponse } from "next/server";
import { getServerBotConfig } from "@/lib/serverStorage";
import {
  processTelegramUpdate,
  finalizeDueSessions,
} from "@/lib/telegramBotEngine";
import { isAdminRequest } from "@/lib/adminAuth";
import { kvGetJson, kvSetJson, withKeyLock } from "@/lib/kvStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OFFSET_KEY = "bot_offset.json";

const getStoredOffset = async (): Promise<number> => {
  const stored = await kvGetJson<{ offset?: number }>(OFFSET_KEY, {});
  return Math.max(0, Number(stored.offset) || 0);
};

const saveStoredOffset = async (offset: number): Promise<void> => {
  await withKeyLock(OFFSET_KEY, async () => {
    const current = await getStoredOffset();
    await kvSetJson(OFFSET_KEY, { offset: Math.max(current, offset) });
  });
};

const isLocalhost = (req: NextRequest): boolean => {
  if (process.env.NODE_ENV === "production") return false;
  const host = (req.headers.get("host") || "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
};

const isAuthorized = (req: NextRequest): boolean => {
  if (isAdminRequest(req)) return true;
  if (isLocalhost(req)) return true;

  const configuredSecret =
    process.env.TELEGRAM_POLL_SECRET || process.env.ADMIN_API_TOKEN || "";
  if (!configuredSecret) return false;

  const headerSecret =
    req.headers.get("x-poll-secret") ||
    req.headers.get("x-telegram-poll-secret") ||
    "";
  const bearer = (req.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    ""
  );
  const querySecret = req.nextUrl.searchParams.get("secret") || "";

  return (
    headerSecret === configuredSecret ||
    bearer === configuredSecret ||
    querySecret === configuredSecret
  );
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const botConfig = await getServerBotConfig();
  const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "No bot token configured" },
      { status: 400 }
    );
  }

  // Always try to finalize sessions whose timer already elapsed, even when
  // there are no new Telegram updates waiting.
  const finalized = await finalizeDueSessions();

  let currentOffset = await getStoredOffset();

  try {
    const offsetParam =
      currentOffset > 0 ? `offset=${currentOffset}` : "offset=-10";
    const url = `https://api.telegram.org/bot${token}/getUpdates?${offsetParam}&timeout=5&limit=20`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!data.ok) {
      console.warn("[Telegram Poll Error]:", data);
      return NextResponse.json({
        ok: false,
        finalized,
        error: data.description || "Telegram API error",
      });
    }

    const updates = data.result || [];
    const processed: Array<{ update_id: number; res: any }> = [];
    const hostOrigin = req.nextUrl?.origin;

    for (const update of updates) {
      currentOffset = Math.max(currentOffset, update.update_id + 1);
      await saveStoredOffset(currentOffset);

      const result = await processTelegramUpdate(update, hostOrigin);
      processed.push({ update_id: update.update_id, res: result });
    }

    if (updates.length > 0) {
      await finalizeDueSessions();
    }

    return NextResponse.json({
      ok: true,
      finalized,
      processedCount: processed.length,
      nextOffset: currentOffset,
      processed,
    });
  } catch (err: any) {
    console.error("[Telegram Poll Exception]:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
