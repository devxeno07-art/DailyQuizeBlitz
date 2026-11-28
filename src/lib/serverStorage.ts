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
  kvDelete,
  kvGetJson,
  kvGetJsonBatch,
  kvGetJsonStrict,
  kvSetJson,
  withKeyLock,
  withDistributedLock,
} from "./kvStore";

const BOT_CONFIG_KEY = "bot_config.json";
const QUIZZES_KEY = "quizzes.json";
const quizItemKey = (code: string): string =>
  `quiz_${String(code || "").trim().toUpperCase()}.json`;
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

  // Always persist per-code fast record (~50ms) so scheduled & set runs finish <1s
  await kvSetJson(quizItemKey(normalized.code), normalized);

  // Ephemeral scheduled/set runs don't need to rewrite the 3.5MB quizzes.json archive
  if (normalizedIsSubset) {
    return;
  }

  await withDistributedLock("quizzes_write", 15000, async () => {
    await withKeyLock(QUIZZES_KEY, async () => {
      const all = await kvGetJsonStrict<TelegramQuiz[]>(QUIZZES_KEY, []);
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

  // 0. Ultra-fast direct per-code lookup (scheduled, set, & recent quizzes)
  const directQuiz = await kvGetJson<TelegramQuiz | null>(quizItemKey(clean), null).catch(() => null);
  if (directQuiz && Array.isArray(directQuiz.questions) && directQuiz.questions.length > 0) {
    return directQuiz;
  }
  const cleanWithPrefix = clean.startsWith("TEST-") ? clean : `TEST-${clean}`;
  if (cleanWithPrefix !== clean) {
    const prefixedQuiz = await kvGetJson<TelegramQuiz | null>(quizItemKey(cleanWithPrefix), null).catch(() => null);
    if (prefixedQuiz && Array.isArray(prefixedQuiz.questions) && prefixedQuiz.questions.length > 0) {
      return prefixedQuiz;
    }
  }

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

  // 6. Resilient fallback to per-paper store (kv:gsrtc:paper_*.json)
  // Pass allowQuizFallback = false to prevent mutual recursion with getPaperByIdOrCodeFromServer.
  const fallbackPaper = await getPaperByIdOrCodeFromServer(
    raw,
    clean,
    false
  ).catch(() => null);
  if (fallbackPaper && Array.isArray(fallbackPaper.questions) && fallbackPaper.questions.length > 0) {
    return {
      code: String(fallbackPaper.testCode || clean).trim().toUpperCase(),
      paperId: fallbackPaper.id,
      title: fallbackPaper.title || "મોક ટેસ્ટ",
      subject: fallbackPaper.subject || fallbackPaper.category || "સામાન્ય જ્ઞાન",
      timePerQuestion: Math.max(
        10,
        Math.min(
          120,
          Math.round(
            ((fallbackPaper.timeLimitMinutes || 30) * 60) /
              Math.max(1, fallbackPaper.questions.length)
          )
        )
      ),
      questions: fallbackPaper.questions,
      createdBy: fallbackPaper.userName || "Creator",
      creatorPhone: fallbackPaper.creatorPhone || fallbackPaper.userId || "server",
      createdAt: fallbackPaper.createdAt || fallbackPaper.updatedAt || new Date().toISOString(),
    };
  }

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
  const [quizzes, paperMetas, sessions, attempts, schedules, config] = await Promise.all([
    getAllServerQuizzes(),
    getServerPapersMeta().catch(() => [] as PaperMetaRecord[]),
    getAllSessions(),
    getAllServerAttempts(),
    getAllServerSchedules(),
    getServerBotConfig(),
  ]);

  const masterQuizzes = quizzes.filter((q) => !q.parentPaperId && !String(q.paperId || "").startsWith("sched_"));
  const paperIdSet = new Set(paperMetas.map((m) => m.id));
  const extraQuizzesQ = masterQuizzes
    .filter((q) => !q.paperId || !paperIdSet.has(q.paperId))
    .reduce((sum, q) => sum + (q.questions?.length || 0), 0);
  const paperMetaTotalQ = paperMetas.reduce(
    (sum, m) => sum + (Number(m.questionCount) || 0),
    0
  );
  const rawQuizQ = quizzes.reduce((sum, q) => sum + (q.questions?.length || 0), 0);
  const totalQuizQuestions = Math.max(paperMetaTotalQ + extraQuizzesQ, rawQuizQ);
  const totalQuizCount = Math.max(paperMetas.length, quizzes.length);

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
    quizzes: totalQuizCount,
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

  return await withDistributedLock("users_write", 5000, async () => {
    return await withKeyLock(USERS_KEY, async () => {
      const all = await kvGetJsonStrict<UserProfile[]>(USERS_KEY, []);
      const list = Array.isArray(all) ? all : [];
      const idx = list.findIndex(
        (u) => normalizeUserId(u.id || u.phoneNumber) === cleanId
      );
      const now = new Date().toISOString();

      if (idx >= 0) {
        const existing = list[idx];
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
        list[idx] = merged;
        await kvSetJson(USERS_KEY, list.slice(0, MAX_USERS));
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
      list.unshift(created);
      await kvSetJson(USERS_KEY, list.slice(0, MAX_USERS));
      return created;
    });
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

export interface PaperMetaRecord {
  id: string;
  userId: string;
  creatorPhone?: string;
  userName?: string;
  title?: string;
  subject?: string;
  category?: string;
  testCode?: string;
  targetQuestions?: number;
  timeLimitMinutes?: number;
  isPublic?: boolean;
  updatedAt?: string;
  createdAt?: string;
  questionCount: number;
}

const PAPER_INDEX_KEY = "paper_index.json";
const paperItemKey = (id: string): string =>
  `paper_${String(id || "").replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;

const toPaperMeta = (p: Paper): PaperMetaRecord => ({
  id: p.id,
  userId: normalizeUserId(p.userId || p.creatorPhone || ""),
  creatorPhone: normalizeUserId(p.creatorPhone || p.userId || ""),
  userName: p.userName || "શિક્ષક / વિદ્યાર્થી",
  title: p.title || "નવું પ્રશ્નપત્ર",
  subject: p.subject || "સામાન્ય જ્ઞાન",
  category: p.category || "સ્પર્ધાત્મક પરીક્ષા",
  testCode: p.testCode ? String(p.testCode).trim().toUpperCase() : undefined,
  targetQuestions: p.targetQuestions || p.questions?.length || p.questionCount || 50,
  timeLimitMinutes: p.timeLimitMinutes || 60,
  isPublic: p.isPublic !== false,
  updatedAt: p.updatedAt,
  createdAt: p.createdAt,
  questionCount: p.questions?.length || p.questionCount || 0,
});

export const metaToSummaryPaper = (m: PaperMetaRecord): Paper => ({
  id: m.id,
  userId: m.userId,
  creatorPhone: m.creatorPhone || m.userId,
  userName: m.userName || "શિક્ષક / વિદ્યાર્થી",
  title: m.title || "મોક ટેસ્ટ",
  subject: m.subject || "સામાન્ય જ્ઞાન",
  category: m.category || "સ્પર્ધાત્મક પરીક્ષા",
  targetQuestions: m.targetQuestions || m.questionCount || 50,
  questionCount: m.questionCount || 0,
  isSummaryOnly: true,
  timeLimitMinutes: m.timeLimitMinutes || 60,
  isPublic: m.isPublic !== false,
  testCode: m.testCode,
  questions: [],
  createdAt: m.createdAt || new Date().toISOString(),
  updatedAt: m.updatedAt || m.createdAt || new Date().toISOString(),
});

export const getServerPapersMeta = async (): Promise<PaperMetaRecord[]> => {
  const idx = await kvGetJson<PaperMetaRecord[]>(PAPER_INDEX_KEY, []);
  if (Array.isArray(idx) && idx.length > 0) {
    // Self-heal if legacy index rows lack `title`
    if (idx.some((m) => !m.title)) {
      const full = await getAllServerPapers();
      if (full.length > 0) {
        const healed = full.map(toPaperMeta);
        kvSetJson(PAPER_INDEX_KEY, healed).catch(() => {});
        return healed;
      }
    }
    return idx;
  }
  const legacy = await kvGetJson<Paper[]>(PAPERS_KEY, []);
  return Array.isArray(legacy) ? legacy.map(toPaperMeta) : [];
};

export const getPaperByIdOrCodeFromServer = async (
  paperId?: string,
  testCode?: string,
  allowQuizFallback = true
): Promise<Paper | null> => {
  const pid = String(paperId || "").trim();
  const code = String(testCode || "").trim().toUpperCase();

  if (pid && (!code || pid.toUpperCase() !== code)) {
    const direct = await kvGetJson<Paper | null>(paperItemKey(pid), null);
    if (direct && direct.id) return direct;
  }

  if (code) {
    const idx = await kvGetJson<PaperMetaRecord[]>(PAPER_INDEX_KEY, []);
    const matchMeta = Array.isArray(idx)
      ? idx.find((m) => m.testCode && m.testCode.toUpperCase() === code)
      : undefined;
    if (matchMeta) {
      const direct = await kvGetJson<Paper | null>(paperItemKey(matchMeta.id), null);
      if (direct && direct.id) return direct;
    }

    if (allowQuizFallback) {
      const quiz = await getServerQuizByCode(code);
      if (quiz) {
        const uid = normalizeUserId(quiz.creatorPhone || "");
        return {
          id: quiz.paperId || `server_${quiz.code}`,
          userId: uid,
          creatorPhone: uid,
          userName: quiz.createdBy || "શિક્ષક / વિદ્યાર્થી",
          title: quiz.title,
          subject: quiz.subject || "સામાન્ય જ્ઞાન",
          category: "સ્પર્ધાત્મક પરીક્ષા",
          targetQuestions: quiz.questions?.length || 0,
          questionCount: quiz.questions?.length || 0,
          timeLimitMinutes: Math.max(
            10,
            Math.ceil(((quiz.questions?.length || 20) * (quiz.timePerQuestion || 30)) / 60)
          ),
          isPublic: true,
          testCode: quiz.code,
          questions: Array.isArray(quiz.questions) ? quiz.questions : [],
          createdAt: quiz.createdAt || new Date().toISOString(),
          updatedAt: quiz.createdAt || new Date().toISOString(),
        };
      }
    }
  }

  // Fallback to legacy papers.json
  const legacy = await kvGetJson<Paper[]>(PAPERS_KEY, []);
  if (Array.isArray(legacy)) {
    const found = legacy.find(
      (p) =>
        (Boolean(pid) && p.id === pid) ||
        (Boolean(code) && p.testCode && p.testCode.toUpperCase() === code)
    );
    if (found) return found;
  }

  return null;
};

export const getAllServerPapers = async (userIdFilter?: string): Promise<Paper[]> => {
  const cleanFilter = userIdFilter ? normalizeUserId(userIdFilter) : "";
  const idx = await kvGetJson<PaperMetaRecord[]>(PAPER_INDEX_KEY, []);
  const indexedList = Array.isArray(idx)
    ? cleanFilter
      ? idx.filter((m) => normalizeUserId(m.userId || m.creatorPhone || "") === cleanFilter)
      : idx
    : [];

  const loaded: Paper[] = [];
  if (indexedList.length > 0) {
    const keys = indexedList.map((m) => paperItemKey(m.id));
    const batchMap = await kvGetJsonBatch<Paper>(keys);
    for (const k of keys) {
      const item = batchMap.get(k);
      if (item && item.id) loaded.push(item);
    }
  }

  // Merge any papers from legacy monolithic papers.json if not yet indexed per-row
  if (!cleanFilter || loaded.length === 0) {
    const legacy = await kvGetJson<Paper[]>(PAPERS_KEY, []);
    if (Array.isArray(legacy) && legacy.length > 0) {
      const existingIds = new Set(loaded.map((p) => p.id));
      const missing = legacy.filter(
        (p) =>
          p &&
          p.id &&
          !existingIds.has(p.id) &&
          (!cleanFilter || normalizeUserId(p.userId || p.creatorPhone || "") === cleanFilter)
      );
      if (missing.length > 0) {
        loaded.push(...missing);
        Promise.all(
          missing.map((p) => kvSetJson(paperItemKey(p.id), p).catch(() => {}))
        ).catch(() => {});
      }
    }
  }

  return loaded.sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime()
  );
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
  options: { alsoSyncQuizzes?: boolean; allowEmptyQuestions?: boolean } = {}
): Promise<Paper[]> => {
  const valid = (Array.isArray(papers) ? papers : [])
    .filter((p) => p && p.id && !p.isSummaryOnly)
    .map(normalizeServerPaper);
  if (valid.length === 0) return [];

  // 1. Write each paper to its own independent atomic row (with anti-loss question guard)
  const finalSaved: Paper[] = [];
  for (let i = 0; i < valid.length; i += 5) {
    await Promise.all(
      valid.slice(i, i + 5).map(async (incoming) => {
        const key = paperItemKey(incoming.id);
        const existing = await kvGetJson<Paper | null>(key, null);
        let toStore = incoming;
        if (existing) {
          const existingUpdated = new Date(existing.updatedAt || 0).getTime();
          const incomingUpdated = new Date(incoming.updatedAt || 0).getTime();
          const existingCount = existing.questions?.length || 0;
          const incomingCount = incoming.questions?.length || 0;

          // Never accidentally lose questions if an incoming payload arrives empty without explicit permission
          if (incomingCount === 0 && existingCount > 0 && !options.allowEmptyQuestions) {
            toStore = {
              ...incoming,
              questions: existing.questions,
              questionCount: existingCount,
              targetQuestions: existing.targetQuestions || existingCount,
            };
          } else if (incomingUpdated < existingUpdated && incomingCount <= existingCount) {
            finalSaved.push(existing);
            return;
          }
        }
        await kvSetJson(key, toStore);
        finalSaved.push(toStore);
      })
    );
  }

  // 2. Update lightweight index (< 20KB) under distributed lock + strict read
  await withDistributedLock("paper_index_write", 8000, async () => {
    await withKeyLock(PAPER_INDEX_KEY, async () => {
      const currentIdx = await kvGetJsonStrict<PaperMetaRecord[]>(
        PAPER_INDEX_KEY,
        []
      );
      const list = Array.isArray(currentIdx) ? [...currentIdx] : [];

      // Seed from legacy papers.json if index wasn't initialized yet
      if (list.length === 0) {
        const legacy = await kvGetJson<Paper[]>(PAPERS_KEY, []);
        if (Array.isArray(legacy)) {
          legacy.forEach((p) => {
            if (p && p.id) list.push(toPaperMeta(p));
          });
        }
      }

      for (const normalized of finalSaved) {
        const meta = toPaperMeta(normalized);
        const pos = list.findIndex(
          (m) =>
            m.id === meta.id ||
            (meta.testCode &&
              m.testCode &&
              m.testCode.toUpperCase() === meta.testCode.toUpperCase() &&
              normalizeUserId(m.userId) === normalizeUserId(meta.userId))
        );
        if (pos >= 0) {
          list[pos] = { ...meta, id: list[pos].id };
        } else {
          list.unshift(meta);
        }
      }

      list.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
      await kvSetJson(PAPER_INDEX_KEY, list.slice(0, MAX_PAPERS));
    });
  });

  if (options.alsoSyncQuizzes) {
    const withQuiz = finalSaved.filter((p) => p.testCode && (p.questions?.length || 0) > 0);
    if (withQuiz.length > 0) {
      await withDistributedLock("quizzes_write", 15000, async () => {
        await withKeyLock(QUIZZES_KEY, async () => {
          const allQ = await kvGetJsonStrict<TelegramQuiz[]>(QUIZZES_KEY, []);
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
      });
    }
  }

  // Upsert unique authors cleanly
  const seenAuthors = new Set<string>();
  const now = new Date().toISOString();
  for (const p of finalSaved) {
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

  return finalSaved;
};

export const saveServerPaper = async (
  paper: Paper,
  options: { alsoSyncQuizzes?: boolean; allowEmptyQuestions?: boolean } = {}
): Promise<Paper> => {
  if (!paper || !paper.id) {
    throw new Error("Invalid paper");
  }
  const [saved] = await saveServerPapersBatch([paper], options);
  return saved || paper;
};

export const deleteServerPaperRecord = async (
  paperId?: string,
  testCode?: string
): Promise<boolean> => {
  const pid = String(paperId || "").trim();
  const code = String(testCode || "").trim().toUpperCase();
  if (!pid && !code) return false;

  let removed = false;

  await withDistributedLock("paper_index_write", 6000, async () => {
    await withKeyLock(PAPER_INDEX_KEY, async () => {
      const idxList = await kvGetJsonStrict<PaperMetaRecord[]>(
        PAPER_INDEX_KEY,
        []
      );
      const removedIds: string[] = [];
      const filteredIdx = idxList.filter((m) => {
        const matchId = Boolean(pid) && m.id === pid;
        const matchCode =
          Boolean(code) && String(m.testCode || "").toUpperCase() === code;
        if (matchId || matchCode) {
          removed = true;
          removedIds.push(m.id);
          return false;
        }
        return true;
      });
      if (removedIds.length > 0) {
        await kvSetJson(PAPER_INDEX_KEY, filteredIdx);
        await Promise.all(
          removedIds.map((id) => kvDelete(paperItemKey(id)).catch(() => {}))
        );
      }
    });
  });

  if (pid) {
    await kvDelete(paperItemKey(pid)).catch(() => {});
  }

  await withKeyLock(PAPERS_KEY, async () => {
    const legacy = await kvGetJson<Paper[]>(PAPERS_KEY, []);
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    const filtered = legacy.filter((p) => {
      const matchId = Boolean(pid) && p.id === pid;
      const matchCode =
        Boolean(code) && String(p.testCode || "").toUpperCase() === code;
      if (matchId || matchCode) {
        removed = true;
        return false;
      }
      return true;
    });
    if (filtered.length !== legacy.length) {
      await kvSetJson(PAPERS_KEY, filtered);
    }
  });

  return removed;
};
