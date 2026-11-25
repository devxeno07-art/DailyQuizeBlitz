import { NextRequest, NextResponse } from "next/server";
import { getServerBotConfig } from "@/lib/serverStorage";
import {
  processTelegramUpdate,
  finalizeDueSessions,
  advanceQuizSessions,
  executeDelayedDelete,
} from "@/lib/telegramBotEngine";
import { safeWaitUntil } from "@/lib/quizRunner";
import { isAdminRequest } from "@/lib/adminAuth";
import { kvGetJson, kvSetJson, withKeyLock } from "@/lib/kvStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OFFSET_KEY = "bot_offset.json";
let isPollingInProgress = false;

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

  // Prevent concurrent poll overlapping which causes Telegram 409 Conflict
  if (isPollingInProgress) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: "Poll already in progress",
    });
  }

  isPollingInProgress = true;

  try {
    const botConfig = await getServerBotConfig();
    const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "No bot token configured" },
        { status: 400 }
      );
    }

    // Deliver the next sequential question when its timer has elapsed, then
    // finalize any session whose last poll has closed.
    const advanced = await advanceQuizSessions();
    const finalized = await finalizeDueSessions();

    let currentOffset = await getStoredOffset();

    try {
      const offsetParam =
        currentOffset > 0 ? `offset=${currentOffset}` : "offset=-10";
      const allowedUpdates = encodeURIComponent(
        JSON.stringify([
          "message",
          "channel_post",
          "callback_query",
          "poll_answer",
          "poll",
        ])
      );
      const url = `https://api.telegram.org/bot${token}/getUpdates?${offsetParam}&timeout=1&limit=20&allowed_updates=${allowedUpdates}`;

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      if (!data.ok) {
        console.warn("[Telegram Poll Error]:", data);
        return NextResponse.json({
          ok: false,
          advancedPolls: advanced.sent,
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
        if (result.pendingDelete) {
          const { chatId, messageId, delayMs } = result.pendingDelete;
          safeWaitUntil(executeDelayedDelete(chatId, messageId, delayMs));
        }
        processed.push({ update_id: update.update_id, res: result });
      }

      if (updates.length > 0) {
        await finalizeDueSessions();
      }

      return NextResponse.json({
        ok: true,
        advancedPolls: advanced.sent,
        advanceErrors: advanced.errors,
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
  } finally {
    isPollingInProgress = false;
  }
}
