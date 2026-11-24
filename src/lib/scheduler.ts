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

import { Question, ScheduledDailyTest, TelegramQuiz } from "@/types";
import {
  getAllServerQuizzes,
  getAllServerSchedules,
  getServerBotConfig,
  saveServerQuiz,
  saveServerSchedule,
} from "./serverStorage";
import { dispatchQuizToChat } from "./telegramBotEngine";

const IST_TIME_ZONE = "Asia/Kolkata";

export interface SchedulerRunResult {
  ok: boolean;
  ran: number;
  errors: string[];
  dispatched: Array<{ scheduleId: string; code?: string; error?: string }>;
}

const getIstParts = (date = new Date()): { day: string; minutes: number } => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const hours = Number(get("hour")) % 24;
  const minutes = Number(get("minute"));
  return { day, minutes: hours * 60 + minutes };
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
  }

  const questions: Question[] = [];
  relevant.forEach((quiz) => {
    if (Array.isArray(quiz.questions)) questions.push(...quiz.questions);
  });
  return dedupeQuestions(questions);
};

export const buildQuizFromSchedule = async (
  schedule: ScheduledDailyTest
): Promise<TelegramQuiz | null> => {
  const quizzes = await getAllServerQuizzes();
  const candidates = collectCandidateQuestions(quizzes, schedule);
  if (candidates.length === 0) return null;

  const requested = Math.max(
    1,
    Math.min(Number(schedule.questionCount) || 20, candidates.length)
  );

  const shouldShuffle = schedule.shuffleQuestions !== false;
  const selected = shouldShuffle
    ? shuffle(candidates).slice(0, requested)
    : candidates.slice(0, requested);

  const questions = selected.map((question, index) => ({
    ...question,
    questionNumber: index + 1,
  }));

  const existingCodes = new Set(quizzes.map((q) => q.code.toUpperCase()));
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
    const matched = quizzes.find(
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
  }

  const quiz: TelegramQuiz = {
    code,
    paperId: `sched_${schedule.id}`,
    title: schedule.title || defaultTitle,
    subject: subjectLabel,
    timePerQuestion: Math.max(
      10,
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

  const quiz = await buildQuizFromSchedule(schedule);
  if (!quiz) {
    return {
      ok: false,
      error: "પૂરતા પ્રશ્નો ઉપલબ્ધ નથી. પહેલા ટેસ્ટ/પેપર ડિજિટાઇઝ કરો.",
    };
  }

  const result = await dispatchQuizToChat({
    quiz,
    chatId: targetGroupId,
    chatTitle: schedule.title,
    hostOrigin: options.hostOrigin,
    startedBy: { id: "0", name: "Admin Scheduler" },
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "ટેસ્ટ શરૂ થઈ શકી નહીં." };
  }

  const now = new Date();
  const { day } = getIstParts(now);
  schedule.lastRunAt = now.toISOString();
  schedule.lastRunDay = day;
  schedule.lastGeneratedCode = quiz.code;
  await saveServerSchedule(schedule);

  return { ok: true, code: quiz.code };
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

  // Only dispatch if current time is within a 30-minute window of the scheduled time.
  // This prevents an 08:00 AM test created at night from backfilling and running at 11:00 PM!
  const MAX_SCHEDULE_TOLERANCE_MINUTES = 30;

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
    // OR if it's more than 30 minutes past the scheduled time (diff > 30), do NOT run!
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

    const dispatch = await dispatchSchedule(schedule, { hostOrigin });
    if (dispatch.ok) {
      result.ran += 1;
    } else {
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
