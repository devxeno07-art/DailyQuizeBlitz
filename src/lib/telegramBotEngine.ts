import crypto from "crypto";
import { generateTop3Banner } from "./bannerGenerator";
import { triggerQuizRunner } from "./quizRunner";
import {
  TelegramBotConfig,
  TelegramParticipant,
  TelegramQuiz,
  TelegramQuizSession,
} from "@/types";
import {
  getServerBotConfig,
  getServerQuizByCode,
  getAllServerQuizzes,
  getSession,
  getLatestSessionByCode,
  getAllSessions,
  saveSession,
  saveServerBotConfig,
  getServerOverviewStats,
  sessionId,
  getPendingDeletes,
  addPendingDelete,
  removePendingDelete,
  recordSessionPollAnswer,
  getAllUpcomingReminders,
  clearUpcomingReminder,
} from "./serverStorage";
import { acquireRedisLock, releaseRedisLock } from "./kvStore";

export interface BotProcessResult {
  handled: boolean;
  action?: string;
  chatId?: number;
  text?: string;
  autoDeleteScheduled?: boolean;
  pendingDelete?: {
    chatId: number;
    messageId: number;
    delayMs: number;
  };
}

interface BotContext {
  config: TelegramBotConfig;
  token: string;
  chatId: number;
  chatTitle?: string;
  fromUser: any;
  isAdmin: boolean;
  configuredAppUrl: string;
}

interface PollPreparation {
  options: string[];
  correctOptionId: number;
}

/**
 * 0 (or an invalid value) means "send every question"; a positive number
 * caps the run. Defaults to 100 when the variable is not set at all.
 */
const getMaxQuestionsPerRun = (): number => {
  const raw = process.env.TELEGRAM_MAX_QUESTIONS;
  if (raw === undefined || raw.trim() === "") return 100;
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
};

const MAX_QUESTIONS_PER_RUN = getMaxQuestionsPerRun();
// High-speed, instant next-question transition grace period (100ms)
export const NEXT_POLL_GRACE_MS = 100;
// Auto-delete non-admin group messages 15 seconds after sending during an active quiz
export const AUTO_DELETE_DELAY_MS = 15_000;

const groupAdminsCache = new Map<
  number,
  { adminIds: Set<string>; expiresAt: number }
>();

/**
 * Deletes a Telegram message silently. Never throws or posts errors if the
 * bot lacks permission or the message was already deleted.
 */
export const deleteTelegramMessageSafe = async (
  token: string,
  chatId: number,
  messageId: number
): Promise<boolean> => {
  if (!token || !chatId || !messageId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data?.ok);
  } catch {
    return false;
  }
};

/**
 * Checks whether a user is a Telegram group admin/creator, cached for 3 minutes.
 */
const isTelegramGroupAdmin = async (
  token: string,
  chatId: number,
  userId: string
): Promise<boolean> => {
  if (!token || chatId >= 0 || !userId) return false;
  const now = Date.now();
  const cached = groupAdminsCache.get(chatId);
  if (cached && now < cached.expiresAt) {
    return cached.adminIds.has(userId);
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChatAdministrators`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (data?.ok && Array.isArray(data.result)) {
      const adminIds = new Set<string>();
      for (const member of data.result) {
        if (member?.user?.id !== undefined) {
          adminIds.add(String(member.user.id));
        }
      }
      groupAdminsCache.set(chatId, {
        adminIds,
        expiresAt: now + 3 * 60 * 1000,
      });
      return adminIds.has(userId);
    }
  } catch {
    // Fail open safely without throwing
  }
  return false;
};

export const executeDelayedDelete = async (
  chatId: number,
  messageId: number,
  delayMs = AUTO_DELETE_DELAY_MS
): Promise<void> => {
  try {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const config = await getServerBotConfig();
    const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    if (!token) return;

    await deleteTelegramMessageSafe(token, chatId, messageId);
    await removePendingDelete(`${chatId}:${messageId}`).catch(() => {});
  } catch {
    // Silent no-error guarantee
  }
};

export const processDuePendingDeletes = async (): Promise<number> => {
  try {
    const pending = await getPendingDeletes();
    if (pending.length === 0) return 0;

    const config = await getServerBotConfig();
    const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    if (!token) return 0;

    const now = Date.now();
    let deleted = 0;

    for (const item of pending) {
      if (now - item.deleteAt > 60 * 60 * 1000) {
        await removePendingDelete(item.id).catch(() => {});
        continue;
      }
      if (now >= item.deleteAt) {
        const ok = await deleteTelegramMessageSafe(
          token,
          item.chatId,
          item.messageId
        );
        await removePendingDelete(item.id).catch(() => {});
        if (ok) deleted += 1;
      }
    }
    return deleted;
  } catch {
    return 0;
  }
};

export const sendMessageAndGetId = async (
  token: string,
  chatId: number | string,
  text: string
): Promise<{ ok: boolean; messageId?: number; error?: string }> => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) {
      return { ok: false, error: data?.description || "sendMessage failed" };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error" };
  }
};

export const clearGroupUpcomingReminder = async (
  token: string,
  chatId: number | string
): Promise<void> => {
  try {
    const groupKey = String(chatId);
    const reminders = await getAllUpcomingReminders();
    const match = reminders.find((r) => r.groupId === groupKey);
    if (!match) return;
    if (match.messageId && token) {
      await deleteTelegramMessageSafe(token, Number(chatId), match.messageId);
      await removePendingDelete(`${Number(chatId)}:${match.messageId}`).catch(
        () => {}
      );
    }
    await clearUpcomingReminder(groupKey);
  } catch {
    // Ignore errors cleanly
  }
};

const maybeQueueAutoDelete = async (
  incomingMsg: any,
  token: string,
  isBotAdmin: boolean
): Promise<{ chatId: number; messageId: number; delayMs: number } | undefined> => {
  try {
    if (!incomingMsg || !incomingMsg.message_id) return undefined;
    const chatId = Number(incomingMsg.chat?.id);
    if (!Number.isFinite(chatId) || chatId >= 0) return undefined; // Only groups/supergroups
    if (incomingMsg.pinned_message) return undefined; // Never delete pin notifications

    const fromUserId = String(incomingMsg.from?.id || "");
    const botUserId = token.split(":")[0];
    if (fromUserId && botUserId && fromUserId === botUserId) return undefined;

    // Protect bot admin and anonymous group admins
    if (isBotAdmin) return undefined;
    if (
      fromUserId === "1087968824" ||
      Number(incomingMsg.sender_chat?.id) === chatId
    ) {
      return undefined;
    }

    // Only auto-delete when a quiz session is actively running in this group
    const sessions = await getAllSessions();
    const hasActiveQuiz = sessions.some(
      (s) => s.chatId === chatId && s.status === "active"
    );
    if (!hasActiveQuiz) return undefined;

    // Also protect Telegram group admins / creators
    if (fromUserId && (await isTelegramGroupAdmin(token, chatId, fromUserId))) {
      return undefined;
    }

    const messageId = Number(incomingMsg.message_id);
    const deleteAt = Date.now() + AUTO_DELETE_DELAY_MS;
    await addPendingDelete({
      id: `${chatId}:${messageId}`,
      chatId,
      messageId,
      deleteAt,
    }).catch(() => {});

    return { chatId, messageId, delayMs: AUTO_DELETE_DELAY_MS };
  } catch {
    return undefined;
  }
};

// ==========================================
// Small helpers
// ==========================================

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const truncate = (value: unknown, max: number): string => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const userDisplayName = (user: any): string => {
  if (!user) return "અજાણ્યો વિદ્યાર્થી";
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || `User ${user.id ?? ""}`.trim();
};

const calculateGrade = (percentage: number): string => {
  if (percentage >= 85) return "A+";
  if (percentage >= 70) return "A";
  if (percentage >= 55) return "B";
  if (percentage >= 40) return "C";
  if (percentage >= 33) return "D";
  return "E";
};

const callTelegram = async (
  token: string,
  method: string,
  payload: Record<string, any>
): Promise<{ ok: boolean; result?: any; description?: string }> => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn(`[telegram] ${method} failed:`, data.description || data);
    }
    return data;
  } catch (err: any) {
    console.warn(`[telegram] ${method} network error:`, err?.message || err);
    return { ok: false, description: err?.message || "Network error" };
  }
};

const sendMessage = async (
  ctx: Pick<BotContext, "token" | "chatId">,
  text: string,
  replyMarkup?: any
): Promise<boolean> => {
  let effectiveMarkup = replyMarkup;
  if (ctx.chatId < 0) {
    if (replyMarkup?.keyboard) {
      effectiveMarkup = undefined;
    } else if (!replyMarkup) {
      effectiveMarkup = { remove_keyboard: true };
    }
  }

  const result = await callTelegram(ctx.token, "sendMessage", {
    chat_id: ctx.chatId,
    text,
    parse_mode: "HTML",
    reply_markup: effectiveMarkup,
    disable_web_page_preview: true,
  });
  return !!result.ok;
};

const sendPhoto = async (
  ctx: Pick<BotContext, "token" | "chatId">,
  photoBuffer: Buffer,
  caption?: string
): Promise<boolean> => {
  try {
    const formData = new FormData();
    formData.append("chat_id", String(ctx.chatId));
    formData.append(
      "photo",
      new Blob([new Uint8Array(photoBuffer)], { type: "image/png" }),
      "top3_banner.png"
    );
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }

    const res = await fetch(`https://api.telegram.org/bot${ctx.token}/sendPhoto`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("[telegram] sendPhoto failed:", data.description || data);
    }
    return !!data.ok;
  } catch (err: any) {
    console.warn("[telegram] sendPhoto network error:", err?.message || err);
    return false;
  }
};

const preparePollOptions = (question: any): PollPreparation | null => {
  const raw: any[] = Array.isArray(question?.options)
    ? question.options
    : [];
  const mapped: Array<{ text: string; originalIndex: number }> = raw
    .map((option: any, originalIndex: number) => ({
      text: String(option ?? "").trim(),
      originalIndex,
    }))
    .filter((entry) => entry.text.length > 0)
    .slice(0, 10);

  if (mapped.length < 2) return null;

  const seen = new Set<string>();
  const options = mapped.map((entry) => {
    let text = entry.text.slice(0, 100);
    while (seen.has(text)) {
      text = `${text.slice(0, 99)} `;
    }
    seen.add(text);
    return text;
  });

  let correctOptionId = mapped.findIndex(
    (entry) => entry.originalIndex === Number(question?.correctAnswer || 0)
  );
  if (correctOptionId < 0) correctOptionId = 0;

  return { options, correctOptionId };
};

export const formatPollQuestion = (
  rawText: unknown,
  index: number,
  total: number
): string => {
  const text = String(rawText ?? "").trim();
  // Strip pre-existing question numbering (e.g., "1.", "59.", "Q1.", "પ્રશ્ન 1.", "[59/60]", "(1)")
  // while preserving genuine question content like dates/ranges ("1960 માં", "1947-48 માં", "5-10 વર્ષ"), decimals ("3.14"), and times ("10:30")
  const cleaned = text
    .replace(
      /^(?:(?:Q(?:uestion)?|પ્રશ્ન)\.?\s*[\d૦-૯]+(?:\s*[\/\\]\s*[\d૦-૯]+)?|\[[\d૦-૯]+(?:\s*[\/\\]\s*[\d૦-૯]+)?\]|\([\d૦-૯]+(?:\s*[\/\\]\s*[\d૦-૯]+)?\)|[\d૦-૯]{1,4}\s*[\.\:\-\)](?![\d૦-૯]))[\.\:\-\s]*/i,
      ""
    )
    .trim();
  const body = cleaned || text;
  const formatted = body
    ? `[${index + 1}/${total}] ${body}`
    : `[${index + 1}/${total}]`;
  return truncate(formatted, 300);
};

const createMiniAppButton = (ctx: BotContext, label: string, path = "") => {
  const base = (ctx.config.webAppUrl || ctx.configuredAppUrl || "").replace(
    /\/$/,
    ""
  );
  const fullUrl = path ? `${base}${path}` : base;
  if (fullUrl.startsWith("https://")) {
    return { text: label, web_app: { url: fullUrl } };
  }
  return { text: label, url: fullUrl || "https://telegram.org" };
};

const buildWebhookUrl = (
  config: TelegramBotConfig,
  hostOrigin?: string
): string => {
  const base = (config.webhookUrl || config.webAppUrl || hostOrigin || "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return "";
  if (base.endsWith("/api/telegram/webhook")) return base;
  return `${base}/api/telegram/webhook`;
};

// ==========================================
// Webhook setup / inspection
// ==========================================

export const setupTelegramWebhook = async (
  config: TelegramBotConfig,
  hostOrigin: string | undefined,
  action: "set" | "delete" | "info"
): Promise<{
  ok: boolean;
  action: string;
  url?: string;
  secret?: string;
  result?: any;
  error?: string;
}> => {
  const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return { ok: false, action, error: "બોટ ટોકન કન્ફિગર થયેલ નથી." };
  }

  if (action === "info") {
    const result = await callTelegram(token, "getWebhookInfo", {});
    return { ok: !!result.ok, action, result };
  }

  if (action === "delete") {
    const result = await callTelegram(token, "deleteWebhook", {
      drop_pending_updates: false,
    });
    if (result.ok) {
      config.webhookUrl = "";
      await saveServerBotConfig(config);
    }
    return { ok: !!result.ok, action, result };
  }

  const url = buildWebhookUrl(config, hostOrigin);
  if (!url.startsWith("https://")) {
    return {
      ok: false,
      action,
      error:
        "Telegram webhook માટે public HTTPS URL જરૂરી છે. Localhost પર polling વાપરો અથવા Vercel/ngrok URL સેટ કરો.",
    };
  }

  const secret =
    config.webhookSecret || crypto.randomBytes(24).toString("hex");
  const result = await callTelegram(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: [
      "message",
      "channel_post",
      "callback_query",
      "poll_answer",
      "poll",
    ],
    drop_pending_updates: false,
  });

  if (result.ok) {
    config.webhookUrl = url;
    config.webhookSecret = secret;
    await saveServerBotConfig(config);
  }

  return {
    ok: !!result.ok,
    action,
    url,
    secret,
    result,
    error: result.ok ? undefined : result.description,
  };
};

// ==========================================
// Leaderboard rendering (real participants only)
// ==========================================

const getSortedParticipants = (
  session: TelegramQuizSession
): TelegramParticipant[] =>
  Object.values(session.participants || {})
    .filter((p) => p.answeredCount > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.wrong - b.wrong ||
        new Date(a.lastAnsweredAt).getTime() -
          new Date(b.lastAnsweredAt).getTime()
    );

const buildLeaderboardText = (
  session: TelegramQuizSession,
  final: boolean
): string => {
  const totalQuestions = session.quiz.questions.length;
  const participants = getSortedParticipants(session);
  const shown = participants.slice(0, 30);

  let message = `🏆 <b>${
    final ? "અંતિમ પરિણામ અને લીડરબોર્ડ" : "લાઈવ સ્કોરબોર્ડ"
  }</b>\n\n`;
  message += `📝 <b>${escapeHtml(session.quiz.title)}</b>\n`;
  message += `📚 વિષય: ${escapeHtml(session.quiz.subject)}\n`;
  message += `📊 પ્રશ્નો: ${totalQuestions} | ⏱ ${
    session.quiz.timePerQuestion || 30
  } સે./પ્રશ્ન | 👥 વિદ્યાર્થીઓ: ${participants.length}\n`;
  message += `🔑 કોડ: <code>${escapeHtml(session.code)}</code>\n\n`;

  if (participants.length === 0) {
    message += `😕 હજુ સુધી કોઈએ પોલમાં જવાબ આપ્યો નથી.\n`;
    message += `👉 ગ્રૂપમાં પોલ ખોલીને સાચો વિકલ્પ પસંદ કરો.`;
    return message;
  }

  const header =
    "ક્રમ  વિદ્યાર્થી          સ્કોર     ખોટા   %       ગ્રેડ\n" +
    "--------------------------------------------------------\n";
  const rows = shown
    .map((participant, index) => {
      const rank = String(index + 1).padEnd(4);
      const name = truncate(participant.name, 14).padEnd(15);
      const score = `${participant.score}/${totalQuestions}`.padEnd(9);
      const wrong = String(participant.wrong).padEnd(7);
      const percentage = (
        totalQuestions > 0
          ? (participant.score / totalQuestions) * 100
          : 0
      ).toFixed(1);
      const pct = `${percentage}%`.padEnd(8);
      const grade = calculateGrade(Number(percentage));
      return `${rank} ${name} ${score} ${wrong} ${pct} ${grade}`;
    })
    .join("\n");

  message += `<pre>${escapeHtml(header + rows)}</pre>\n`;
  if (participants.length > shown.length) {
    message += `\n… અને ${participants.length - shown.length} વધુ વિદ્યાર્થીઓ.\n`;
  }
  message += `\n👏 <b>બધા સહભાગીઓને અભિનંદન!</b>\n`;
  message += `📱 આપણી Mini App પર વિગતવાર પરિણામ અને ઉત્તરાવલી જુઓ.`;
  return message;
};

const sendLeaderboardTable = async (
  ctx: Pick<BotContext, "token" | "chatId">,
  session: TelegramQuizSession,
  final: boolean
): Promise<boolean> => {
  const participants = getSortedParticipants(session);
  const totalQuestions = session.quiz.questions.length;

  if (participants.length > 0) {
    const shown = participants.slice(0, 30);
    const tableCells = [
      [
        { text: "ક્રમ", is_header: true, align: "center" },
        { text: "વિદ્યાર્થી", is_header: true, align: "left" },
        { text: "સ્કોર", is_header: true, align: "center" },
        { text: "ખોટા", is_header: true, align: "center" },
        { text: "%", is_header: true, align: "center" },
        { text: "ગ્રેડ", is_header: true, align: "center" },
      ],
      ...shown.map((p, idx) => {
        const pct =
          totalQuestions > 0
            ? ((p.score / totalQuestions) * 100).toFixed(1)
            : "0.0";
        return [
          { text: String(idx + 1), align: "center" },
          { text: truncate(p.name, 16), align: "left" },
          { text: `${p.score}/${totalQuestions}`, align: "center" },
          { text: String(p.wrong), align: "center" },
          { text: `${pct}%`, align: "center" },
          { text: calculateGrade(Number(pct)), align: "center" },
        ];
      }),
    ];

    const richRes = await callTelegram(ctx.token, "sendRichMessage", {
      chat_id: ctx.chatId,
      rich_message: {
        blocks: [
          {
            type: "table",
            is_bordered: true,
            is_striped: true,
            cells: tableCells,
          },
        ],
      },
    });

    if (richRes.ok) {
      return true;
    }
  }

  const text = buildLeaderboardText(session, final);
  return sendMessage(ctx, text);
};

export const getTelegramUserAvatar = async (
  token: string,
  userId: string | number
): Promise<string | undefined> => {
  try {
    const photosRes = await callTelegram(token, "getUserProfilePhotos", {
      user_id: userId,
      limit: 1,
    });
    if (!photosRes.ok || !photosRes.result?.photos?.length) return undefined;
    const photoSizes = photosRes.result.photos[0];
    if (!photoSizes || photoSizes.length === 0) return undefined;
    const chosen = photoSizes[Math.min(1, photoSizes.length - 1)];
    const fileRes = await callTelegram(token, "getFile", {
      file_id: chosen.file_id,
    });
    if (!fileRes.ok || !fileRes.result?.file_path) return undefined;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${fileRes.result.file_path}`;
    const imgRes = await fetch(fileUrl);
    if (!imgRes.ok) return undefined;
    const ab = await imgRes.arrayBuffer();
    const base64 = Buffer.from(ab).toString("base64");
    const mime = fileRes.result.file_path.endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch {
    return undefined;
  }
};

const sendLeaderboard = async (
  ctx: Pick<BotContext, "token" | "chatId">,
  session: TelegramQuizSession,
  final: boolean
): Promise<boolean> => {
  const participants = getSortedParticipants(session);

  // When final === true (quiz complete), notify users immediately that results are calculating
  if (final) {
    await sendMessage(
      ctx,
      `⏳ <b>ટેસ્ટ પૂર્ણ થઈ! પરિણામ ગણાઈ રહ્યું છે...</b>\n\n` +
        `📊 <i>બધા વિદ્યાર્થીઓના સ્કોર, ટકાવારી અને ટોપ-૩ લીડરબોર્ડ બેનર તૈયાર થઈ રહ્યું છે, કૃપા કરીને થોડી ક્ષણો રાહ જુઓ...</i> ⏳`
    );
  }

  // When final === true (quiz complete), generate and send the HD Top 3 Banner photo with user avatars!
  if (final && participants.length > 0) {
    try {
      const config = await getServerBotConfig();
      const botHandle = config.botUsername || "databasehandlerbot";

      // Fetch profile avatars for top 3 participants in parallel
      const top3 = participants.slice(0, 3);
      const avatarUrls: Record<string, string> = {};
      await Promise.all(
        top3.map(async (p) => {
          const avatar = await getTelegramUserAvatar(ctx.token, p.userId);
          if (avatar) {
            avatarUrls[p.userId] = avatar;
          }
        })
      );

      const bannerBuffer = await generateTop3Banner(
        session,
        botHandle,
        avatarUrls
      );
      if (bannerBuffer) {
        await sendPhoto(
          ctx,
          bannerBuffer,
          `🏆 <b>${escapeHtml(session.quiz.title)}</b>\n🎉 <i>અંતિમ પરિણામ અને ટોપ ૩ વિજેતાઓ!</i>`
        );
      }
    } catch (bannerErr) {
      console.warn("[telegram] Failed to generate/send Top 3 banner:", bannerErr);
    }
  }

  const ok = await sendLeaderboardTable(ctx, session, final);
  // Only a FINAL leaderboard marks the session as done. Live /results calls
  // must not set leaderboardSentAt, otherwise finalizeDueSessions() would
  // skip the automatic final leaderboard later.
  if (ok && final) {
    session.leaderboardSentAt = new Date().toISOString();
    session.status = "completed";
    await saveSession(session);
  }
  return ok;
};

export const finalizeDueSessions = async (): Promise<number> => {
  const config = await getServerBotConfig();
  const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return 0;

  const now = Date.now();
  const sessions = await getAllSessions();
  const due = sessions.filter(
    (session) =>
      session.status === "active" &&
      session.polls.length >= (session.quiz?.questions?.length || 0) &&
      session.finalizeAt &&
      new Date(session.finalizeAt).getTime() <= now &&
      !session.leaderboardSentAt
  );

  let finalized = 0;
  for (const session of due) {
    const finLockKey = `finalize:${session.id}`;
    const acquired = await acquireRedisLock(finLockKey, 30_000);
    if (!acquired) continue;

    const fresh = await getSession(session.code, session.chatId);
    if (
      !fresh ||
      fresh.status !== "active" ||
      fresh.leaderboardSentAt ||
      fresh.polls.length < (fresh.quiz?.questions?.length || 0)
    ) {
      continue;
    }

    const ok = await sendLeaderboard(
      { token, chatId: fresh.chatId },
      fresh,
      true
    );
    if (ok) finalized += 1;
  }
  await processDuePendingDeletes().catch(() => 0);
  return finalized;
};

export const getSessionTimePerQuestion = (
  session: TelegramQuizSession
): number =>
  Math.max(
    5,
    Math.min(600, Number(session.quiz?.timePerQuestion) || 30)
  );

/**
 * Sends the poll at `index` for a session. The caller is responsible for
 * persisting the session afterwards only when needed (this helper saves on
 * success so a crash cannot resend the same question).
 */
const sendPollForQuestion = async (
  ctx: Pick<BotContext, "token" | "chatId">,
  session: TelegramQuizSession,
  index: number
): Promise<{ ok: boolean; error?: string }> => {
  if (session.polls.some((p) => p.questionIndex === index)) {
    return { ok: false, error: `Question index ${index} already sent` };
  }

  const question = session.quiz.questions[index];
  if (!question) {
    return { ok: false, error: "Question not found" };
  }

  const prepared = preparePollOptions(question);
  if (!prepared) {
    return { ok: false, error: "Question has fewer than 2 valid options" };
  }

  const total = session.quiz.questions.length;
  const timePerQuestion = getSessionTimePerQuestion(session);
  const questionText = formatPollQuestion(question.questionText, index, total);

  const result = await callTelegram(ctx.token, "sendPoll", {
    chat_id: ctx.chatId,
    question: questionText,
    options: prepared.options,
    type: "quiz",
    correct_option_id: prepared.correctOptionId,
    explanation: truncate(question.explanation || "", 200),
    open_period: timePerQuestion,
    is_anonymous: false,
    allows_multiple_answers: false,
  });

  if (!result.ok || !result.result?.poll?.id) {
    return {
      ok: false,
      error: result.description || "Telegram refused to send a poll",
    };
  }

  const sentAt = new Date();
  session.polls.push({
    pollId: result.result.poll.id,
    questionIndex: index,
    questionId: question.id,
    correctOptionId: prepared.correctOptionId,
    chatId: ctx.chatId,
    messageId: result.result.message_id,
    sentAt: sentAt.toISOString(),
  });
  // The final leaderboard goes out quickly after the final poll closes (1s grace)
  session.finalizeAt = new Date(
    sentAt.getTime() + timePerQuestion * 1000 + 1000
  ).toISOString();
  session.status = "active";
  await saveSession(session);
  return { ok: true };
};

let advanceInProgress = false;

/**
 * Sequential quiz runner. Called by the background runner, webhooks, and
 * cron tick. Uses an atomic Redis distributed lock keyed by `(sessionId, questionIndex)`
 * so the exact same MCQ can never be dispatched twice across concurrent serverless instances.
 */
export const advanceQuizSessions = async (): Promise<{
  sent: number;
  errors: string[];
}> => {
  if (advanceInProgress) return { sent: 0, errors: [] };
  advanceInProgress = true;

  try {
    const config = await getServerBotConfig();
    const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    if (!token) return { sent: 0, errors: [] };

    const now = Date.now();
    const sessions = await getAllSessions();
    let sent = 0;
    const errors: string[] = [];

    for (const session of sessions) {
      if (session.status !== "active") continue;
      const total = session.quiz?.questions?.length || 0;
      const qIndex = session.polls.length;
      if (total === 0 || qIndex >= total) continue;
      if (qIndex === 0) continue; // first poll is sent at start

      const lastPoll = session.polls[qIndex - 1];
      const lastSentAt = new Date(lastPoll.sentAt).getTime();
      if (!Number.isFinite(lastSentAt)) continue;

      const dueAt =
        lastSentAt +
        getSessionTimePerQuestion(session) * 1000 +
        NEXT_POLL_GRACE_MS;
      if (now < dueAt) continue;

      // Atomic distributed lock keyed to this exact session + question index (30s TTL)
      const pollLockKey = `poll_send:${session.id}:idx_${qIndex}`;
      const gotLock = await acquireRedisLock(pollLockKey, 30_000);
      if (!gotLock) continue;

      // Re-read fresh session state from Redis inside the lock to prevent stale duplicates
      const fresh = await getSession(session.code, session.chatId);
      if (
        !fresh ||
        fresh.status !== "active" ||
        fresh.polls.length !== qIndex ||
        fresh.polls.some((p) => p.questionIndex === qIndex)
      ) {
        continue;
      }

      const freshLastPoll = fresh.polls[fresh.polls.length - 1];
      const freshLastSentAt = freshLastPoll
        ? new Date(freshLastPoll.sentAt).getTime()
        : 0;
      const freshDueAt =
        freshLastSentAt +
        getSessionTimePerQuestion(fresh) * 1000 +
        NEXT_POLL_GRACE_MS;
      if (Date.now() < freshDueAt) {
        await releaseRedisLock(pollLockKey);
        continue;
      }

      const ctx = { token, chatId: fresh.chatId };
      const result = await sendPollForQuestion(ctx, fresh, qIndex);

      if (!result.ok) {
        fresh.status = "error";
        fresh.error = result.error;
        await saveSession(fresh);
        errors.push(`${fresh.id}: ${result.error}`);
        await sendMessage(
          ctx,
          `⚠️ <b>પોલ મોકલવામાં ભૂલ આવી.</b>\n` +
            `પ્રશ્ન #${fresh.polls.length + 1} પર ટેસ્ટ અટકી ગઈ.\n\n` +
            `<i>${escapeHtml(result.error || "Unknown error")}</i>\n\n` +
            `👉 હજુ સુધી મળેલા જવાબોનું પરિણામ: <code>/results ${escapeHtml(
              fresh.code
            )}</code>`
        );
        continue;
      }
      sent += 1;
    }

    await processDuePendingDeletes().catch(() => 0);

    return { sent, errors };
  } finally {
    advanceInProgress = false;
  }
};

// ==========================================
// Quiz session lifecycle
// ==========================================

const startQuizSession = async (
  ctx: BotContext,
  quiz: TelegramQuiz
): Promise<{ ok: boolean; session?: TelegramQuizSession; error?: string }> => {
  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    await sendMessage(
      ctx,
      `❌ <b>આ ટેસ્ટમાં કોઈ પ્રશ્ન નથી.</b>\nપહેલા Mini App પરથી પ્રશ્નો ઉમેરો.`
    );
    return { ok: false, error: "Quiz has no questions" };
  }

  const startLockKey = `start_quiz:${ctx.chatId}:${quiz.code.toUpperCase()}`;
  const gotStartLock = await acquireRedisLock(startLockKey, 15_000);
  if (!gotStartLock) {
    return { ok: false, error: "Quiz start already in progress" };
  }

  const existing = await getSession(quiz.code, ctx.chatId);
  // Block re-runs for any unfinished session that already has polls in the
  // group (active OR partially failed). Re-sending would duplicate polls.
  if (
    existing &&
    existing.polls.length > 0 &&
    existing.status !== "completed" &&
    existing.status !== "stopped"
  ) {
    const ageMs = Date.now() - new Date(existing.startedAt).getTime();
    const isStale = ageMs > 15 * 60 * 1000 || existing.status === "error";
    if (!isStale) {
      await sendMessage(
        ctx,
        `⏳ <b>આ ટેસ્ટ પહેલેથી જ આ ગ્રૂપમાં શરૂ થઈ ચૂકી છે!</b>\n\n` +
          `🔑 કોડ: <code>${escapeHtml(quiz.code)}</code>\n` +
          `👉 લાઈવ સ્કોર જોવા: <code>/results ${escapeHtml(
            quiz.code
          )}</code>\n` +
          `👉 ટેસ્ટ બંધ કરવા: <code>/stop ${escapeHtml(quiz.code)}</code>`
      );
      return { ok: false, error: "Quiz already running" };
    }
  }

  const scopedQuestions =
    MAX_QUESTIONS_PER_RUN > 0
      ? quiz.questions.slice(0, MAX_QUESTIONS_PER_RUN)
      : quiz.questions;

  const sendable = scopedQuestions
    .map((question) => ({ question, prepared: preparePollOptions(question) }))
    .filter(
      (entry): entry is { question: any; prepared: PollPreparation } =>
        entry.prepared !== null
    );

  if (sendable.length === 0) {
    await sendMessage(
      ctx,
      `❌ <b>ટેસ્ટ શરૂ કરી શકાઈ નહીં.</b>\nપ્રશ્નોમાં ઓછામાં ઓછા 2 માન્ય વિકલ્પો જરૂરી છે.`
    );
    return { ok: false, error: "No valid questions/options" };
  }

  const now = new Date().toISOString();
  const session: TelegramQuizSession = {
    id: sessionId(quiz.code, ctx.chatId),
    code: quiz.code,
    chatId: ctx.chatId,
    chatTitle: ctx.chatTitle,
    quiz: {
      ...quiz,
      questions: sendable.map((entry) => entry.question),
      timePerQuestion: Math.max(
        5,
        Math.min(600, Number(quiz.timePerQuestion) || 30)
      ),
    },
    status: "active",
    startedAt: now,
    startedBy: {
      id: String(ctx.fromUser?.id || ""),
      name: userDisplayName(ctx.fromUser),
      username: ctx.fromUser?.username,
    },
    polls: [],
    participants: {},
  };
  await saveSession(session);
  // Clear any active upcoming test reminder message in this group now that the test is starting
  await clearGroupUpcomingReminder(ctx.token, ctx.chatId).catch(() => {});

  const introOk = await sendMessage(
    ctx,
    `🎯 <b>મોક ટેસ્ટ શરૂ થઈ રહી છે!</b>\n\n` +
      `📝 <b>શીર્ષક:</b> ${escapeHtml(session.quiz.title)}\n` +
      `📚 <b>વિષય:</b> ${escapeHtml(session.quiz.subject)}\n` +
      `🔢 <b>કુલ પ્રશ્નો:</b> ${sendable.length}\n` +
      `⏱ <b>સમય:</b> ${session.quiz.timePerQuestion} સેકન્ડ/પ્રશ્ન\n` +
      `👤 <b>શરૂ કરનાર:</b> ${escapeHtml(session.startedBy.name)}\n\n` +
      `⏳ <b>તૈયાર થઈ જાઓ! પ્રથમ પ્રશ્ન ૩... ૨... ૧... માં આવી રહ્યો છે!</b> 🚀`
  );

  if (!introOk) {
    session.status = "error";
    session.error = "Could not send intro message";
    await saveSession(session);
    return { ok: false, error: session.error };
  }

  // 2.5-second countdown pause before first poll so participants are ready
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // Only the first question is sent now. advanceQuizSessions() delivers the
  // remaining questions one by one after each open_period expires.
  const firstSend = await sendPollForQuestion(ctx, session, 0);
  if (!firstSend.ok) {
    session.status = "error";
    session.error = firstSend.error;
    await saveSession(session);
    await sendMessage(
      ctx,
      `⚠️ <b>પોલ મોકલવામાં ભૂલ આવી.</b>\n` +
        `પ્રથમ પ્રશ્ન શરૂ થઈ શક્યો નહીં.\n\n` +
        `<i>${escapeHtml(firstSend.error || "Unknown error")}</i>`
    );
    return { ok: false, session, error: session.error };
  }

  // Trigger the background runner to post subsequent questions when due
  triggerQuizRunner(ctx.configuredAppUrl).catch(() => {});

  return { ok: true, session };
};

// ==========================================
// Poll answer tracking (the missing piece)
// ==========================================

const handlePollAnswer = async (
  update: any
): Promise<BotProcessResult> => {
  const pollAnswer = update.poll_answer;
  if (!pollAnswer?.poll_id || !pollAnswer?.user) {
    return { handled: false };
  }

  const targetPollId = String(pollAnswer.poll_id || "").trim();
  const optionIds = Array.isArray(pollAnswer.option_ids)
    ? pollAnswer.option_ids.map((id: any) => Number(id))
    : [];

  const outcome = await recordSessionPollAnswer({
    pollId: targetPollId,
    userId: String(pollAnswer.user.id),
    name: userDisplayName(pollAnswer.user),
    username: pollAnswer.user.username,
    optionIds,
  });

  if (outcome.status === "not_found") {
    return { handled: false };
  }
  if (outcome.status === "ignored") {
    return { handled: true, action: "late_poll_answer_ignored" };
  }

  return {
    handled: true,
    action: "poll_answer_recorded",
    chatId: outcome.session.chatId,
  };
};

// ==========================================
// Commands
// ==========================================

const sendAdminMenu = async (ctx: BotContext): Promise<void> => {
  const stats = await getServerOverviewStats();
  await sendMessage(
    ctx,
    `👑 <b>MCQ Master એડમિન કંટ્રોલ સેન્ટર</b>\n\n` +
      `📊 ક્વિઝ: <b>${stats.quizzes}</b> | પ્રશ્નો: <b>${stats.totalQuizQuestions}</b>\n` +
      `🎯 સેશન્સ: <b>${stats.sessions}</b> | એટેમ્પ્ટ્સ: <b>${stats.attempts}</b>\n` +
      `📅 શેડ્યુલ્સ: <b>${stats.schedules}</b> | સ્ટોરેજ: <b>${stats.storageMode}</b>\n\n` +
      `🎯 <b>કમાન્ડ્સ:</b>\n` +
      `• <code>/dispatch</code> - તાત્કાલિક મોક ટેસ્ટ શરૂ કરો\n` +
      `• <code>/stats</code> - લાઈવ આંકડા\n` +
      `• <code>/quiz &lt;CODE&gt;</code> - કોઈપણ ટેસ્ટ શરૂ કરો\n` +
      `• <code>/results &lt;CODE&gt;</code> - લાઈવ લીડરબોર્ડ\n` +
      `• <code>/stop &lt;CODE&gt;</code> - ટેસ્ટ પૂરી કરો`,
    {
      inline_keyboard: [
        [
          { text: "🚀 ડેઇલી ક્વિઝ મોકલો (/dispatch)", callback_data: "/dispatch" },
          { text: "📊 આંકડા (/stats)", callback_data: "/stats" },
        ],
        [
          { text: "🔗 Webhook સેટ કરો", callback_data: "WEBHOOK_SET" },
          { text: "ℹ️ Webhook માહિતી", callback_data: "WEBHOOK_INFO" },
        ],
        [createMiniAppButton(ctx, "📱 Mini App ખોલો")],
        [createMiniAppButton(ctx, "🌐 એડમિન પોર્ટલ (Web)", "/admin-portal")],
      ],
    }
  );
};

const handleResults = async (
  ctx: BotContext,
  code: string
): Promise<void> => {
  let session: TelegramQuizSession | null = null;
  if (code) {
    session =
      (await getSession(code, ctx.chatId)) ||
      (await getLatestSessionByCode(code));
  } else {
    const sessions = await getAllSessions();
    session =
      sessions
        .filter((s) => s.chatId === ctx.chatId)
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        )[0] || null;
  }

  if (!session) {
    await sendMessage(
      ctx,
      `❌ <b>કોઈ ટેસ્ટ સેશન મળ્યું નથી.</b>\n` +
        `પહેલા <code>/quiz &lt;CODE&gt;</code> થી ટેસ્ટ શરૂ કરો.`
    );
    return;
  }

  await sendLeaderboard(
    ctx,
    session,
    session.status === "completed" || session.status === "stopped"
  );
};

const handleStop = async (ctx: BotContext, code: string): Promise<void> => {
  let session: TelegramQuizSession | null = null;
  if (code) {
    session = await getSession(code, ctx.chatId);
  } else {
    const sessions = await getAllSessions();
    session =
      sessions
        .filter((s) => s.chatId === ctx.chatId && s.status === "active")
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        )[0] || null;
  }

  if (!session) {
    await sendMessage(ctx, `❌ આ ચેટમાં કોઈ ચાલુ ટેસ્ટ સેશન મળ્યું નથી.`);
    return;
  }

  const fromUserId = String(ctx.fromUser?.id || "");
  const isStarter =
    session.startedBy && String(session.startedBy.id) === fromUserId;
  const isPrivate = ctx.chatId > 0;

  if (!ctx.isAdmin && !isPrivate && !isStarter) {
    await sendMessage(
      ctx,
      `⛔ માત્ર એડમિન અથવા જેણે ટેસ્ટ શરૂ કરી હતી તે જ આ ટેસ્ટ બંધ કરી શકે છે.`
    );
    return;
  }

  session.status = "stopped";
  await saveSession(session);
  await sendMessage(
    ctx,
    `🛑 <b>મોક ટેસ્ટ બંધ કરવામાં આવી છે.</b>\nઅંતિમ પરિણામ નીચે મુજબ છે:`
  );
  await sendLeaderboard(ctx, session, true);
};

const handleDispatch = async (ctx: BotContext): Promise<void> => {
  const quizzes = await getAllServerQuizzes();
  if (quizzes.length === 0) {
    await sendMessage(
      ctx,
      `❌ સિસ્ટમમાં કોઈ ટેસ્ટ ઉપલબ્ધ નથી. પહેલા Mini App પરથી ટેસ્ટ બનાવો.`
    );
    return;
  }

  const quiz = quizzes.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  await startQuizSession(ctx, quiz);
};

const handleStats = async (ctx: BotContext): Promise<void> => {
  const stats = await getServerOverviewStats();
  await sendMessage(
    ctx,
    `📊 <b>MCQ Master લાઈવ આંકડા</b>\n\n` +
      `📝 ક્વિઝ પેપર્સ: <b>${stats.quizzes}</b>\n` +
      `🔢 કુલ પ્રશ્નો: <b>${stats.totalQuizQuestions}</b>\n` +
      `🎯 ટેસ્ટ સેશન્સ: <b>${stats.sessions}</b> (ચાલુ: ${stats.activeSessions})\n` +
      `👥 સહભાગીઓ: <b>${stats.participants}</b>\n` +
      `📈 એટેમ્પ્ટ્સ: <b>${stats.attempts}</b> | સરેરાશ: <b>${stats.averagePercentage}%</b>\n` +
      `📅 ડેઇલી શેડ્યુલ્સ: <b>${stats.schedules}</b>\n` +
      `💾 સ્ટોરેજ: <b>${stats.storageMode}</b>\n` +
      `🤖 બોટ સ્ટેટસ: <b>ઓનલાઇન ✓</b>`
  );
};

// ==========================================
// Programmatic dispatch (scheduler / admin API)
// ==========================================

export const dispatchQuizToChat = async (options: {
  quiz: TelegramQuiz;
  chatId: number | string;
  chatTitle?: string;
  hostOrigin?: string;
  startedBy?: { id: string; name: string; username?: string };
}): Promise<{ ok: boolean; sessionId?: string; error?: string }> => {
  const config = await getServerBotConfig();
  const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return { ok: false, error: "બોટ ટોકન કન્ફિગર થયેલ નથી." };
  }

  // Numeric chat IDs work directly. Public @usernames are resolved with
  // getChat so schedules can target them too.
  let resolvedChatId = Number(options.chatId);
  if (!Number.isFinite(resolvedChatId) || resolvedChatId === 0) {
    const lookup = await callTelegram(token, "getChat", {
      chat_id: options.chatId,
    });
    resolvedChatId = Number(lookup.result?.id);
    if (!lookup.ok || !Number.isFinite(resolvedChatId)) {
      return {
        ok: false,
        error:
          lookup.description ||
          `ગ્રૂપ ID માન્ય નથી: ${String(options.chatId)}`,
      };
    }
  }

  const ctx: BotContext = {
    config,
    token,
    chatId: resolvedChatId,
    chatTitle: options.chatTitle,
    fromUser: options.startedBy || {
      id: "0",
      first_name: "Admin Scheduler",
    },
    isAdmin: true,
    configuredAppUrl:
      config.webAppUrl ||
      options.hostOrigin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
  };

  const result = await startQuizSession(ctx, options.quiz);
  return {
    ok: result.ok,
    sessionId: result.session?.id,
    error: result.error,
  };
};

// ==========================================
// Main entry point
// ==========================================

export const processTelegramUpdate = async (
  update: any,
  hostOrigin?: string
): Promise<BotProcessResult> => {
  // Poll answers arrive without a message payload — handle them first.
  if (update?.poll_answer) {
    return handlePollAnswer(update);
  }

  const config = await getServerBotConfig();
  const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return { handled: false, text: "No bot token configured" };
  }

  const message =
    update.message || update.channel_post || update.callback_query?.message;
  if (!message) {
    return { handled: false };
  }

  const chatId = Number(message.chat?.id);
  const fromUser = update.message?.from || update.callback_query?.from || {};
  const fromUserId = String(fromUser.id || "");
  const fromUsername = String(fromUser.username || "").toLowerCase();

  const adminId = String(config.adminTelegramId || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  const isAdmin = Boolean(
    adminId && (fromUserId === adminId || fromUsername === adminId)
  );

  // If a non-admin posts ANY message in a group while a quiz is active,
  // queue it for silent 15-second auto-deletion.
  const pendingDelete = update.message
    ? await maybeQueueAutoDelete(update.message, token, isAdmin)
    : undefined;

  const result = await handleTelegramMessageUpdate({
    update,
    message,
    config,
    token,
    chatId,
    fromUser,
    fromUserId,
    isAdmin,
    hostOrigin,
  });

  return pendingDelete
    ? { ...result, autoDeleteScheduled: true, pendingDelete }
    : result;
};

const handleTelegramMessageUpdate = async ({
  update,
  message,
  config,
  token,
  chatId,
  fromUser,
  fromUserId,
  isAdmin,
  hostOrigin,
}: {
  update: any;
  message: any;
  config: TelegramBotConfig;
  token: string;
  chatId: number;
  fromUser: any;
  fromUserId: string;
  isAdmin: boolean;
  hostOrigin?: string;
}): Promise<BotProcessResult> => {
  let text = String(
    message.text || update.callback_query?.data || ""
  ).trim();

  // Strip @botusername from commands: "/quiz@MyBot CODE" -> "/quiz CODE"
  if (text.startsWith("/")) {
    text = text.replace(/^(\/[a-zA-Z0-9_]+)@[a-zA-Z0-9_]+/, "$1");
  }

  const configuredAppUrl =
    config.webAppUrl ||
    hostOrigin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const ctx: BotContext = {
    config,
    token,
    chatId,
    chatTitle: message.chat?.title,
    fromUser,
    isAdmin,
    configuredAppUrl,
  };

  // Always acknowledge callback queries so the button spinner stops.
  if (update.callback_query?.id) {
    await callTelegram(token, "answerCallbackQuery", {
      callback_query_id: update.callback_query.id,
    });
  }

  let cleanText = text;

  // Inline callback actions that are not plain commands
  if (cleanText === "WEBHOOK_SET") {
    if (!isAdmin) {
      await sendMessage(ctx, `⛔ માત્ર એડમિન જ Webhook સેટ કરી શકે છે.`);
      return { handled: true, action: "admin_denied" };
    }
    const result = await setupTelegramWebhook(config, hostOrigin, "set");
    await sendMessage(
      ctx,
      result.ok
        ? `✅ <b>Webhook સફળતાપૂર્વક સેટ થયું!</b>\n\n🔗 URL: <code>${escapeHtml(
            result.url || ""
          )}</code>\n🔐 Secret configured ✓\n\nહવે ટેલિગ્રામ દરેક મેસેજ તરત જ આ એપને મોકલશે.`
        : `❌ <b>Webhook સેટ કરી શકાયું નહીં.</b>\n\n${escapeHtml(
            result.error || "Unknown error"
          )}`
    );
    return { handled: true, action: "webhook_set" };
  }

  if (cleanText === "WEBHOOK_INFO") {
    if (!isAdmin) {
      await sendMessage(ctx, `⛔ માત્ર એડમિન જ આ માહિતી જોઈ શકે છે.`);
      return { handled: true, action: "admin_denied" };
    }
    const info = await setupTelegramWebhook(config, hostOrigin, "info");
    const result = info.result || {};
    await sendMessage(
      ctx,
      `🔗 <b>Webhook માહિતી</b>\n\n` +
        `URL: <code>${escapeHtml(result.url || "સેટ નથી")}</code>\n` +
        `Pending updates: <b>${result.pending_update_count ?? 0}</b>\n` +
        `Last error: <b>${escapeHtml(
          result.last_error_message || "કોઈ નહીં"
        )}</b>\n` +
        `Secret: <b>${config.webhookSecret ? "સેટ ✓" : "સેટ નથી"}</b>`
    );
    return { handled: true, action: "webhook_info" };
  }

  // ADMIN
  if (cleanText.startsWith("/admin") || cleanText === "ADMIN_PANEL") {
    if (!isAdmin) {
      await sendMessage(
        ctx,
        `⛔ <b>ઍક્સેસ નકારવામાં આવ્યો!</b>\nતમારું Telegram ID એડમિન તરીકે નોંધાયેલ નથી.\nતમારું ID: <code>${escapeHtml(
          fromUserId || "Unknown"
        )}</code>`
      );
      return { handled: true, action: "admin_denied" };
    }
    await sendAdminMenu(ctx);
    return { handled: true, action: "admin_menu" };
  }

  // DISPATCH (admin only)
  if (cleanText.startsWith("/dispatch") || cleanText.startsWith("/daily")) {
    if (!isAdmin) {
      await sendMessage(ctx, `⛔ માત્ર એડમિન જ આ કમાન્ડ આપી શકે છે.`);
      return { handled: true, action: "admin_denied" };
    }
    await handleDispatch(ctx);
    return { handled: true, action: "dispatched" };
  }

  // STOP (allows bot admin, private chat, or session starter)
  if (cleanText.startsWith("/stop")) {
    const code = cleanText.split(/\s+/)[1] || "";
    await handleStop(ctx, code);
    return { handled: true, action: "stopped" };
  }

  // STATS (admin only)
  if (cleanText.startsWith("/stats")) {
    if (!isAdmin) {
      await sendMessage(ctx, `⛔ માત્ર એડમિન જ આંકડા જોઈ શકે છે.`);
      return { handled: true, action: "admin_denied" };
    }
    await handleStats(ctx);
    return { handled: true, action: "stats" };
  }

  // START / MINI APP / DEEP LINK
  if (
    cleanText.startsWith("/start") ||
    cleanText.startsWith("/miniapp") ||
    cleanText.startsWith("/app") ||
    cleanText.startsWith("/create")
  ) {
    const parts = cleanText.split(/\s+/);
    let deepLinkedCode = "";
    if (parts[1]) {
      deepLinkedCode = parts[1].replace(/^test_/, "").trim();
    }

    if (deepLinkedCode) {
      cleanText = `/quiz ${deepLinkedCode}`;
    } else {
      if (ctx.chatId < 0) {
        await sendMessage(
          ctx,
          `👋 <b>નમસ્તે! મોક ટેસ્ટ બોટ ગ્રૂપમાં સક્રિય છે!</b> 🎯\n\n` +
            `👉 ગ્રૂપમાં ટેસ્ટ શરૂ કરવા: <code>/quiz &lt;CODE&gt;</code>\n` +
            `👉 લાઈવ પરિણામ જોવા: <code>/results</code>\n` +
            `👉 નવો ટેસ્ટ બનાવવા અને પેપર સેટ કરવા મને પ્રાઇવેટ ચેટમાં <code>/start</code> મોકલો.`
        );
        return { handled: true, action: "start_group" };
      }

      await sendMessage(
        ctx,
        `👋 <b>નમસ્તે! MCQ Master Mock Test Bot માં આપનું સ્વાગત છે!</b> 🎯\n\n` +
          `અહીં તમે તમારા ગ્રૂપ માટે મોક ટેસ્ટ બનાવી શકો છો અને ટેલિગ્રામમાં લાઈવ ક્વિઝ રમી શકો છો.\n\n` +
          `📱 <b>નવા ટેસ્ટ બનાવવા માટે નીચેના બટન પર ક્લિક કરો:</b>`,
        {
          inline_keyboard: [
            [createMiniAppButton(ctx, "🚀 Open MCQ Master Mini App (ટેસ્ટ બનાવો)")],
            [
              { text: "❓ મદદ અને કમાન્ડ્સ", callback_data: "/help" },
              { text: "📊 લાઈવ સ્કોર", callback_data: "/results" },
            ],
          ],
        }
      );
      return { handled: true, action: "start" };
    }
  }

  // HELP
  if (cleanText.startsWith("/help")) {
    await sendMessage(
      ctx,
      `📖 <b>MCQ Master Bot કમાન્ડ ગાઈડ:</b>\n\n` +
        `👉 <code>/quiz &lt;CODE&gt;</code> - ગ્રૂપમાં મોક ટેસ્ટ શરૂ કરો\n` +
        `👉 <code>/results &lt;CODE&gt;</code> - લાઈવ / અંતિમ લીડરબોર્ડ\n` +
        `👉 <code>/stop &lt;CODE&gt;</code> - ટેસ્ટ પૂરી કરો (admin)\n` +
        `👉 <code>/miniapp</code> - મોબાઇલ Mini App ખોલો\n` +
        `👉 <code>/admin</code> - એડમિન કંટ્રોલ પેનલ\n\n` +
        `<i>ઉદાહરણ:</i> <code>/quiz TEST-1001</code>`
    );
    return { handled: true, action: "help" };
  }

  // RESULTS
  if (
    cleanText.startsWith("/results") ||
    cleanText.startsWith("/leaderboard") ||
    cleanText.startsWith("/score")
  ) {
    const code = cleanText.split(/\s+/)[1] || "";
    await handleResults(ctx, code);
    return { handled: true, action: "results_sent" };
  }

  // QUIZ LIST COMMAND (when user just types /quiz, /test, /quizzes or clicks /quiz button)
  if (
    cleanText === "/quiz" ||
    cleanText === "/test" ||
    cleanText === "/quizzes" ||
    cleanText === "/tests"
  ) {
    const all = await getAllServerQuizzes();
    if (all.length === 0) {
      await sendMessage(
        ctx,
        `📚 <b>હાલમાં કોઈ મોક ટેસ્ટ ઉપલબ્ધ નથી.</b>\nMini App દ્વારા નવો ટેસ્ટ બનાવો!`,
        {
          inline_keyboard: [[createMiniAppButton(ctx, "🚀 Mini App ખોલો")]],
        }
      );
      return { handled: true, action: "quizzes_empty" };
    }

    let msg = `📚 <b>ઉપલબ્ધ મોક ટેસ્ટ્સ (Mock Tests):</b>\n\n`;
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    all.slice(0, 10).forEach((q, idx) => {
      const qCount = q.questions?.length || 0;
      msg += `${idx + 1}. <b>${escapeHtml(q.title || "Mock Test")}</b>\n`;
      msg += `   📝 કોડ: <code>${escapeHtml(q.code)}</code> (${qCount} MCQs)\n`;
      msg += `   👉 શરૂ કરવા ક્લિક કરો: <code>/quiz ${escapeHtml(q.code)}</code>\n\n`;

      if (keyboard.length < 5) {
        keyboard.push([
          {
            text: `▶️ ${q.code} (${qCount} MCQs) - ${q.title.slice(0, 24)}`,
            callback_data: `/quiz ${q.code}`,
          },
        ]);
      }
    });

    msg += `<i>કોઈપણ ટેસ્ટ શરૂ કરવા ઉપરના બટન પર ક્લિક કરો અથવા કમાન્ડ લખો: <code>/quiz &lt;CODE&gt;</code></i>`;

    await sendMessage(ctx, msg, { inline_keyboard: keyboard });
    return { handled: true, action: "quizzes_list" };
  }

  // QUIZ CODE PARSING
  let quizCode = "";
  let isExplicitCommand = false;

  if (cleanText.startsWith("/quiz") || cleanText.startsWith("/test")) {
    quizCode = cleanText.replace(/^(\/quiz|\/test)\s*/i, "").trim();
    isExplicitCommand = true;
  } else if (/^[A-Za-z]{2,10}-\d{3,6}$/i.test(cleanText)) {
    // Strict test code format e.g. TEST-1062, GSRTC-1062, TEST-8613
    quizCode = cleanText.toUpperCase();
  } else if (/^#(TEST-)?\d{3,6}$/i.test(cleanText)) {
    // Hash format e.g. #1062 or #TEST-1062
    quizCode = cleanText.replace(/^#/, "").toUpperCase();
  } else if (ctx.chatId > 0 && /^\d{3,6}$/.test(cleanText)) {
    // Only in private DM chat with the bot, allow pure digit codes like 1062
    quizCode = cleanText;
  }

  if (quizCode) {
    const quiz = await getServerQuizByCode(quizCode);
    if (!quiz) {
      // In a group, never reply to normal chat words - only reply if user explicitly typed /quiz or an actual test code pattern
      const isGroup = ctx.chatId < 0;
      const looksLikeTestCode =
        /^[A-Za-z]{2,10}-\d{3,6}$/i.test(quizCode) ||
        /^\d{3,6}$/.test(quizCode);
      if (isGroup && !isExplicitCommand && !looksLikeTestCode) {
        return { handled: false };
      }

      const all = await getAllServerQuizzes();
      let suggestions = "";
      if (all.length > 0) {
        suggestions =
          `\n\n💡 <b>ઉપલબ્ધ ટેસ્ટ કોડ્સ:</b>\n` +
          all
            .slice(0, 6)
            .map(
              (q) =>
                `• <code>/quiz ${escapeHtml(q.code)}</code> - ${escapeHtml(
                  q.title
                )} (${q.questions?.length || 0} MCQs)`
            )
            .join("\n");
      }
      await sendMessage(
        ctx,
        `❌ <b>ટેસ્ટ કોડ '${escapeHtml(quizCode)}' મળ્યો નથી!</b>\n` +
          `કૃપા કરીને સાચો કોડ દાખલ કરો અથવા નીચે આપેલા કોડ્સમાંથી પસંદ કરો:${suggestions}`
      );
      return { handled: true, action: "quiz_not_found" };
    }

    const result = await startQuizSession(ctx, quiz);
    return {
      handled: true,
      action: result.ok ? "quiz_started" : "quiz_start_failed",
    };
  }

  return { handled: false };
};
