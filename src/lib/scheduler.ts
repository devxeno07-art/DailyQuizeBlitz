/**
 * Server-side daily test scheduler.
 *
 * Designed to be triggered by:
 *  - Vercel Cron (`/api/cron/tick`)
 *  - any external cron / uptime pinger
 *  - the local telegram daemon
 *
 * It rebuilds a fresh mixed/subject-wise quiz from all server quizzes,
 * saves it under a unique code, and launches the Telegram poll run.
 */

import { Paper, Question, ScheduledDailyTest, TelegramQuiz } from "@/types";
import {
  addPendingDelete,
  getAllServerPapers,
  getAllServerQuizzes,
  getAllServerSchedules,
  getAllSessions,
  getAllUpcomingReminders,
  getPaperByIdOrCodeFromServer,
  getServerBotConfig,
  removePendingDelete,
  savePaperSetDispatch,
  saveServerQuiz,
  saveServerSchedule,
  saveUpcomingReminder,
} from "./serverStorage";
import { acquireRedisLock, releaseRedisLock } from "./kvStore";
import {
  clearGroupUpcomingReminder,
  deleteTelegramMessageSafe,
  dispatchQuizToChat,
  sendMessageAndGetId,
} from "./telegramBotEngine";

const IST_TIME_ZONE = "Asia/Kolkata";

export interface SchedulerRunResult {
  ok: boolean;
  ran: number;
  errors: string[];
  dispatched: Array<{ scheduleId: string; code?: string; error?: string }>;
}

const getIstParts = (
  date = new Date()
): { day: string; minutes: number; seconds: number } => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const hours = Number(get("hour")) % 24;
  const minutes = Number(get("minute"));
  const seconds = Number(get("second")) % 60;
  return { day, minutes: hours * 60 + minutes, seconds };
};

const formatTime12h = (time24: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time24 || "").trim());
  if (!match) return time24;
  const h = Number(match[1]) % 24;
  const m = match[2];
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
};

const parseScheduledTime = (value: string): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return -1;
  return hours * 60 + minutes;
};

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const dedupeQuestions = (questions: Question[]): Question[] => {
  const seen = new Set<string>();
  const result: Question[] = [];
  for (const question of questions) {
    const key = String(question.questionText || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    if (!Array.isArray(question.options) || question.options.length < 2) {
      continue;
    }
    seen.add(key);
    result.push(question);
  }
  return result;
};

const generateUniqueCode = async (
  prefix: string,
  existingCodes: Set<string>
): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `${prefix}-${num}`;
    if (!existingCodes.has(code)) return code;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
};

const collectCandidateQuestions = (
  quizzes: TelegramQuiz[],
  schedule: ScheduledDailyTest
): Question[] => {
  if (schedule.mode === "specific_test") {
    const code = String(schedule.specificTestCode || "").trim().toUpperCase();
    const paperId = String(schedule.specificPaperId || "").trim();

    const matched = quizzes.find(
      (quiz) =>
        (Boolean(code) && quiz.code?.toUpperCase() === code) ||
        (Boolean(paperId) && quiz.paperId === paperId) ||
        (Boolean(code) && String(quiz.paperId || "").toUpperCase() === code) ||
        (Boolean(code) && quiz.code?.toUpperCase().endsWith(code))
    );

    if (matched && Array.isArray(matched.questions) && matched.questions.length > 0) {
      return matched.questions;
    }
  }

  let relevant = quizzes;

  if (schedule.mode === "subject_wise" && schedule.subject) {
    const target = schedule.subject.toLowerCase().trim();
    const matched = quizzes.filter(
      (quiz) =>
        String(quiz.subject || "").toLowerCase().includes(target) ||
        String(quiz.title || "").toLowerCase().includes(target)
    );
    if (matched.length > 0) relevant = matched;
  } else if (
    schedule.mode === "all_mixed" &&
    Array.isArray(schedule.selectedSubjects) &&
    schedule.selectedSubjects.length > 0
  ) {
    const targets = schedule.selectedSubjects
      .map((s) => String(s || "").toLowerCase().trim())
      .filter(Boolean);
    if (targets.length > 0) {
      relevant = quizzes.filter((quiz) => {
        const qSubj = String(quiz.subject || "").toLowerCase();
        const qTitle = String(quiz.title || "").toLowerCase();
        return targets.some((t) => qSubj.includes(t) || qTitle.includes(t));
      });
    }
  }

  const questions: Question[] = [];
  relevant.forEach((quiz) => {
    if (Array.isArray(quiz.questions)) questions.push(...quiz.questions);
  });
  return dedupeQuestions(questions);
};

const paperToQuizAdapter = (p: Paper): TelegramQuiz => ({
  code: String(p.testCode || p.id).trim().toUpperCase(),
  paperId: p.id,
  title: p.title || "મોક ટેસ્ટ",
  subject: p.subject || p.category || "સામાન્ય જ્ઞાન",
  timePerQuestion: Math.max(
    10,
    Math.min(
      120,
      Math.round(
        ((p.timeLimitMinutes || 30) * 60) /
          Math.max(1, p.questions?.length || p.questionCount || 20)
      )
    )
  ),
  questions: Array.isArray(p.questions) ? p.questions : [],
  createdBy: p.userName || "Creator",
  creatorPhone: p.creatorPhone || p.userId || "server",
  createdAt: p.createdAt || p.updatedAt || new Date().toISOString(),
});

const mergeQuizAndPaperSources = (
  quizzes: TelegramQuiz[],
  papers: Paper[]
): TelegramQuiz[] => {
  const byPaperId = new Map<string, TelegramQuiz>();
  const extras: TelegramQuiz[] = [];

  for (const q of quizzes) {
    // Exclude previously auto-generated set/scheduled runs from raw question pool
    if (q.parentPaperId || String(q.paperId || "").startsWith("sched_")) {
      continue;
    }
    if (q.paperId) {
      const existing = byPaperId.get(q.paperId);
      if (!existing || (q.questions?.length || 0) >= (existing.questions?.length || 0)) {
        byPaperId.set(q.paperId, q);
      }
    } else {
      extras.push(q);
    }
  }

  for (const p of papers) {
    if (!p || !Array.isArray(p.questions) || p.questions.length === 0) continue;
    const existing = byPaperId.get(p.id);
    if (!existing || p.questions.length >= (existing.questions?.length || 0)) {
      byPaperId.set(p.id, paperToQuizAdapter(p));
    }
  }

  return [...Array.from(byPaperId.values()), ...extras];
};

export const buildQuizFromSchedule = async (
  schedule: ScheduledDailyTest
): Promise<TelegramQuiz | null> => {
  let pool: TelegramQuiz[] = [];

  if (schedule.mode === "specific_test") {
    const directPaper = await getPaperByIdOrCodeFromServer(
      schedule.specificPaperId,
      schedule.specificTestCode
    ).catch(() => null);

    if (directPaper && Array.isArray(directPaper.questions) && directPaper.questions.length > 0) {
      pool = [paperToQuizAdapter(directPaper)];
    } else {
      const [loadedQuizzes, papers] = await Promise.all([
        getAllServerQuizzes().catch(() => [] as TelegramQuiz[]),
        getAllServerPapers().catch(() => [] as Paper[]),
      ]);
      pool = mergeQuizAndPaperSources(loadedQuizzes, papers);
    }
  } else {
    const papers = await getAllServerPapers().catch(() => [] as Paper[]);
    if (papers.length > 0) {
      pool = mergeQuizAndPaperSources([], papers);
    } else {
      const loadedQuizzes = await getAllServerQuizzes().catch(() => [] as TelegramQuiz[]);
      pool = mergeQuizAndPaperSources(loadedQuizzes, []);
    }
  }

  const candidates = collectCandidateQuestions(pool, schedule);
  if (candidates.length === 0) return null;

  const requested = Math.max(
    1,
    Math.min(Number(schedule.questionCount) || 20, candidates.length)
  );

  const shouldShuffle = schedule.shuffleQuestions !== false;

  let selected: Question[];
  let setMeta: TelegramQuiz["setMeta"] | undefined;
  let parentPaperId: string | undefined;

  if (schedule.mode === "specific_test" && schedule.useSetProgression) {
    const totalSets = Math.ceil(candidates.length / requested);
    const setIdx = Math.max(0, Number(schedule.currentSetIndex) || 0) % totalSets;
    const startIdx = setIdx * requested;
    const endIdx = Math.min(candidates.length, startIdx + requested);
    const batch = candidates.slice(startIdx, endIdx);
    selected = shouldShuffle ? shuffle(batch) : batch;

    const matchedSource = pool.find(
      (q) =>
        (schedule.specificTestCode &&
          q.code?.toUpperCase() === schedule.specificTestCode.toUpperCase()) ||
        (schedule.specificPaperId && q.paperId === schedule.specificPaperId)
    );
    parentPaperId = matchedSource?.paperId || schedule.specificPaperId;

    setMeta = {
      setNumber: setIdx + 1,
      totalSets,
      setSize: requested,
      startQuestion: startIdx + 1,
      endQuestion: endIdx,
    };
  } else {
    selected = shouldShuffle
      ? shuffle(candidates).slice(0, requested)
      : candidates.slice(0, requested);
  }

  const questions = selected.map((question, index) => ({
    ...question,
    questionNumber: index + 1,
  }));

  const existingCodes = new Set(pool.map((q) => q.code.toUpperCase()));
  const prefix =
    schedule.mode === "specific_test"
      ? (schedule.specificTestCode?.replace(/-\d+$/, "").toUpperCase() || "TEST")
      : schedule.mode === "subject_wise"
      ? "SUBJ"
      : "DAILY";
  const code = await generateUniqueCode(prefix, existingCodes);

  const now = new Date().toISOString();
  let defaultTitle = "ડેઇલી મેગા મોક ટેસ્ટ";
  let subjectLabel = "ડેઇલી મિક્સ ઓલ વિષય";

  if (schedule.mode === "specific_test") {
    const matched = pool.find(
      (q) =>
        (schedule.specificTestCode &&
          q.code?.toUpperCase() === schedule.specificTestCode.toUpperCase()) ||
        (schedule.specificPaperId && q.paperId === schedule.specificPaperId)
    );
    defaultTitle = matched?.title
      ? `${matched.title} (Daily)`
      : `મોક ટેસ્ટ [${schedule.specificTestCode || "TEST"}]`;
    subjectLabel = matched?.subject || matched?.title || "વિશેષ મોક ટેસ્ટ";
  } else if (schedule.mode === "subject_wise" && schedule.subject) {
    defaultTitle = `${schedule.subject} મોક ટેસ્ટ`;
    subjectLabel = schedule.subject;
  } else if (
    schedule.mode === "all_mixed" &&
    Array.isArray(schedule.selectedSubjects) &&
    schedule.selectedSubjects.length > 0
  ) {
    const preview = schedule.selectedSubjects.slice(0, 3).join(", ");
    const extra =
      schedule.selectedSubjects.length > 3
        ? ` +${schedule.selectedSubjects.length - 3}`
        : "";
    defaultTitle = "કસ્ટમ મિક્સ મોક ટેસ્ટ";
    subjectLabel = `${preview}${extra}`;
  }

  const baseTitle = schedule.title || defaultTitle;
  const finalTitle = setMeta
    ? `${baseTitle} [Set ${setMeta.setNumber}/${setMeta.totalSets} • Q${setMeta.startQuestion}-${setMeta.endQuestion}]`
    : baseTitle;

  const quiz: TelegramQuiz = {
    code,
    paperId: setMeta
      ? `${parentPaperId || schedule.specificTestCode || schedule.id}::set_${setMeta.setSize}_${setMeta.setNumber}`
      : `sched_${schedule.id}`,
    parentPaperId,
    setMeta,
    title: finalTitle,
    subject: subjectLabel,
    timePerQuestion: Math.max(
      5,
      Math.min(600, Number(schedule.timePerQuestion) || 30)
    ),
    questions,
    createdBy: "Admin Scheduler",
    creatorPhone: "server",
    createdAt: now,
  };

  await saveServerQuiz(quiz);
  return quiz;
};

export const dispatchSchedule = async (
  schedule: ScheduledDailyTest,
  options: { force?: boolean; hostOrigin?: string } = {}
): Promise<{ ok: boolean; code?: string; error?: string }> => {
  const botConfig = await getServerBotConfig();
  const targetGroupId = String(
    schedule.targetGroupId || botConfig.targetGroupId || ""
  ).trim();

  if (!targetGroupId) {
    return {
      ok: false,
      error:
        "કોઈ ટાર્ગેટ ગ્રૂપ સેટ નથી. એડમિન પેનલમાં ગ્રૂપ ID સેટ કરો.",
    };
  }

  const schedLockKey = `sched_dispatch:${schedule.id}`;
  const groupLockKey = `group_dispatch:${targetGroupId}`;
  const gotSchedLock = await acquireRedisLock(schedLockKey, 45_000);
  if (!gotSchedLock) {
    return {
      ok: false,
      error: "આ શેડ્યુલ પહેલેથી જ ચાલુ થઈ રહ્યું છે — કૃપા કરીને થોડી સેકન્ડ રાહ જુઓ.",
    };
  }

  const gotGroupLock = await acquireRedisLock(groupLockKey, 25_000);
  if (!gotGroupLock) {
    await releaseRedisLock(schedLockKey).catch(() => {});
    return {
      ok: false,
      error: "આ ગ્રૂપમાં અન્ય ક્વિઝ શરૂ થઈ રહી છે — થોડી સેકન્ડ પછી પ્રયાસ કરો.",
    };
  }

  try {
    // Re-read fresh state inside the distributed lock to eliminate cron + manual double-starts
    const [freshSchedules, sessions] = await Promise.all([
      getAllServerSchedules().catch(() => [] as ScheduledDailyTest[]),
      getAllSessions().catch(() => []),
    ]);

    const latestSched = freshSchedules.find((s) => s.id === schedule.id);
    const activeTarget = latestSched ? { ...schedule, ...latestSched } : schedule;

    if (activeTarget.lastRunAt) {
      const sinceLastMs = Date.now() - new Date(activeTarget.lastRunAt).getTime();
      if (sinceLastMs >= 0 && sinceLastMs < 180_000) {
        return {
          ok: false,
          error: `આ ટેસ્ટ થોડી જ સેકન્ડ પહેલા (${activeTarget.lastGeneratedCode || "Live"}) શરૂ થઈ ચૂકી છે.`,
        };
      }
    }

    const activeGroupSess = sessions.find((s) => {
      if (String(s.chatId) !== targetGroupId || s.status !== "active") return false;
      const totalQ = s.quiz?.questions?.length || 0;
      if (s.polls.length >= totalQ) return false;
      const lastPoll = s.polls[s.polls.length - 1];
      const lastActivity = new Date(lastPoll?.sentAt || s.startedAt).getTime();
      return Date.now() - lastActivity < 15 * 60 * 1000;
    });
    if (activeGroupSess) {
      return {
        ok: false,
        error: `આ ગ્રૂપમાં પહેલેથી જ "${activeGroupSess.quiz?.title || activeGroupSess.code}" ટેસ્ટ લાઈવ ચાલી રહી છે. એક સમયે ફક્ત એક જ ટેસ્ટ ચાલી શકે.`,
      };
    }

    const quiz = await buildQuizFromSchedule(activeTarget);
    if (!quiz) {
      return {
        ok: false,
        error: "પૂરતા પ્રશ્નો ઉપલબ્ધ નથી. પહેલા ટેસ્ટ/પેપર ડિજિટાઇઝ કરો.",
      };
    }

    const result = await dispatchQuizToChat({
      quiz,
      chatId: targetGroupId,
      chatTitle: quiz.title,
      hostOrigin: options.hostOrigin,
      startedBy: { id: "0", name: "Admin Scheduler" },
    });

    if (!result.ok) {
      return { ok: false, error: result.error || "ટેસ્ટ શરૂ થઈ શકી નહીં." };
    }

    const now = new Date();
    const { day } = getIstParts(now);
    activeTarget.lastRunAt = now.toISOString();
    activeTarget.lastRunDay = day;
    activeTarget.lastGeneratedCode = quiz.code;

    if (activeTarget.useSetProgression && quiz.setMeta) {
      const keyBase =
        activeTarget.specificTestCode?.toUpperCase() ||
        quiz.parentPaperId ||
        activeTarget.specificPaperId ||
        activeTarget.id;

      await savePaperSetDispatch({
        id: `${keyBase}::${quiz.setMeta.setSize}::${quiz.setMeta.setNumber}`,
        paperId: quiz.parentPaperId || activeTarget.specificPaperId || keyBase,
        testCode: activeTarget.specificTestCode?.toUpperCase(),
        setSize: quiz.setMeta.setSize,
        setNumber: quiz.setMeta.setNumber,
        totalSets: quiz.setMeta.totalSets,
        startQuestion: quiz.setMeta.startQuestion,
        endQuestion: quiz.setMeta.endQuestion,
        quizCode: quiz.code,
        groupId: targetGroupId,
        dispatchedAt: now.toISOString(),
        dispatchedBy: "Daily Scheduler",
      });

      activeTarget.currentSetIndex =
        quiz.setMeta.setNumber >= quiz.setMeta.totalSets
          ? 0
          : quiz.setMeta.setNumber;
      activeTarget.totalPaperQuestions =
        quiz.setMeta.totalSets * quiz.setMeta.setSize;
    }

    await saveServerSchedule(activeTarget);

    // Clean up any pending upcoming test reminder in this group now that test started
    const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    if (token) {
      await clearGroupUpcomingReminder(token, targetGroupId).catch(() => {});
    }

    return { ok: true, code: quiz.code };
  } finally {
    await releaseRedisLock(groupLockKey).catch(() => {});
    await releaseRedisLock(schedLockKey).catch(() => {});
  }
};

export const runDueSchedules = async (
  hostOrigin?: string
): Promise<SchedulerRunResult> => {
  const schedules = await getAllServerSchedules();
  const { day, minutes } = getIstParts();
  const result: SchedulerRunResult = {
    ok: true,
    ran: 0,
    errors: [],
    dispatched: [],
  };

  // Only dispatch if current time is within a 45-minute window of the scheduled time.
  // Prevents an 08:00 AM test created at night from backfilling and running at 11:00 PM!
  const MAX_SCHEDULE_TOLERANCE_MINUTES = 45;

  for (const schedule of schedules) {
    if (!schedule.isActive) continue;
    const scheduledMinutes = parseScheduledTime(schedule.scheduledTime);
    if (scheduledMinutes < 0) {
      result.errors.push(
        `Schedule ${schedule.id} has an invalid time "${schedule.scheduledTime}"`
      );
      continue;
    }

    // Already ran today? Skip.
    if (schedule.lastRunDay === day) continue;

    // Time difference between now and scheduled time in IST minutes
    const diff = minutes - scheduledMinutes;

    // If the scheduled time has not arrived yet (diff < 0),
    // OR if it's more than 45 minutes past the scheduled time, do NOT run!
    if (diff < 0 || diff > MAX_SCHEDULE_TOLERANCE_MINUTES) {
      continue;
    }

    // Safeguard: If the schedule was created today AFTER its scheduled time had already passed,
    // it was created for tomorrow, not today! Mark today as completed so it runs tomorrow.
    if (schedule.createdAt) {
      const { day: createdDay, minutes: createdMinutes } = getIstParts(
        new Date(schedule.createdAt)
      );
      if (
        createdDay === day &&
        createdMinutes > scheduledMinutes + MAX_SCHEDULE_TOLERANCE_MINUTES
      ) {
        schedule.lastRunDay = day;
        await saveServerSchedule(schedule);
        continue;
      }
    }

    // Atomic distributed guard so concurrent cron ticks never double-dispatch a schedule
    const lockKey = `sched_run:${schedule.id}:${day}`;
    const gotLock = await acquireRedisLock(lockKey, 120_000);
    if (!gotLock) continue;

    const dispatch = await dispatchSchedule(schedule, { hostOrigin });
    if (dispatch.ok) {
      result.ran += 1;
    } else {
      await releaseRedisLock(lockKey).catch(() => {});
      result.errors.push(
        `Schedule ${schedule.id}: ${dispatch.error || "unknown error"}`
      );
    }
    result.dispatched.push({
      scheduleId: schedule.id,
      code: dispatch.code,
      error: dispatch.error,
    });
  }

  return result;
};

/**
 * Returns milliseconds to wait if an active schedule starts within the next 4 minutes,
 * allowing cron ticks to sleep cleanly and launch the scheduled quiz at the exact minute.
 */
export const getImminentScheduleWaitMs = async (): Promise<number> => {
  try {
    const schedules = await getAllServerSchedules();
    const { day, minutes, seconds } = getIstParts();
    let minWaitMs = 0;

    for (const schedule of schedules) {
      if (!schedule.isActive || schedule.lastRunDay === day) continue;
      const scheduledMinutes = parseScheduledTime(schedule.scheduledTime);
      if (scheduledMinutes < 0) continue;

      const diffMin = scheduledMinutes - minutes;
      // Between 1 and 4 minutes away (e.g. tick at 12:56 -> test at 13:00)
      if (diffMin >= 1 && diffMin <= 4) {
        const waitMs = Math.max(1000, diffMin * 60_000 - seconds * 1000 + 800);
        if (minWaitMs === 0 || waitMs < minWaitMs) {
          minWaitMs = waitMs;
        }
      }
    }
    return minWaitMs;
  } catch {
    return 0;
  }
};

export interface UpcomingReminderRunResult {
  sent: number;
  scheduledDeletes: Array<{ chatId: number; messageId: number; delayMs: number }>;
}

const escapeHtmlLocal = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const REMINDER_INTERVAL_MS = 180_000; // 3 minutes

/**
 * Sends a clean upcoming-test countdown reminder to groups with scheduled tests
 * approaching today, refreshing every ~3 minutes and auto-deleting each reminder
 * after 3 minutes so group chats stay clutter-free until the test begins.
 */
export const runUpcomingTestReminders =
  async (): Promise<UpcomingReminderRunResult> => {
    const output: UpcomingReminderRunResult = { sent: 0, scheduledDeletes: [] };
    try {
      const botConfig = await getServerBotConfig();
      const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
      if (!token) return output;

      const [schedules, sessions, existingReminders] = await Promise.all([
        getAllServerSchedules(),
        getAllSessions(),
        getAllUpcomingReminders(),
      ]);

      const { day, minutes } = getIstParts();
      const now = Date.now();

      // Group soonest upcoming pending schedule per targetGroupId
      const soonestByGroup = new Map<
        string,
        { schedule: ScheduledDailyTest; minutesLeft: number }
      >();

      for (const s of schedules) {
        if (!s.isActive || s.lastRunDay === day) continue;
        const scheduledMinutes = parseScheduledTime(s.scheduledTime);
        if (scheduledMinutes < 0) continue;

        const minutesLeft = scheduledMinutes - minutes;
        if (minutesLeft <= 0) continue;

        // Default reminder window: 60 minutes before scheduled time (0 = off)
        const windowMin =
          s.reminderMinutesBefore === undefined
            ? 60
            : Math.max(0, Number(s.reminderMinutesBefore));
        if (windowMin === 0 || minutesLeft > windowMin) continue;

        const groupId = String(s.targetGroupId || botConfig.targetGroupId || "").trim();
        if (!groupId) continue;

        const prev = soonestByGroup.get(groupId);
        if (!prev || minutesLeft < prev.minutesLeft) {
          soonestByGroup.set(groupId, { schedule: s, minutesLeft });
        }
      }

      for (const [groupId, { schedule, minutesLeft }] of Array.from(
        soonestByGroup.entries()
      )) {
        // Never send an upcoming reminder while a live quiz is already running in this group
        const hasActiveQuiz = sessions.some(
          (sess) =>
            String(sess.chatId) === groupId && sess.status === "active"
        );
        if (hasActiveQuiz) continue;

        const prevReminder = existingReminders.find(
          (r) => r.groupId === groupId
        );
        if (
          prevReminder &&
          now - new Date(prevReminder.sentAt).getTime() < REMINDER_INTERVAL_MS - 10_000
        ) {
          continue;
        }

        // Distributed lock so concurrent ticks never send duplicate reminders
        const lockOk = await acquireRedisLock(
          `upcoming_rem:${groupId}`,
          REMINDER_INTERVAL_MS - 15_000
        );
        if (!lockOk) continue;

        // Cleanly delete the previous reminder message (ignore any error)
        if (prevReminder?.messageId) {
          await deleteTelegramMessageSafe(
            token,
            Number(groupId),
            prevReminder.messageId
          );
          await removePendingDelete(
            `${Number(groupId)}:${prevReminder.messageId}`
          ).catch(() => {});
        }

        const timeFormatted = formatTime12h(schedule.scheduledTime);
        const hoursLeft = Math.floor(minutesLeft / 60);
        const minsRem = minutesLeft % 60;
        const countdownText =
          hoursLeft > 0
            ? `${hoursLeft} કલાક ${minsRem > 0 ? `${minsRem} મિનિટ` : ""}`.trim()
            : `${minutesLeft} મિનિટ`;

        const setHint = schedule.useSetProgression
          ? ` (Set ${(schedule.currentSetIndex || 0) + 1})`
          : "";

        const text =
          `⏰ <b>આગામી મોક ટેસ્ટ રિમાઇન્ડર (Upcoming Test)</b> 🔔\n\n` +
          `📝 <b>ટેસ્ટ:</b> ${escapeHtmlLocal(schedule.title)}${escapeHtmlLocal(setHint)}\n` +
          (schedule.subject
            ? `📚 <b>વિષય:</b> ${escapeHtmlLocal(schedule.subject)}\n`
            : "") +
          `📊 <b>પ્રશ્નો:</b> ${schedule.questionCount} MCQs • ⏱ <b>${schedule.timePerQuestion} સે./પ્રશ્ન</b>\n` +
          `🕒 <b>શરૂ થવાનો સમય:</b> ${timeFormatted} IST (<b>${countdownText} બાકી</b>)\n\n` +
          `📢 <i>તૈયાર રહેજો! થોડી જ વારમાં લાઈવ ક્વિઝ શરૂ થશે.</i>\n` +
          `🗑️ <i>(આ રિમાઇન્ડર મેસેજ ૩ મિનિટમાં આપોઆપ ડિલીટ થશે)</i>`;

        const sentRes = await sendMessageAndGetId(token, groupId, text);
        if (sentRes.ok && sentRes.messageId) {
          const deleteAt = Date.now() + REMINDER_INTERVAL_MS;
          await saveUpcomingReminder({
            groupId,
            scheduleId: schedule.id,
            messageId: sentRes.messageId,
            sentAt: new Date().toISOString(),
            deleteAt,
          }).catch(() => {});

          await addPendingDelete({
            id: `${Number(groupId)}:${sentRes.messageId}`,
            chatId: Number(groupId),
            messageId: sentRes.messageId,
            deleteAt,
          }).catch(() => {});

          output.sent += 1;
          output.scheduledDeletes.push({
            chatId: Number(groupId),
            messageId: sentRes.messageId,
            delayMs: REMINDER_INTERVAL_MS,
          });
        }
      }
    } catch {
      // Zero-error guarantee
    }
    return output;
  };
