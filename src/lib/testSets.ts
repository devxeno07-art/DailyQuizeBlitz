import { Question } from "@/types";

export interface QuestionSet {
  setNumber: number;
  totalSets: number;
  setSize: number;
  startIndex: number; // 0-based inclusive
  endIndex: number; // 0-based exclusive
  startQuestion: number; // 1-based inclusive
  endQuestion: number; // 1-based inclusive
  questionCount: number;
  questions: Question[];
  key: string; // `${paperKey}::${setSize}::${setNumber}`
  label: string; // e.g. "Set 1 (Q1–50)"
}

export interface StudentSetAttemptSummary {
  setNumber: number;
  setSize: number;
  startQuestion: number;
  endQuestion: number;
  score: number;
  total: number;
  percentage: number;
  completedAt: string;
}

export interface StudentPaperProgress {
  paperKey: string;
  preferredSetSize: number;
  completedIndices: number[]; // 0-based indices of attempted/completed questions
  completedSets: Record<string, StudentSetAttemptSummary>; // key = `${setSize}::${setNumber}`
  updatedAt: string;
}

const PROGRESS_STORAGE_KEY = "gsrtc_student_set_progress_v1";

/**
 * Normalizes a paper identifier key so progress matches reliably across
 * local papers and community papers sharing the same testCode or id.
 */
export const normalizePaperProgressKey = (
  paperId: string,
  testCode?: string,
  userPhone?: string
): string => {
  const base = (testCode || paperId || "unknown").trim().toUpperCase();
  const userPart = (userPhone || "guest").trim();
  return `${userPart}::${base}`;
};

/**
 * Splits a question list sequentially into uniform sets of `setSize`
 * (with the final set containing any remainder).
 */
export const divideQuestionsIntoSets = (
  paperKey: string,
  questions: Question[],
  rawSetSize: number
): QuestionSet[] => {
  const total = Array.isArray(questions) ? questions.length : 0;
  if (total === 0) return [];

  const setSize = Math.max(1, Math.min(total, Math.floor(Number(rawSetSize) || 30)));
  const totalSets = Math.ceil(total / setSize);
  const sets: QuestionSet[] = [];

  for (let i = 0; i < totalSets; i++) {
    const startIndex = i * setSize;
    const endIndex = Math.min(total, startIndex + setSize);
    const slice = questions.slice(startIndex, endIndex);
    const setNumber = i + 1;
    const startQuestion = startIndex + 1;
    const endQuestion = endIndex;

    sets.push({
      setNumber,
      totalSets,
      setSize,
      startIndex,
      endIndex,
      startQuestion,
      endQuestion,
      questionCount: slice.length,
      questions: slice,
      key: `${paperKey}::${setSize}::${setNumber}`,
      label: `Set ${setNumber} (Q${startQuestion}–${endQuestion})`,
    });
  }

  return sets;
};

const readAllStudentProgress = (): Record<string, StudentPaperProgress> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeAllStudentProgress = (map: Record<string, StudentPaperProgress>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("Could not save student set progress", e);
  }
};

export const getStudentPaperProgress = (
  paperId: string,
  testCode?: string,
  userPhone?: string,
  defaultSetSize = 30
): StudentPaperProgress => {
  const key = normalizePaperProgressKey(paperId, testCode, userPhone);
  const all = readAllStudentProgress();
  const existing = all[key];
  if (existing) {
    return {
      paperKey: key,
      preferredSetSize: existing.preferredSetSize || defaultSetSize,
      completedIndices: Array.isArray(existing.completedIndices) ? existing.completedIndices : [],
      completedSets: existing.completedSets || {},
      updatedAt: existing.updatedAt || new Date().toISOString(),
    };
  }
  return {
    paperKey: key,
    preferredSetSize: defaultSetSize,
    completedIndices: [],
    completedSets: {},
    updatedAt: new Date().toISOString(),
  };
};

export const savePreferredSetSize = (
  paperId: string,
  testCode: string | undefined,
  userPhone: string | undefined,
  setSize: number
): void => {
  const key = normalizePaperProgressKey(paperId, testCode, userPhone);
  const all = readAllStudentProgress();
  const current = getStudentPaperProgress(paperId, testCode, userPhone, setSize);
  all[key] = {
    ...current,
    preferredSetSize: Math.max(1, Math.floor(setSize)),
    updatedAt: new Date().toISOString(),
  };
  writeAllStudentProgress(all);
};

export const markStudentSetCompleted = (
  paperId: string,
  testCode: string | undefined,
  userPhone: string | undefined,
  set: Pick<QuestionSet, "setNumber" | "setSize" | "startIndex" | "endIndex" | "startQuestion" | "endQuestion">,
  score: number,
  total: number,
  percentage: number
): StudentPaperProgress => {
  const key = normalizePaperProgressKey(paperId, testCode, userPhone);
  const all = readAllStudentProgress();
  const current = getStudentPaperProgress(paperId, testCode, userPhone, set.setSize);

  const indexSet = new Set<number>(current.completedIndices);
  for (let idx = set.startIndex; idx < set.endIndex; idx++) {
    indexSet.add(idx);
  }

  const setKey = `${set.setSize}::${set.setNumber}`;
  const updated: StudentPaperProgress = {
    ...current,
    preferredSetSize: set.setSize,
    completedIndices: Array.from(indexSet).sort((a, b) => a - b),
    completedSets: {
      ...current.completedSets,
      [setKey]: {
        setNumber: set.setNumber,
        setSize: set.setSize,
        startQuestion: set.startQuestion,
        endQuestion: set.endQuestion,
        score,
        total,
        percentage,
        completedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  };

  all[key] = updated;
  writeAllStudentProgress(all);
  return updated;
};

export const resetStudentPaperProgress = (
  paperId: string,
  testCode: string | undefined,
  userPhone: string | undefined
): void => {
  const key = normalizePaperProgressKey(paperId, testCode, userPhone);
  const all = readAllStudentProgress();
  delete all[key];
  writeAllStudentProgress(all);
};

export const getSetCompletionInfo = (
  set: QuestionSet,
  progress: StudentPaperProgress
): {
  isCompleted: boolean;
  coveredCount: number;
  summary?: StudentSetAttemptSummary;
} => {
  const setKey = `${set.setSize}::${set.setNumber}`;
  const summary = progress.completedSets[setKey];
  const coveredSet = new Set(progress.completedIndices);
  let coveredCount = 0;
  for (let idx = set.startIndex; idx < set.endIndex; idx++) {
    if (coveredSet.has(idx)) coveredCount++;
  }
  const isCompleted = Boolean(summary) || (set.questionCount > 0 && coveredCount >= set.questionCount);
  return { isCompleted, coveredCount, summary };
};
