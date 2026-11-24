import {
  TelegramBotConfig,
  TelegramQuiz,
  TelegramQuizSession,
  ScheduledDailyTest,
  TestAttemptResult,
  ServerOverviewStats,
} from "@/types";
import { getStorageMode, kvGetJson, kvSetJson, withKeyLock } from "./kvStore";

const BOT_CONFIG_KEY = "bot_config.json";
const QUIZZES_KEY = "quizzes.json";
const SESSIONS_KEY = "sessions.json";
const SCHEDULES_KEY = "schedules.json";
const ATTEMPTS_KEY = "attempts.json";

const MAX_QUIZZES = 800;
const MAX_SESSIONS = 400;
const MAX_ATTEMPTS = 1000;

const envDefaults = (): TelegramBotConfig => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  botUsername:
    process.env.TELEGRAM_BOT_USERNAME ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    "GsrtcMockQuizBot",
  adminTelegramId: process.env.TELEGRAM_ADMIN_ID || "",
  webAppUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  defaultTimePerQuestion: 30,
  targetGroupId: "",
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  pollDelayMs: Number(process.env.TELEGRAM_POLL_DELAY_MS || 400),
});

export const getServerBotConfig = async (): Promise<TelegramBotConfig> => {
  const defaults = envDefaults();
  const stored = await kvGetJson<Partial<TelegramBotConfig>>(BOT_CONFIG_KEY, {});

  return {
    ...defaults,
    ...stored,
    // Admin config takes precedence so changing the bot in the admin panel
    // immediately activates the new bot. Environment variable acts as fallback.
    botToken: stored.botToken || process.env.TELEGRAM_BOT_TOKEN || "",
    botUsername: stored.botUsername || defaults.botUsername,
    adminTelegramId:
      stored.adminTelegramId || defaults.adminTelegramId || "",
    webAppUrl: stored.webAppUrl || defaults.webAppUrl || "",
    webhookSecret:
      stored.webhookSecret || defaults.webhookSecret || "",
    pollDelayMs: Number(stored.pollDelayMs ?? defaults.pollDelayMs ?? 400),
    defaultTimePerQuestion: Number(
      stored.defaultTimePerQuestion ?? defaults.defaultTimePerQuestion ?? 30
    ),
  };
};

export const saveServerBotConfig = async (
  config: TelegramBotConfig
): Promise<void> => {
  await kvSetJson(BOT_CONFIG_KEY, config);
};

const normalizeQuiz = (quiz: TelegramQuiz): TelegramQuiz => {
  let title = String(quiz.title || "સ્પર્ધાત્મક પરીક્ષા મોક ટેસ્ટ").trim().slice(0, 200);
  if (title === "GSRTC સ્પેશિયલ મોક ટેસ્ટ") {
    title = "સ્પર્ધાત્મક પરીક્ષા મોક ટેસ્ટ";
  }
  let subject = String(quiz.subject || "સામાન્ય જ્ઞાન & કરંટ અફેર્સ").trim().slice(0, 200);
  if (subject === "સામાન્ય જ્ઞાન & એક્ટ") {
    subject = "સામાન્ય જ્ઞાન & કરંટ અફેર્સ";
  }

  return {
    ...quiz,
    code: String(quiz.code || "").trim().toUpperCase(),
    title,
    subject,
    timePerQuestion: Math.max(10, Math.min(600, Number(quiz.timePerQuestion) || 30)),
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.slice(0, 500).map((q) => ({
          ...q,
          questionText: String(q.questionText || "").slice(0, 3000),
          options: Array.isArray(q.options)
            ? q.options.slice(0, 10).map((o) => String(o || "").slice(0, 500))
            : [],
          correctAnswer: Math.max(0, Number(q.correctAnswer) || 0),
          explanation: q.explanation ? String(q.explanation).slice(0, 4000) : "",
        }))
      : [],
  };
};

export const getAllServerQuizzes = async (): Promise<TelegramQuiz[]> => {
  const quizzes = await kvGetJson<TelegramQuiz[]>(QUIZZES_KEY, []);
  return Array.isArray(quizzes) ? quizzes : [];
};

export const saveServerQuiz = async (quiz: TelegramQuiz): Promise<void> => {
  if (!quiz || !quiz.code) return;
  const normalized = normalizeQuiz(quiz);

  await withKeyLock(QUIZZES_KEY, async () => {
    const all = await getAllServerQuizzes();
    const idx = all.findIndex(
      (q) => q.code.toUpperCase() === normalized.code.toUpperCase()
    );
    if (idx >= 0) {
      all[idx] = normalized;
    } else {
      all.unshift(normalized);
    }
    all.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    await kvSetJson(QUIZZES_KEY, all.slice(0, MAX_QUIZZES));
  });
};

export const getServerQuizByCode = async (
  code: string
): Promise<TelegramQuiz | null> => {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return null;
  const all = await getAllServerQuizzes();
  return all.find((q) => q.code.toUpperCase() === cleanCode) || null;
};

export const deleteServerQuiz = async (
  codeOrPaperId: string
): Promise<boolean> => {
  const target = codeOrPaperId.trim().toUpperCase();
  if (!target) return false;

  return await withKeyLock(QUIZZES_KEY, async () => {
    const all = await getAllServerQuizzes();
    const filtered = all.filter(
      (q) =>
        q.code.toUpperCase() !== target &&
        String(q.paperId || "").toUpperCase() !== target
    );
    if (filtered.length !== all.length) {
      await kvSetJson(QUIZZES_KEY, filtered);
      return true;
    }
    return false;
  });
};

// ==========================================
// Live quiz sessions (real poll answers)
// ==========================================

export const sessionId = (code: string, chatId: number): string =>
  `${code.toUpperCase()}@${chatId}`;

export const getAllSessions = async (): Promise<TelegramQuizSession[]> => {
  const sessions = await kvGetJson<TelegramQuizSession[]>(SESSIONS_KEY, []);
  return Array.isArray(sessions) ? sessions : [];
};

export const getSession = async (
  code: string,
  chatId: number
): Promise<TelegramQuizSession | null> => {
  const id = sessionId(code, chatId);
  const all = await getAllSessions();
  return all.find((s) => s.id === id) || null;
};

export const getLatestSessionByCode = async (
  code: string
): Promise<TelegramQuizSession | null> => {
  const clean = code.trim().toUpperCase();
  const all = await getAllSessions();
  return (
    all
      .filter((s) => s.code.toUpperCase() === clean)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )[0] || null
  );
};

export const saveSession = async (
  session: TelegramQuizSession
): Promise<void> => {
  await withKeyLock(SESSIONS_KEY, async () => {
    const all = await getAllSessions();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      all[idx] = session;
    } else {
      all.unshift(session);
    }
    all.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    await kvSetJson(SESSIONS_KEY, all.slice(0, MAX_SESSIONS));
  });
};

export const findSessionByPollId = async (
  pollId: string
): Promise<TelegramQuizSession | null> => {
  const all = await getAllSessions();
  const target = String(pollId || "").trim();
  return (
    all.find((s) => s.polls.some((p) => String(p.pollId).trim() === target)) || null
  );
};

// ==========================================
// Daily test schedules (server-side)
// ==========================================

export const getAllServerSchedules = async (): Promise<
  ScheduledDailyTest[]
> => {
  const schedules = await kvGetJson<ScheduledDailyTest[]>(SCHEDULES_KEY, []);
  return Array.isArray(schedules) ? schedules : [];
};

export const saveServerSchedule = async (
  schedule: ScheduledDailyTest
): Promise<void> => {
  await withKeyLock(SCHEDULES_KEY, async () => {
    const all = await getAllServerSchedules();
    const idx = all.findIndex((s) => s.id === schedule.id);
    if (idx >= 0) {
      all[idx] = schedule;
    } else {
      all.unshift(schedule);
    }
    await kvSetJson(SCHEDULES_KEY, all);
  });
};

export const deleteServerSchedule = async (id: string): Promise<void> => {
  await withKeyLock(SCHEDULES_KEY, async () => {
    const all = await getAllServerSchedules();
    await kvSetJson(
      SCHEDULES_KEY,
      all.filter((s) => s.id !== id)
    );
  });
};

// ==========================================
// Test attempts (in-app results synced to server)
// ==========================================

export const getAllServerAttempts = async (): Promise<TestAttemptResult[]> => {
  const attempts = await kvGetJson<TestAttemptResult[]>(ATTEMPTS_KEY, []);
  return Array.isArray(attempts) ? attempts : [];
};

export const saveServerAttempt = async (
  attempt: TestAttemptResult
): Promise<void> => {
  if (!attempt || !attempt.id) return;
  await withKeyLock(ATTEMPTS_KEY, async () => {
    const all = await getAllServerAttempts();
    if (!all.some((a) => a.id === attempt.id)) {
      all.unshift(attempt);
    }
    await kvSetJson(ATTEMPTS_KEY, all.slice(0, MAX_ATTEMPTS));
  });
};

export const getServerAttemptsFor = async (
  testCodeOrPaperId?: string
): Promise<TestAttemptResult[]> => {
  const all = await getAllServerAttempts();
  if (!testCodeOrPaperId) return all;
  const q = testCodeOrPaperId.toLowerCase().trim();
  return all.filter(
    (a) =>
      a.testCode?.toLowerCase() === q || a.paperId?.toLowerCase() === q
  );
};

// ==========================================
// Aggregated statistics (admin dashboard / bot /stats)
// ==========================================

export const getServerOverviewStats = async (): Promise<ServerOverviewStats> => {
  const [quizzes, sessions, attempts, schedules, config] = await Promise.all([
    getAllServerQuizzes(),
    getAllSessions(),
    getAllServerAttempts(),
    getAllServerSchedules(),
    getServerBotConfig(),
  ]);

  const totalQuizQuestions = quizzes.reduce(
    (sum, q) => sum + (q.questions?.length || 0),
    0
  );
  const allParticipants = new Set<string>();
  sessions.forEach((session) => {
    Object.keys(session.participants || {}).forEach((id) =>
      allParticipants.add(`${session.id}:${id}`)
    );
  });
  const averagePercentage =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) /
            attempts.length
        )
      : 0;

  return {
    quizzes: quizzes.length,
    totalQuizQuestions,
    sessions: sessions.length,
    activeSessions: sessions.filter((s) => s.status === "active").length,
    participants: allParticipants.size,
    attempts: attempts.length,
    averagePercentage,
    schedules: schedules.length,
    storageMode: getStorageMode(),
    webhookConfigured: Boolean(config.webhookUrl || config.webAppUrl),
  };
};
