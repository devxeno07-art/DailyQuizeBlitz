import crypto from "crypto";
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
  findSessionByPollId,
  saveServerBotConfig,
  getServerOverviewStats,
  sessionId,
} from "./serverStorage";

export interface BotProcessResult {
  handled: boolean;
  action?: string;
  chatId?: number;
  text?: string;
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
// Small grace period after a poll's open_period before the next question is
// posted. Keeps a short visible gap instead of overlapping two questions.
const NEXT_POLL_GRACE_MS = 1200;

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
  const result = await callTelegram(ctx.token, "sendMessage", {
    chat_id: ctx.chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
  return !!result.ok;
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

const sendLeaderboard = async (
  ctx: Pick<BotContext, "token" | "chatId">,
  session: TelegramQuizSession,
  final: boolean
): Promise<boolean> => {
  const text = buildLeaderboardText(session, final);
  const ok = await sendMessage(ctx, text);
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
    const ok = await sendLeaderboard(
      { token, chatId: session.chatId },
      session,
      true
    );
    if (ok) finalized += 1;
  }
  return finalized;
};

const getSessionTimePerQuestion = (
  session: TelegramQuizSession
): number =>
  Math.max(
    10,
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
  const questionText = truncate(
    `પ્રશ્ન ${index + 1}/${total}\n${String(question.questionText || "")}`,
    300
  );

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
  // The final leaderboard may only go out once this poll's timer has closed.
  session.finalizeAt = new Date(
    sentAt.getTime() + timePerQuestion * 1000 + 5000
  ).toISOString();
  session.status = "active";
  await saveSession(session);
  return { ok: true };
};

let advanceInProgress = false;

/**
 * Sequential quiz runner. Called by the polling daemon (every second) and by
 * the cron tick. Sends the next question only after the previous poll's
 * open_period has elapsed, so participants never see the whole paper at once.
 */
export const advanceQuizSessions = async (): Promise<{
  sent: number;
  errors: string[];
}> => {
  // The polling daemon and cron tick can overlap; never send two polls for
  // the same session from two concurrent calls in this process.
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
      if (total === 0 || session.polls.length >= total) continue;
      if (session.polls.length === 0) continue; // first poll is sent at start

      const lastPoll = session.polls[session.polls.length - 1];
      const lastSentAt = new Date(lastPoll.sentAt).getTime();
      if (!Number.isFinite(lastSentAt)) continue;

      const dueAt =
        lastSentAt +
        getSessionTimePerQuestion(session) * 1000 +
        NEXT_POLL_GRACE_MS;
      if (now < dueAt) continue;

      const ctx = { token, chatId: session.chatId };
      const result = await sendPollForQuestion(
        ctx,
        session,
        session.polls.length
      );

      if (!result.ok) {
        session.status = "error";
        session.error = result.error;
        await saveSession(session);
        errors.push(`${session.id}: ${result.error}`);
        await sendMessage(
          ctx,
          `⚠️ <b>પોલ મોકલવામાં ભૂલ આવી.</b>\n` +
            `પ્રશ્ન #${session.polls.length + 1} પર ટેસ્ટ અટકી ગઈ.\n\n` +
            `<i>${escapeHtml(result.error || "Unknown error")}</i>\n\n` +
            `👉 હજુ સુધી મળેલા જવાબોનું પરિણામ: <code>/results ${escapeHtml(
              session.code
            )}</code>`
        );
        continue;
      }
      sent += 1;
    }

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

  const existing = await getSession(quiz.code, ctx.chatId);
  // Block re-runs for any unfinished session that already has polls in the
  // group (active OR partially failed). Re-sending would duplicate polls.
  if (
    existing &&
    existing.polls.length > 0 &&
    existing.status !== "completed" &&
    existing.status !== "stopped"
  ) {
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
        10,
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

  const introOk = await sendMessage(
    ctx,
    `🎯 <b>મોક ટેસ્ટ શરૂ થઈ રહી છે!</b>\n\n` +
      `📝 <b>શીર્ષક:</b> ${escapeHtml(session.quiz.title)}\n` +
      `📚 <b>વિષય:</b> ${escapeHtml(session.quiz.subject)}\n` +
      `🔢 <b>કુલ પ્રશ્નો:</b> ${sendable.length}\n` +
      `⏱ <b>સમય:</b> ${session.quiz.timePerQuestion} સેકન્ડ/પ્રશ્ન\n` +
      `👤 <b>શરૂ કરનાર:</b> ${escapeHtml(session.startedBy.name)}\n\n` +
      `<i>હવે એક સમયે ફક્ત એક જ પ્રશ્ન આવશે. જવાબ આપવા માટે ${session.quiz.timePerQuestion} સેકન્ડ મળશે, પછી આપોઆપ આગલો પ્રશ્ન આવશે.</i>`
  );

  if (!introOk) {
    session.status = "error";
    session.error = "Could not send intro message";
    await saveSession(session);
    return { ok: false, error: session.error };
  }

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

  await sendMessage(
    ctx,
    `✅ <b>પ્રથમ પ્રશ્ન મોકલાયો!</b>\n\n` +
      `🔑 ટેસ્ટ કોડ: <code>${escapeHtml(quiz.code)}</code>\n` +
      `⏱ દર ${session.quiz.timePerQuestion} સેકન્ડે આગલો પ્રશ્ન આવશે.\n` +
      `👉 લાઈવ સ્કોર: <code>/results ${escapeHtml(quiz.code)}</code>\n` +
      `👉 ટેસ્ટ વહેલી પૂરી કરવા: <code>/stop ${escapeHtml(quiz.code)}</code>\n\n` +
      `<i>છેલ્લા પ્રશ્નનો સમય પૂરો થયા પછી અંતિમ લીડરબોર્ડ આપોઆપ મોકલાશે.</i>`
  );

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

  const session = await findSessionByPollId(pollAnswer.poll_id);
  if (!session) return { handled: false };

  // Once a final leaderboard was sent, don't mutate historical results.
  if (session.status === "completed" || session.status === "stopped") {
    return { handled: true, action: "late_poll_answer_ignored" };
  }

  const poll = session.polls.find((p) => p.pollId === pollAnswer.poll_id);
  if (!poll) return { handled: false };

  const userId = String(pollAnswer.user.id);
  const now = new Date().toISOString();
  const existing = session.participants[userId];

  const participant: TelegramParticipant = existing || {
    userId,
    name: userDisplayName(pollAnswer.user),
    username: pollAnswer.user.username,
    answers: {},
    score: 0,
    wrong: 0,
    answeredCount: 0,
    joinedAt: now,
    lastAnsweredAt: now,
  };

  participant.name = userDisplayName(pollAnswer.user);
  participant.username = pollAnswer.user.username;

  const optionIds = Array.isArray(pollAnswer.option_ids)
    ? pollAnswer.option_ids
    : [];
  if (optionIds.length === 0) {
    delete participant.answers[poll.pollId];
  } else {
    participant.answers[poll.pollId] = {
      optionId: Number(optionIds[0]),
      answeredAt: now,
    };
  }
  participant.lastAnsweredAt = now;

  let score = 0;
  let wrong = 0;
  let answeredCount = 0;
  for (const sessionPoll of session.polls) {
    const answer = participant.answers[sessionPoll.pollId];
    if (!answer || answer.optionId < 0) continue;
    answeredCount += 1;
    if (answer.optionId === sessionPoll.correctOptionId) {
      score += 1;
    } else {
      wrong += 1;
    }
  }
  participant.score = score;
  participant.wrong = wrong;
  participant.answeredCount = answeredCount;

  session.participants[userId] = participant;
  await saveSession(session);

  return {
    handled: true,
    action: "poll_answer_recorded",
    chatId: session.chatId,
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
    await sendMessage(ctx, `❌ ચાલુ ટેસ્ટ સેશન મળ્યું નથી.`);
    return;
  }

  session.status = "stopped";
  await saveSession(session);
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

  // STOP (admin only)
  if (cleanText.startsWith("/stop")) {
    if (!isAdmin) {
      await sendMessage(ctx, `⛔ માત્ર એડમિન જ ટેસ્ટ બંધ કરી શકે છે.`);
      return { handled: true, action: "admin_denied" };
    }
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
        `<i>ઉદાહરણ:</i> <code>/quiz GSRTC-1001</code>`
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

  // QUIZ CODE PARSING
  let quizCode = "";
  if (cleanText.startsWith("/quiz") || cleanText.startsWith("/test")) {
    quizCode = cleanText.split(/\s+/)[1] || "";
  } else if (/^[A-Za-z]{3,12}-\d{3,6}$/.test(cleanText)) {
    // Bare test code typed in the group, e.g. GSRTC-4821
    quizCode = cleanText;
  }

  if (quizCode) {
    const quiz = await getServerQuizByCode(quizCode);
    if (!quiz) {
      await sendMessage(
        ctx,
        `❌ <b>ટેસ્ટ કોડ '${escapeHtml(quizCode)}' મળ્યો નથી!</b>\n` +
          `કૃપા કરીને સાચો કોડ દાખલ કરો અથવા Mini App પરથી નવો કોડ બનાવો.`
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
