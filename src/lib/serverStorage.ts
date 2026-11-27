import {
  TelegramBotConfig,
  TelegramQuiz,
  TelegramQuizSession,
  ScheduledDailyTest,
  TestAttemptResult,
  ServerOverviewStats,
  PaperSetDispatchRecord,
  UpcomingReminderRecord,
  UserProfile,
  Paper,
} from "@/types";
import {
  getStorageMode,
  kvGetJson,
  kvSetJson,
  withKeyLock,
  withDistributedLock,
} from "./kvStore";

const BOT_CONFIG_KEY = "bot_config.json";
const QUIZZES_KEY = "quizzes.json";
const SESSIONS_KEY = "sessions.json";
const SCHEDULES_KEY = "schedules.json";
const ATTEMPTS_KEY = "attempts.json";
const PAPER_SETS_KEY = "paper_set_progress.json";

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

const isSetOrScheduledQuiz = (quiz: TelegramQuiz): boolean => {
  const pid = String(quiz.paperId || "");
  return Boolean(
    quiz.setMeta ||
      quiz.parentPaperId ||
      pid.includes("::set_") ||
      pid.startsWith("sched_")
  );
};

const getQuizDedupKey = (quiz: TelegramQuiz): string => {
  if (isSetOrScheduledQuiz(quiz)) {
    return quiz.code.toUpperCase();
  }
  return quiz.paperId || quiz.code.toUpperCase();
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
    timePerQuestion: Math.max(5, Math.min(600, Number(quiz.timePerQuestion) || 30)),
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.slice(0, 2000).map((q) => ({
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
  if (!Array.isArray(quizzes)) return [];

  // Deduplicate master quizzes sharing the same paperId, keeping highest question count,
  // while preserving every individual set/scheduled quiz by its unique code.
  const map = new Map<string, TelegramQuiz>();
  for (const q of quizzes) {
    const key = getQuizDedupKey(q);
    const existing = map.get(key);
    if (
      !existing ||
      (q.questions?.length || 0) > (existing.questions?.length || 0)
    ) {
      map.set(key, q);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

export const saveServerQuiz = async (quiz: TelegramQuiz): Promise<void> => {
  if (!quiz || !quiz.code) return;
  const normalized = normalizeQuiz(quiz);
  const normalizedIsSubset = isSetOrScheduledQuiz(normalized);

  await withKeyLock(QUIZZES_KEY, async () => {
    const all = await kvGetJson<TelegramQuiz[]>(QUIZZES_KEY, []);
    const list = Array.isArray(all) ? all : [];

    const idx = list.findIndex((q) => {
      if (q.code.toUpperCase() === normalized.code.toUpperCase()) return true;
      if (normalizedIsSubset || isSetOrScheduledQuiz(q)) return false;
      return Boolean(
        normalized.paperId && q.paperId && q.paperId === normalized.paperId
      );
    });

    if (idx >= 0) {
      list[idx] = normalized;
    } else {
      list.unshift(normalized);
    }

    const map = new Map<string, TelegramQuiz>();
    for (const q of list) {
      const key = getQuizDedupKey(q);
      const existing = map.get(key);
      if (
        !existing ||
        (q.questions?.length || 0) >= (existing.questions?.length || 0)
      ) {
        map.set(key, q);
      }
    }

    const deduplicated = Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    await kvSetJson(QUIZZES_KEY, deduplicated.slice(0, MAX_QUIZZES));
  });
};

export const getServerQuizByCode = async (
  code: string
): Promise<TelegramQuiz | null> => {
  if (!code) return null;
  let decoded = code;
  try {
    decoded = decodeURIComponent(code);
  } catch {}

  const raw = decoded.trim();
  if (!raw) return null;

  // Clean code: remove leading /quiz, /test, #, test_
  const clean = raw
    .replace(/^(\/quiz|\/test)\s*/i, "")
    .replace(/^[#]/, "")
    .replace(/^test_/i, "")
    .trim()
    .toUpperCase();

  if (!clean) return null;

  const all = await getAllServerQuizzes();

  // 1. Direct match on code
  let match = all.find((q) => q.code.toUpperCase() === clean);
  if (match) return match;

  // 2. Direct match on TEST- prefix if user passed just the numbers e.g. "1062"
  match = all.find((q) => q.code.toUpperCase() === `TEST-${clean}`);
  if (match) return match;

  // 3. Match stripping "TEST-" prefix from both
  const cleanBare = clean.replace(/^TEST-/, "");
  match = all.find(
    (q) => q.code.toUpperCase().replace(/^TEST-/, "") === cleanBare
  );
  if (match) return match;

  // 4. Match alphanumeric only
  const cleanAlnum = clean.replace(/[^A-Z0-9]/g, "");
  match = all.find(
    (q) => q.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleanAlnum
  );
  if (match) return match;

  // 5. Match by paperId
  match = all.find(
    (q) =>
      Boolean(q.paperId) &&
      (q.paperId === raw ||
        q.paperId?.toUpperCase() === clean ||
        q.paperId?.toUpperCase() === raw.toUpperCase())
  );
  if (match) return match;

  return null;
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

const mergeSessionRecords = (
  existing: TelegramQuizSession | undefined,
  incoming: TelegramQuizSession
): TelegramQuizSession => {
  if (!existing) return incoming;
  // Never merge across completely different start timestamps (e.g. a fresh re-run)
  if (existing.startedAt !== incoming.startedAt) return incoming;

  const pollMap = new Map<number, TelegramQuizSession["polls"][0]>();
  for (const p of existing.polls || []) {
    pollMap.set(p.questionIndex, p);
  }
  for (const p of incoming.polls || []) {
    pollMap.set(p.questionIndex, p);
  }
  const mergedPolls = Array.from(pollMap.values()).sort(
    (a, b) => a.questionIndex - b.questionIndex
  );

  const mergedParticipants: TelegramQuizSession["participants"] = {
    ...(existing.participants || {}),
  };
  for (const [uid, p] of Object.entries(incoming.participants || {})) {
    const prev = mergedParticipants[uid];
    if (!prev) {
      mergedParticipants[uid] = p;
    } else {
      const mergedAnswers = { ...(prev.answers || {}), ...(p.answers || {}) };
      const newer =
        new Date(p.lastAnsweredAt || 0).getTime() >=
        new Date(prev.lastAnsweredAt || 0).getTime()
          ? p
          : prev;
      mergedParticipants[uid] = {
        ...newer,
        answers: mergedAnswers,
      };
    }
  }

  const existingFin = existing.finalizeAt
    ? new Date(existing.finalizeAt).getTime()
    : 0;
  const incomingFin = incoming.finalizeAt
    ? new Date(incoming.finalizeAt).getTime()
    : 0;

  return {
    ...incoming,
    polls: mergedPolls,
    participants: mergedParticipants,
    finalizeAt:
      existingFin > incomingFin ? existing.finalizeAt : incoming.finalizeAt,
    leaderboardSentAt: existing.leaderboardSentAt || incoming.leaderboardSentAt,
  };
};

export const saveSession = async (
  session: TelegramQuizSession
): Promise<void> => {
  await withDistributedLock("sessions_write", 4000, async () => {
    await withKeyLock(SESSIONS_KEY, async () => {
      const all = await getAllSessions();
      const idx = all.findIndex((s) => s.id === session.id);
      if (idx >= 0) {
        all[idx] = mergeSessionRecords(all[idx], session);
      } else {
        all.unshift(session);
      }
      all.sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
      await kvSetJson(SESSIONS_KEY, all.slice(0, MAX_SESSIONS));
    });
  });
};

/**
 * Atomically records or updates a participant's poll answer inside the distributed
 * sessions write lock so concurrent answers or poll advances never clobber each other.
 */
export const recordSessionPollAnswer = async (params: {
  pollId: string;
  userId: string;
  name: string;
  username?: string;
  optionIds: number[];
}): Promise<
  | { status: "not_found" }
  | { status: "ignored"; session: TelegramQuizSession }
  | { status: "recorded"; session: TelegramQuizSession; questionIndex: number }
> => {
  const targetPollId = String(params.pollId || "").trim();
  return await withDistributedLock("sessions_write", 4000, async () => {
    return await withKeyLock(SESSIONS_KEY, async () => {
      const all = await getAllSessions();
      const sIdx = all.findIndex((s) =>
        s.polls.some((p) => String(p.pollId).trim() === targetPollId)
      );
      if (sIdx < 0) return { status: "not_found" as const };

      const session = all[sIdx];
      if (session.status === "completed" || session.status === "stopped") {
        return { status: "ignored" as const, session };
      }

      const poll = session.polls.find(
        (p) => String(p.pollId).trim() === targetPollId
      );
      if (!poll) return { status: "not_found" as const };

      const now = new Date().toISOString();
      const prev = session.participants[params.userId];
      const participant = prev
        ? { ...prev, answers: { ...(prev.answers || {}) } }
        : {
            userId: params.userId,
            name: params.name,
            username: params.username,
            answers: {} as Record<string, { optionId: number; answeredAt: string }>,
            score: 0,
            wrong: 0,
            answeredCount: 0,
            joinedAt: now,
            lastAnsweredAt: now,
          };

      participant.name = params.name;
      participant.username = params.username;

      if (params.optionIds.length === 0) {
        delete participant.answers[poll.pollId];
      } else {
        participant.answers[poll.pollId] = {
          optionId: Number(params.optionIds[0]),
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

      session.participants[params.userId] = participant;
      all[sIdx] = session;
      await kvSetJson(SESSIONS_KEY, all.slice(0, MAX_SESSIONS));

      return {
        status: "recorded" as const,
        session,
        questionIndex: poll.questionIndex,
      };
    });
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

// ==========================================
// Paper Set Dispatch Tracker (Completed vs Remaining Sets)
// ==========================================

export const getAllPaperSetDispatches = async (): Promise<
  PaperSetDispatchRecord[]
> => {
  const records = await kvGetJson<PaperSetDispatchRecord[]>(PAPER_SETS_KEY, []);
  return Array.isArray(records) ? records : [];
};

export const getPaperSetDispatchesFor = async (
  paperId?: string,
  testCode?: string
): Promise<PaperSetDispatchRecord[]> => {
  const all = await getAllPaperSetDispatches();
  if (!paperId && !testCode) return all;
  const pid = (paperId || "").trim();
  const code = (testCode || "").trim().toUpperCase();
  return all.filter(
    (r) =>
      (Boolean(pid) && r.paperId === pid) ||
      (Boolean(code) && String(r.testCode || "").toUpperCase() === code)
  );
};

export const savePaperSetDispatch = async (
  record: PaperSetDispatchRecord
): Promise<void> => {
  if (!record || !record.id) return;
  await withKeyLock(PAPER_SETS_KEY, async () => {
    const all = await getAllPaperSetDispatches();
    const idx = all.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.unshift(record);
    }
    await kvSetJson(PAPER_SETS_KEY, all.slice(0, 2000));
  });
};

export const deletePaperSetDispatch = async (id: string): Promise<void> => {
  if (!id) return;
  await withKeyLock(PAPER_SETS_KEY, async () => {
    const all = await getAllPaperSetDispatches();
    await kvSetJson(
      PAPER_SETS_KEY,
      all.filter((r) => r.id !== id)
    );
  });
};

export const resetPaperSetDispatches = async (
  paperId?: string,
  testCode?: string,
  setSize?: number
): Promise<void> => {
  await withKeyLock(PAPER_SETS_KEY, async () => {
    const all = await getAllPaperSetDispatches();
    const pid = (paperId || "").trim();
    const code = (testCode || "").trim().toUpperCase();
    const filtered = all.filter((r) => {
      const matchesPaper =
        (Boolean(pid) && r.paperId === pid) ||
        (Boolean(code) && String(r.testCode || "").toUpperCase() === code);
      if (!matchesPaper) return true;
      if (setSize && r.setSize !== setSize) return true;
      return false;
    });
    await kvSetJson(PAPER_SETS_KEY, filtered);
  });
};

// ==========================================
// Pending Auto-Delete Messages (during active quiz)
// ==========================================

export interface PendingDeleteRecord {
  id: string; // `${chatId}:${messageId}`
  chatId: number;
  messageId: number;
  deleteAt: number;
}

const PENDING_DELETES_KEY = "pending_deletes.json";

export const getPendingDeletes = async (): Promise<PendingDeleteRecord[]> => {
  const list = await kvGetJson<PendingDeleteRecord[]>(PENDING_DELETES_KEY, []);
  return Array.isArray(list) ? list : [];
};

export const addPendingDelete = async (
  record: PendingDeleteRecord
): Promise<void> => {
  if (!record?.id) return;
  await withKeyLock(PENDING_DELETES_KEY, async () => {
    const all = await getPendingDeletes();
    const cutoff = Date.now() - 60 * 60 * 1000;
    const fresh = all.filter((r) => r.id !== record.id && r.deleteAt > cutoff);
    fresh.push(record);
    await kvSetJson(PENDING_DELETES_KEY, fresh.slice(-500));
  });
};

export const removePendingDelete = async (id: string): Promise<void> => {
  if (!id) return;
  await withKeyLock(PENDING_DELETES_KEY, async () => {
    const all = await getPendingDeletes();
    const next = all.filter((r) => r.id !== id);
    if (next.length !== all.length) {
      await kvSetJson(PENDING_DELETES_KEY, next);
    }
  });
};

// ==========================================
// Upcoming Test Reminders (Per-Group Active Reminder State)
// ==========================================

const UPCOMING_REMINDERS_KEY = "upcoming_reminders.json";

export const getAllUpcomingReminders = async (): Promise<
  UpcomingReminderRecord[]
> => {
  const list = await kvGetJson<UpcomingReminderRecord[]>(
    UPCOMING_REMINDERS_KEY,
    []
  );
  return Array.isArray(list) ? list : [];
};

export const saveUpcomingReminder = async (
  record: UpcomingReminderRecord
): Promise<void> => {
  await withKeyLock(UPCOMING_REMINDERS_KEY, async () => {
    const all = await getAllUpcomingReminders();
    const filtered = all.filter((r) => r.groupId !== record.groupId);
    filtered.push(record);
    await kvSetJson(UPCOMING_REMINDERS_KEY, filtered);
  });
};

export const clearUpcomingReminder = async (groupId: string): Promise<void> => {
  if (!groupId) return;
  await withKeyLock(UPCOMING_REMINDERS_KEY, async () => {
    const all = await getAllUpcomingReminders();
    const next = all.filter((r) => r.groupId !== groupId);
    if (next.length !== all.length) {
      await kvSetJson(UPCOMING_REMINDERS_KEY, next);
    }
  });
};

// ==========================================
// Registered Web / Mini-App Users & Full Papers
// ==========================================

const USERS_KEY = "users.json";
const PAPERS_KEY = "papers.json";
const MAX_USERS = 5000;
const MAX_PAPERS = 1500;

export const normalizeUserId = (raw: string): string => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (/^tg_/i.test(trimmed)) {
    const digits = trimmed.replace(/^tg_/i, "").replace(/\D/g, "");
    return digits ? `tg_${digits}` : trimmed.toLowerCase();
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits || trimmed;
};

export const getAllServerUsers = async (): Promise<UserProfile[]> => {
  const users = await kvGetJson<UserProfile[]>(USERS_KEY, []);
  return Array.isArray(users) ? users : [];
};

export const saveServerUser = async (
  incoming: UserProfile
): Promise<UserProfile> => {
  const cleanId = normalizeUserId(incoming.id || incoming.phoneNumber);
  if (!cleanId) {
    throw new Error("Invalid user id");
  }

  return await withKeyLock(USERS_KEY, async () => {
    const all = await getAllServerUsers();
    const idx = all.findIndex(
      (u) => normalizeUserId(u.id || u.phoneNumber) === cleanId
    );
    const now = new Date().toISOString();

    if (idx >= 0) {
      const existing = all[idx];
      const merged: UserProfile = {
        ...existing,
        ...incoming,
        id: cleanId,
        phoneNumber: cleanId,
        name:
          String(incoming.name || "").trim() || existing.name || "વિદ્યાર્થી",
        createdAt: existing.createdAt || incoming.createdAt || now,
        lastActive:
          incoming.lastActive &&
          (!existing.lastActive ||
            new Date(incoming.lastActive).getTime() >=
              new Date(existing.lastActive).getTime())
            ? incoming.lastActive
            : existing.lastActive || now,
        hasLibraryAccess:
          existing.hasLibraryAccess !== undefined
            ? Boolean(existing.hasLibraryAccess)
            : Boolean(incoming.hasLibraryAccess),
        papersCount: Math.max(
          Number(existing.papersCount || 0),
          Number(incoming.papersCount || 0)
        ),
        questionsCount: Math.max(
          Number(existing.questionsCount || 0),
          Number(incoming.questionsCount || 0)
        ),
      };
      all[idx] = merged;
      await kvSetJson(USERS_KEY, all.slice(0, MAX_USERS));
      return merged;
    }

    const created: UserProfile = {
      id: cleanId,
      phoneNumber: cleanId,
      name: String(incoming.name || "").trim() || "વિદ્યાર્થી",
      createdAt: incoming.createdAt || now,
      lastActive: incoming.lastActive || now,
      hasLibraryAccess: Boolean(incoming.hasLibraryAccess),
      papersCount: Number(incoming.papersCount || 0),
      questionsCount: Number(incoming.questionsCount || 0),
    };
    all.unshift(created);
    await kvSetJson(USERS_KEY, all.slice(0, MAX_USERS));
    return created;
  });
};

export const toggleServerUserLibraryAccess = async (
  userId: string
): Promise<UserProfile | null> => {
  const cleanId = normalizeUserId(userId);
  if (!cleanId) return null;

  return await withKeyLock(USERS_KEY, async () => {
    const all = await getAllServerUsers();
    const idx = all.findIndex(
      (u) => normalizeUserId(u.id || u.phoneNumber) === cleanId
    );
    if (idx < 0) return null;

    const updated: UserProfile = {
      ...all[idx],
      hasLibraryAccess: !Boolean(all[idx].hasLibraryAccess),
    };
    all[idx] = updated;
    await kvSetJson(USERS_KEY, all);
    return updated;
  });
};

export const getAllServerPapers = async (): Promise<Paper[]> => {
  const papers = await kvGetJson<Paper[]>(PAPERS_KEY, []);
  return Array.isArray(papers) ? papers : [];
};

const normalizeServerPaper = (paper: Paper): Paper => {
  const cleanUserId = normalizeUserId(paper.userId || paper.creatorPhone || "");
  const now = new Date().toISOString();
  return {
    ...paper,
    id: String(paper.id).trim(),
    userId: cleanUserId || String(paper.userId || "").trim(),
    creatorPhone: cleanUserId || paper.creatorPhone,
    userName: String(paper.userName || "શિક્ષક / વિદ્યાર્થી").trim().slice(0, 120),
    title: String(paper.title || "નવું પ્રશ્નપત્ર").trim().slice(0, 200),
    subject: String(paper.subject || "સામાન્ય જ્ઞાન").trim().slice(0, 160),
    category: String(paper.category || "સ્પર્ધાત્મક પરીક્ષા").trim().slice(0, 120),
    testCode: paper.testCode ? String(paper.testCode).trim().toUpperCase() : paper.testCode,
    questions: Array.isArray(paper.questions)
      ? paper.questions.slice(0, 2000).map((q, idx) => ({
          ...q,
          questionNumber: Number(q.questionNumber) || idx + 1,
          questionText: String(q.questionText || "").slice(0, 3000),
          options: Array.isArray(q.options)
            ? q.options.slice(0, 10).map((o) => String(o ?? "").slice(0, 500))
            : [],
          correctAnswer: Math.max(0, Number(q.correctAnswer) || 0),
          explanation: q.explanation ? String(q.explanation).slice(0, 4000) : "",
        }))
      : [],
    createdAt: paper.createdAt || now,
    updatedAt: paper.updatedAt || now,
  };
};

export const saveServerPapersBatch = async (
  papers: Paper[],
  options: { alsoSyncQuizzes?: boolean } = {}
): Promise<Paper[]> => {
  const valid = (Array.isArray(papers) ? papers : [])
    .filter((p) => p && p.id)
    .map(normalizeServerPaper);
  if (valid.length === 0) return [];

  await withKeyLock(PAPERS_KEY, async () => {
    const all = await getAllServerPapers();
    for (const normalized of valid) {
      const idx = all.findIndex(
        (p) =>
          p.id === normalized.id ||
          (normalized.testCode &&
            p.testCode &&
            p.testCode.toUpperCase() === normalized.testCode.toUpperCase() &&
            normalizeUserId(p.userId) === normalizeUserId(normalized.userId))
      );

      if (idx >= 0) {
        const existing = all[idx];
        const existingUpdated = new Date(existing.updatedAt || 0).getTime();
        const incomingUpdated = new Date(normalized.updatedAt || 0).getTime();
        const existingCount = existing.questions?.length || 0;
        const incomingCount = normalized.questions?.length || 0;
        if (incomingUpdated >= existingUpdated || incomingCount >= existingCount) {
          all[idx] = normalized;
        }
      } else {
        all.unshift(normalized);
      }
    }

    all.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    );
    await kvSetJson(PAPERS_KEY, all.slice(0, MAX_PAPERS));
  });

  if (options.alsoSyncQuizzes) {
    const withQuiz = valid.filter((p) => p.testCode && (p.questions?.length || 0) > 0);
    if (withQuiz.length > 0) {
      await withKeyLock(QUIZZES_KEY, async () => {
        const allQ = await kvGetJson<TelegramQuiz[]>(QUIZZES_KEY, []);
        const list = Array.isArray(allQ) ? allQ : [];
        for (const p of withQuiz) {
          const normalized = normalizeQuiz({
            code: p.testCode!,
            paperId: p.id,
            title: p.title,
            subject: p.subject || p.category,
            timePerQuestion: 30,
            questions: p.questions,
            createdBy: p.userName,
            creatorPhone: p.userId,
            createdAt: p.updatedAt || p.createdAt || new Date().toISOString(),
          });
          const idx = list.findIndex(
            (q) =>
              q.code.toUpperCase() === normalized.code.toUpperCase() ||
              (!isSetOrScheduledQuiz(q) && normalized.paperId && q.paperId === normalized.paperId)
          );
          if (idx >= 0) list[idx] = normalized;
          else list.unshift(normalized);
        }
        const map = new Map<string, TelegramQuiz>();
        for (const q of list) {
          const key = getQuizDedupKey(q);
          const existing = map.get(key);
          if (!existing || (q.questions?.length || 0) >= (existing.questions?.length || 0)) {
            map.set(key, q);
          }
        }
        const deduplicated = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        await kvSetJson(QUIZZES_KEY, deduplicated.slice(0, MAX_QUIZZES));
      });
    }
  }

  // Upsert unique authors in one batch pass
  const seenAuthors = new Set<string>();
  const now = new Date().toISOString();
  for (const p of valid) {
    const uid = normalizeUserId(p.userId || p.creatorPhone || "");
    if (!uid || uid === "server" || seenAuthors.has(uid)) continue;
    seenAuthors.add(uid);
    await saveServerUser({
      id: uid,
      phoneNumber: uid,
      name: p.userName || "વિદ્યાર્થી",
      createdAt: p.createdAt || now,
      lastActive: now,
    }).catch(() => {});
  }

  return valid;
};

export const saveServerPaper = async (paper: Paper): Promise<Paper> => {
  if (!paper || !paper.id) {
    throw new Error("Invalid paper");
  }
  const [saved] = await saveServerPapersBatch([paper]);
  return saved;
};

export const deleteServerPaperRecord = async (
  paperId?: string,
  testCode?: string
): Promise<boolean> => {
  const pid = String(paperId || "").trim();
  const code = String(testCode || "").trim().toUpperCase();
  if (!pid && !code) return false;

  let removed = false;
  await withKeyLock(PAPERS_KEY, async () => {
    const all = await getAllServerPapers();
    const filtered = all.filter((p) => {
      const matchId = Boolean(pid) && p.id === pid;
      const matchCode =
        Boolean(code) && String(p.testCode || "").toUpperCase() === code;
      if (matchId || matchCode) {
        removed = true;
        return false;
      }
      return true;
    });
    if (removed) {
      await kvSetJson(PAPERS_KEY, filtered);
    }
  });
  return removed;
};
