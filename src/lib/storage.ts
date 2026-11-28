import { 
  Paper, 
  UserProfile, 
  Question, 
  SourcePaper, 
  TelegramQuiz, 
  TelegramBotConfig,
  ScheduledDailyTest,
  TestAttemptResult
} from "@/types";
import { initFirebase } from "./firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  deleteDoc, 
  query, 
  where,
  orderBy 
} from "firebase/firestore";

const STORAGE_KEY_PAPERS = "mcq_master_papers";
const STORAGE_KEY_USERS = "mcq_master_users";
const STORAGE_KEY_CURRENT_USER = "mcq_master_current_user";
const STORAGE_KEY_SOURCE_PAPERS = "mcq_master_source_papers";
const STORAGE_KEY_TELEGRAM_QUIZZES = "mcq_master_telegram_quizzes";
const STORAGE_KEY_TELEGRAM_BOT_CONFIG = "mcq_master_telegram_bot_config";
const STORAGE_KEY_SCHEDULED_TESTS = "mcq_master_scheduled_tests";
const STORAGE_KEY_TEST_ATTEMPTS = "mcq_master_test_attempts";

// Helper to generate a memorable test code like GSRTC-1042 or TEST-8291
export const generateTestCode = (category: string = "GSRTC"): string => {
  const prefix = category.toUpperCase().includes("GSRTC") ? "GSRTC" : "TEST";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${num}`;
};

// Default Initial Source Papers (Google Drive Links)
export const DEFAULT_SOURCE_PAPERS: SourcePaper[] = [
  {
    id: "source_paper_1",
    title: "GSRTC Old Exam Paper - 1 (ઓરિજિનલ પેપર ૧)",
    description: "આ પેપર ડાઉનલોડ કરો અને પ્રશ્નો ડિજિટલ રૂપમાં અહીં ટાઈપ કે પેસ્ટ કરો.",
    pdfUrl: "https://drive.google.com/file/d/1HUIo-sv3nUQv78dD8AQXcdT3-iqMFA7Y/view?usp=drive_link",
    examName: "GSRTC Conductor / Driver Exam",
    year: "ઓલ્ડ પેપર ૧",
    category: "GSRTC સ્પેશિયલ",
    targetQuestions: 100,
    createdAt: "2026-11-20T00:00:00.000Z",
  },
  {
    id: "source_paper_2",
    title: "GSRTC Old Exam Paper - 2 (ઓરિજિનલ પેપર ૨)",
    description: "આ પેપર ડાઉનલોડ કરો અને પ્રશ્નો ડિજિટલ રૂપમાં અહીં ટાઈપ કે પેસ્ટ કરો.",
    pdfUrl: "https://drive.google.com/file/d/1xL0VybupNC5T4hbro_AG8vr-KH2zLGWX/view?usp=drive_link",
    examName: "GSRTC Conductor / Driver Exam",
    year: "ઓલ્ડ પેપર ૨",
    category: "GSRTC સ્પેશિયલ",
    targetQuestions: 100,
    createdAt: "2026-11-21T00:00:00.000Z",
  },
  {
    id: "source_paper_3",
    title: "GSRTC Old Exam Paper - 3 (ઓરિજિનલ પેપર ૩)",
    description: "આ પેપર ડાઉનલોડ કરો અને પ્રશ્નો ડિજિટલ રૂપમાં અહીં ટાઈપ કે પેસ્ટ કરો.",
    pdfUrl: "https://drive.google.com/file/d/1OeYcIpcSrzeysnUkxzaHf5fLey1XhKWt/view?usp=drive_link",
    examName: "GSRTC Conductor / Driver Exam",
    year: "ઓલ્ડ પેપર ૩",
    category: "GSRTC સ્પેશિયલ",
    targetQuestions: 100,
    createdAt: "2026-11-22T00:00:00.000Z",
  },
  {
    id: "source_paper_4",
    title: "GSRTC Old Exam Paper - 4 (ઓરિજિનલ પેપર ૪)",
    description: "આ પેપર ડાઉનલોડ કરો અને પ્રશ્નો ડિજિટલ રૂપમાં અહીં ટાઈપ કે પેસ્ટ કરો.",
    pdfUrl: "https://drive.google.com/file/d/1ZMcJ7VoDKx5ZlxL94zZ4CieP6J2U8o_b/view?usp=drive_link",
    examName: "GSRTC Conductor / Driver Exam",
    year: "ઓલ્ડ પેપર ૪",
    category: "GSRTC સ્પેશિયલ",
    targetQuestions: 100,
    createdAt: "2026-11-23T00:00:00.000Z",
  },
];

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel("mcq_realtime_sync");
  } catch (e) {
    console.warn("BroadcastChannel not supported", e);
  }
}

// Telegram Bot Config (tokens are never persisted in the browser)
export const getTelegramBotConfig = (): TelegramBotConfig => {
  const safeDefaults: TelegramBotConfig = {
    botToken: "",
    botUsername: "GsrtcMockQuizBot",
    defaultTimePerQuestion: 30,
    targetGroupId: "",
    adminTelegramId: "",
    webAppUrl: "",
    webhookUrl: "",
    webhookSecret: "",
    pollDelayMs: 400,
  };

  if (typeof window === "undefined") {
    return {
      ...safeDefaults,
      botUsername:
        process.env.TELEGRAM_BOT_USERNAME ||
        process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
        safeDefaults.botUsername,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_BOT_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw) as TelegramBotConfig;
      const sanitized: TelegramBotConfig = {
        ...safeDefaults,
        ...parsed,
        botToken: "",
        webhookSecret: "",
      };
      // Clean up any token stored by an older version of the app.
      localStorage.setItem(
        STORAGE_KEY_TELEGRAM_BOT_CONFIG,
        JSON.stringify(sanitized)
      );
      return sanitized;
    }
  } catch (e) {}

  return safeDefaults;
};

export const setTelegramBotConfig = (cfg: TelegramBotConfig): void => {
  if (typeof window === "undefined") return;
  try {
    // Keep only non-secret settings locally; the server owns the token.
    const { botToken, webhookSecret, ...publicFields } = cfg;
    localStorage.setItem(
      STORAGE_KEY_TELEGRAM_BOT_CONFIG,
      JSON.stringify({ ...publicFields, botToken: "", webhookSecret: "" })
    );
    // Sync to server storage so server webhook & polling always have active credentials
    fetch("/api/telegram/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }).catch(() => {});
  } catch (e) {}
};

// Telegram Quizzes Storage
export const getLocalTelegramQuizzes = (): TelegramQuiz[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_QUIZZES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const setLocalTelegramQuizzes = (quizzes: TelegramQuiz[]): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_TELEGRAM_QUIZZES, JSON.stringify(quizzes));
    broadcastChannel?.postMessage({ type: "TELEGRAM_QUIZZES_UPDATED" });
  } catch (e) {}
};

export const saveTelegramQuiz = async (quiz: TelegramQuiz): Promise<void> => {
  const current = getLocalTelegramQuizzes();
  const idx = current.findIndex(q => q.code === quiz.code);
  if (idx >= 0) {
    current[idx] = quiz;
  } else {
    current.unshift(quiz);
  }
  setLocalTelegramQuizzes(current);

  // Sync with server storage so server-side webhook/poll can read this quiz
  // immediately. Await it so a /quiz command sent right after code generation
  // always finds the quiz.
  if (typeof window !== "undefined") {
    const res = await fetch("/api/telegram/save-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quiz),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `Could not sync quiz to server (${res.status})`);
    }
  }

  const { db } = initFirebase();
  if (db) {
    try {
      await setDoc(doc(db, "telegram_quizzes", quiz.code), quiz);
    } catch (e) {
      console.warn("Could not sync quiz to firestore", e);
    }
  }
};

export const getTelegramQuizByCode = async (code: string): Promise<TelegramQuiz | null> => {
  const cleanCode = code.trim().toUpperCase();
  const local = getLocalTelegramQuizzes();
  const found = local.find(q => q.code.toUpperCase() === cleanCode);
  if (found) return found;

  // Also check if any paper has this testCode directly
  const papers = getLocalPapers();
  const matchingPaper = papers.find(p => p.testCode?.toUpperCase() === cleanCode);
  if (matchingPaper && matchingPaper.questions?.length > 0) {
    const directQuiz: TelegramQuiz = {
      code: cleanCode,
      paperId: matchingPaper.id,
      title: matchingPaper.title,
      subject: matchingPaper.subject || matchingPaper.category,
      timePerQuestion: 30,
      questions: matchingPaper.questions,
      createdBy: matchingPaper.userName,
      creatorPhone: matchingPaper.userId,
      createdAt: matchingPaper.updatedAt || new Date().toISOString(),
    };
    saveTelegramQuiz(directQuiz).catch(() => {});
    return directQuiz;
  }

  const { db } = initFirebase();
  if (db) {
    try {
      const snap = await getDoc(doc(db, "telegram_quizzes", cleanCode));
      if (snap.exists()) {
        return snap.data() as TelegramQuiz;
      }
    } catch (e) {
      console.warn("Could not fetch quiz from cloud", e);
    }
  }
  return null;
};

// Source Papers management
export const getLocalSourcePapers = (): SourcePaper[] => {
  if (typeof window === "undefined") return DEFAULT_SOURCE_PAPERS;
  try {
    const data = localStorage.getItem(STORAGE_KEY_SOURCE_PAPERS);
    if (!data) {
      setLocalSourcePapers(DEFAULT_SOURCE_PAPERS);
      return DEFAULT_SOURCE_PAPERS;
    }
    const parsed: SourcePaper[] = JSON.parse(data);
    const existingIds = new Set(parsed.map(p => p.id));
    let hasMerged = false;
    for (const def of DEFAULT_SOURCE_PAPERS) {
      if (!existingIds.has(def.id)) {
        parsed.push(def);
        hasMerged = true;
      }
    }
    if (hasMerged) {
      setLocalSourcePapers(parsed);
    }
    return parsed;
  } catch (e) {
    console.error("Error reading local source papers", e);
    return DEFAULT_SOURCE_PAPERS;
  }
};

export const setLocalSourcePapers = (papers: SourcePaper[]): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_SOURCE_PAPERS, JSON.stringify(papers));
    broadcastChannel?.postMessage({ type: "SOURCE_PAPERS_UPDATED" });
  } catch (e) {
    console.error("Error writing local source papers", e);
  }
};

export const addOrUpdateSourcePaper = async (paper: SourcePaper): Promise<void> => {
  const current = getLocalSourcePapers();
  const idx = current.findIndex(p => p.id === paper.id);
  if (idx >= 0) {
    current[idx] = paper;
  } else {
    current.unshift(paper);
  }
  setLocalSourcePapers(current);

  const { db } = initFirebase();
  if (db) {
    try {
      await setDoc(doc(db, "source_papers", paper.id), paper);
    } catch (e) {
      console.warn("Could not sync source paper to firestore", e);
    }
  }
};

// Papers Management (Ensuring testCode is always present!)
export const getLocalPapers = (): Paper[] => {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_PAPERS);
    if (!data) return [];
    const parsed: Paper[] = JSON.parse(data);
    // Ensure every paper has a testCode
    let updated = false;
    parsed.forEach(p => {
      if (!p.testCode) {
        p.testCode = generateTestCode(p.category);
        updated = true;
      }
    });
    if (updated) {
      setLocalPapers(parsed);
    }
    return parsed;
  } catch (e) {
    console.error("Error reading local papers", e);
    return [];
  }
};

export const setLocalPapers = (papers: Paper[]): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PAPERS, JSON.stringify(papers));
    broadcastChannel?.postMessage({ type: "PAPERS_UPDATED" });
    window.dispatchEvent(new CustomEvent("mcq_papers_updated", { detail: papers }));
  } catch (e) {
    // Handle browser localStorage QuotaExceededError (~5MB) by evicting other users' cached papers
    try {
      const currUser = getCurrentUser();
      const myUid = currUser ? normalizeClientUserId(currUser.id) : "";
      const pruned = myUid
        ? papers.filter((p) => normalizeClientUserId(p.userId) === myUid)
        : papers.slice(0, 10);
      localStorage.setItem(STORAGE_KEY_PAPERS, JSON.stringify(pruned));
      broadcastChannel?.postMessage({ type: "PAPERS_UPDATED" });
      window.dispatchEvent(new CustomEvent("mcq_papers_updated", { detail: pruned }));
    } catch (e2) {
      console.error("Error writing local papers (quota full):", e2);
    }
  }
};

export const getLocalUsers = (): UserProfile[] => {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_USERS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error reading local users", e);
    return [];
  }
};

export const setLocalUsers = (users: UserProfile[]): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    broadcastChannel?.postMessage({ type: "USERS_UPDATED" });
  } catch (e) {
    console.error("Error writing local users", e);
  }
};

export const normalizeClientUserId = (raw: string): string => {
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

export const mergePapersList = (
  primary: Paper[],
  secondary: Paper[]
): Paper[] => {
  const map = new Map<string, Paper>();

  const upsert = (p: Paper) => {
    if (!p || !p.id) return;
    const key = p.id;
    const existing =
      map.get(key) ||
      (p.testCode
        ? Array.from(map.values()).find(
            (item) =>
              item.testCode &&
              item.testCode.toUpperCase() === p.testCode!.toUpperCase() &&
              normalizeClientUserId(item.userId) ===
                normalizeClientUserId(p.userId)
          )
        : undefined);

    if (!existing) {
      map.set(key, p);
      return;
    }

    const existingUpdated = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingUpdated = new Date(p.updatedAt || p.createdAt || 0).getTime();
    const existingQ = existing.questions?.length || 0;
    const incomingQ = p.questions?.length || 0;

    // Never drop full questions when merging with a summary-only record
    if (p.isSummaryOnly && existingQ > 0) {
      map.set(existing.id, {
        ...existing,
        questionCount: p.questionCount || existingQ,
        isSummaryOnly: false,
      });
      return;
    }

    if (
      incomingUpdated > existingUpdated ||
      (incomingUpdated === existingUpdated && incomingQ > existingQ) ||
      (existingQ === 0 && incomingQ > 0)
    ) {
      map.set(existing.id, {
        ...existing,
        ...p,
        id: existing.id,
        questions: incomingQ > 0 ? p.questions : existing.questions,
        questionCount: incomingQ || p.questionCount || existingQ || existing.questionCount || 0,
        isSummaryOnly: incomingQ > 0 ? false : Boolean(p.isSummaryOnly && existingQ === 0),
        userId: p.userId || existing.userId,
        userName: p.userName || existing.userName,
      });
    }
  };

  primary.forEach(upsert);
  secondary.forEach(upsert);

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
  );
};

export const mergeUsersList = (
  localList: UserProfile[],
  serverList: UserProfile[]
): UserProfile[] => {
  const map = new Map<string, UserProfile>();

  const upsert = (u: UserProfile, isServer: boolean) => {
    const uid = normalizeClientUserId(u.id || u.phoneNumber);
    if (!uid) return;
    const existing = map.get(uid);
    if (!existing) {
      map.set(uid, { ...u, id: uid, phoneNumber: uid });
      return;
    }
    const existingActive = new Date(existing.lastActive || 0).getTime();
    const incomingActive = new Date(u.lastActive || 0).getTime();
    map.set(uid, {
      ...existing,
      ...u,
      id: uid,
      phoneNumber: uid,
      name: (isServer && u.name ? u.name : existing.name || u.name) || "વિદ્યાર્થી",
      createdAt: existing.createdAt || u.createdAt,
      lastActive: incomingActive >= existingActive ? u.lastActive : existing.lastActive,
      hasLibraryAccess: isServer
        ? Boolean(u.hasLibraryAccess)
        : Boolean(existing.hasLibraryAccess || u.hasLibraryAccess),
      papersCount: Math.max(Number(existing.papersCount || 0), Number(u.papersCount || 0)),
      questionsCount: Math.max(Number(existing.questionsCount || 0), Number(u.questionsCount || 0)),
    });
  };

  localList.forEach((u) => upsert(u, false));
  serverList.forEach((u) => upsert(u, true));

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime()
  );
};

export const lookupServerUser = async (
  phoneNumber: string
): Promise<UserProfile | null> => {
  if (typeof window === "undefined") return null;
  const cleanId = normalizeClientUserId(phoneNumber);
  if (!cleanId) return null;
  try {
    const res = await fetch(
      `/api/users?phone=${encodeURIComponent(cleanId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data?.ok && data.user ? (data.user as UserProfile) : null;
  } catch {
    return null;
  }
};

export const syncUserPapersToServer = async (
  userId: string,
  syncAllBrowserPapers = false
): Promise<number> => {
  if (typeof window === "undefined" || !userId) return 0;
  const cleanId = normalizeClientUserId(userId);
  const allLocal = getLocalPapers();
  const candidates = syncAllBrowserPapers
    ? allLocal
    : allLocal.filter((p) => normalizeClientUserId(p.userId) === cleanId);

  if (candidates.length === 0) return 0;

  // Fast lightweight metadata check (<5KB) so we skip already-synced papers
  let serverMeta: Array<{
    id: string;
    testCode?: string;
    updatedAt?: string;
    questionCount?: number;
  }> = [];

  try {
    const mRes = await fetch("/api/papers?meta=1", { cache: "no-store" });
    if (mRes.ok) {
      const mData = await mRes.json().catch(() => null);
      if (mData?.ok && Array.isArray(mData.meta)) {
        serverMeta = mData.meta;
      }
    }
  } catch {
    // Proceed with uploading candidates in batches if meta probe fails
  }

  const metaById = new Map(serverMeta.map((m) => [m.id, m]));
  const metaByCode = new Map(
    serverMeta
      .filter((m) => m.testCode)
      .map((m) => [String(m.testCode).toUpperCase(), m])
  );

  const toSync = candidates.filter((p) => {
    const srv =
      metaById.get(p.id) ||
      (p.testCode ? metaByCode.get(p.testCode.toUpperCase()) : undefined);
    if (!srv) return true;
    const localQ = p.questions?.length || 0;
    const srvQ = Number(srv.questionCount || 0);
    if (localQ > srvQ) return true;
    const localTs = new Date(p.updatedAt || p.createdAt || 0).getTime();
    const srvTs = new Date(srv.updatedAt || 0).getTime();
    return localTs > srvTs + 1000;
  });

  if (toSync.length === 0) return 0;

  // Group into size-aware batches (~1.2MB max per POST, staying well under Vercel 4.5MB)
  const batches: Paper[][] = [];
  let currentBatch: Paper[] = [];
  let currentBytes = 0;

  for (const p of toSync) {
    const size = JSON.stringify(p).length;
    if (
      currentBatch.length > 0 &&
      (currentBytes + size > 1_200_000 || currentBatch.length >= 6)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }
    currentBatch.push(p);
    currentBytes += size;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  let synced = 0;
  for (const batch of batches) {
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: batch, alsoSyncQuizzes: true }),
      });
      if (res.ok) {
        synced += batch.length;
      }
    } catch {
      // Continue remaining batches cleanly
    }
  }

  if (synced > 0) {
    window.dispatchEvent(new CustomEvent("mcq_papers_updated"));
  }
  return synced;
};

export const toggleUserLibraryAccess = async (userId: string): Promise<boolean> => {
  const cleanId = normalizeClientUserId(userId);
  let newState: boolean | null = null;

  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: cleanId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.ok && data.user) {
          newState = Boolean(data.user.hasLibraryAccess);
        }
      }
    } catch (e) {
      console.warn("Could not toggle library access on server:", e);
    }
  }

  const users = getLocalUsers();
  const idx = users.findIndex((u) => normalizeClientUserId(u.id) === cleanId);
  if (newState === null) {
    if (idx < 0) return false;
    newState = !users[idx].hasLibraryAccess;
  }

  if (idx >= 0) {
    users[idx].hasLibraryAccess = newState;
    setLocalUsers(users);
  }

  const current = getCurrentUser();
  if (current && normalizeClientUserId(current.id) === cleanId) {
    current.hasLibraryAccess = newState;
    setCurrentUser(current);
  }

  const { db } = initFirebase();
  if (db) {
    try {
      await setDoc(doc(db, "users", cleanId), { hasLibraryAccess: newState }, { merge: true });
    } catch (e) {
      console.warn("Could not sync user library access to firestore", e);
    }
  }

  return newState;
};

export const getCurrentUser = (): UserProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const setCurrentUser = (user: UserProfile | null): void => {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  }
};

export const loginOrRegister = async (phoneNumber: string, name: string): Promise<UserProfile> => {
  const cleanPhone = normalizeClientUserId(phoneNumber);
  const cleanName = name.trim();
  const now = new Date().toISOString();

  let userObj: UserProfile = {
    id: cleanPhone,
    phoneNumber: cleanPhone,
    name: cleanName,
    createdAt: now,
    lastActive: now,
  };

  const localUsers = getLocalUsers();
  const existingIndex = localUsers.findIndex(
    (u) => normalizeClientUserId(u.id) === cleanPhone
  );
  if (existingIndex >= 0) {
    userObj.createdAt = localUsers[existingIndex].createdAt || now;
    userObj.hasLibraryAccess = localUsers[existingIndex].hasLibraryAccess;
    if (!cleanName && localUsers[existingIndex].name) {
      userObj.name = localUsers[existingIndex].name;
    }
    localUsers[existingIndex] = { ...localUsers[existingIndex], ...userObj };
  } else {
    localUsers.push(userObj);
  }
  setLocalUsers(localUsers);
  setCurrentUser(userObj);

  // Persist user registration on server (Upstash Redis) so Admin & other devices see it
  if (typeof window !== "undefined" && cleanPhone) {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userObj),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.ok && data.user) {
          userObj = { ...userObj, ...data.user };
          const updatedLocal = getLocalUsers();
          const idx2 = updatedLocal.findIndex(
            (u) => normalizeClientUserId(u.id) === cleanPhone
          );
          if (idx2 >= 0) {
            updatedLocal[idx2] = userObj;
          } else {
            updatedLocal.push(userObj);
          }
          setLocalUsers(updatedLocal);
          setCurrentUser(userObj);
        }
      }
    } catch (err) {
      console.warn("Could not sync user to server:", err);
    }
  }

  const { db } = initFirebase();
  if (db) {
    try {
      const userRef = doc(db, "users", cleanPhone);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const cloudData = snap.data() as UserProfile;
        userObj.createdAt = cloudData.createdAt || userObj.createdAt;
        await setDoc(userRef, { ...userObj, lastActive: now }, { merge: true });
      } else {
        await setDoc(userRef, userObj);
      }
    } catch (err) {
      console.warn("Could not sync user to Firebase:", err);
    }
  }

  return userObj;
};

// Save a Paper with real-time sync & auto-link Telegram test code
export const savePaper = async (
  paper: Paper,
  options: { allowEmptyQuestions?: boolean } = {}
): Promise<void> => {
  if (paper.isSummaryOnly) {
    console.warn("Skipped saving summary-only paper payload to protect questions.");
    return;
  }

  const now = new Date().toISOString();
  const code = paper.testCode || generateTestCode(paper.category);
  const normalizedUserId = normalizeClientUserId(paper.userId || "");

  const updatedPaper: Paper = {
    ...paper,
    isSummaryOnly: false,
    questionCount: paper.questions?.length || 0,
    userId: normalizedUserId || paper.userId,
    creatorPhone: normalizedUserId || paper.creatorPhone,
    testCode: code,
    updatedAt: now,
  };

  fullPaperCache.set(updatedPaper.id, updatedPaper);

  const localPapers = getLocalPapers();
  const existingIdx = localPapers.findIndex(p => p.id === paper.id);
  if (existingIdx >= 0) {
    localPapers[existingIdx] = updatedPaper;
  } else {
    localPapers.unshift(updatedPaper);
  }
  setLocalPapers(localPapers);

  if (typeof window !== "undefined") {
    localStorage.removeItem(`mcq_draft_${paper.id}`);

    // Sync full paper to server Supabase store
    try {
      await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          options.allowEmptyQuestions
            ? { ...updatedPaper, allowEmptyQuestions: true }
            : updatedPaper
        ),
      });
    } catch (e) {
      console.warn("Could not sync full paper to server:", e);
    }
  }

  // Auto-sync to Telegram Quizzes store so the /quiz code is always live!
  if (updatedPaper.questions && updatedPaper.questions.length > 0) {
    const tQuiz: TelegramQuiz = {
      code: code,
      paperId: updatedPaper.id,
      title: updatedPaper.title,
      subject: updatedPaper.subject || updatedPaper.category,
      timePerQuestion: 30,
      questions: updatedPaper.questions,
      createdBy: updatedPaper.userName,
      creatorPhone: updatedPaper.userId,
      createdAt: now,
    };
    await saveTelegramQuiz(tQuiz).catch((err) => {
      console.warn("Could not mirror quiz to server:", err);
    });
  }

  const localUsers = getLocalUsers();
  const userIdx = localUsers.findIndex(
    (u) => normalizeClientUserId(u.id) === normalizedUserId
  );
  if (userIdx >= 0) {
    const userPapers = localPapers.filter(
      (p) => normalizeClientUserId(p.userId) === normalizedUserId
    );
    const totalQuestions = userPapers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
    localUsers[userIdx].papersCount = userPapers.length;
    localUsers[userIdx].questionsCount = totalQuestions;
    localUsers[userIdx].lastActive = now;
    setLocalUsers(localUsers);
  }

  const { db } = initFirebase();
  if (db) {
    try {
      const paperRef = doc(db, "papers", paper.id);
      await setDoc(paperRef, updatedPaper);

      const userRef = doc(db, "users", normalizedUserId || paper.userId);
      await setDoc(userRef, {
        lastActive: now,
        papersCount: (userIdx >= 0 ? localUsers[userIdx].papersCount : 1),
        questionsCount: (userIdx >= 0 ? localUsers[userIdx].questionsCount : paper.questions?.length || 0)
      }, { merge: true });
    } catch (err) {
      console.warn("Firebase save error (saved locally):", err);
    }
  }
};

export const deletePaper = async (paperId: string, testCode?: string): Promise<void> => {
  const localPapers = getLocalPapers();
  const target = localPapers.find((p) => p.id === paperId);
  const filtered = localPapers.filter((p) => p.id !== paperId);
  setLocalPapers(filtered);

  if (typeof window !== "undefined") {
    localStorage.removeItem(`mcq_draft_${paperId}`);
    window.dispatchEvent(
      new CustomEvent("mcq_papers_updated", { detail: filtered })
    );

    // Also delete from server storage (Upstash Redis)
    const code = testCode || target?.testCode || "";
    const user = getCurrentUser();
    const query = new URLSearchParams();
    if (paperId) query.set("id", paperId);
    if (code) query.set("code", code);
    if (user?.phoneNumber) query.set("userPhone", user.phoneNumber);

    try {
      await fetch(`/api/papers?${query.toString()}`, { method: "DELETE" });
    } catch (e) {
      console.warn("Could not delete paper from server", e);
    }
  }

  const { db } = initFirebase();
  if (db) {
    try {
      await deleteDoc(doc(db, "papers", paperId));
    } catch (err) {
      console.warn("Firebase delete error:", err);
    }
  }
};

const fullPaperCache = new Map<string, Paper>();

export const fetchFullPaper = async (paper: Paper): Promise<Paper> => {
  if (!paper) return paper;
  if (!paper.isSummaryOnly && Array.isArray(paper.questions) && paper.questions.length > 0) {
    fullPaperCache.set(paper.id, paper);
    return paper;
  }

  const cached = fullPaperCache.get(paper.id);
  if (cached && cached.questions && cached.questions.length > 0) {
    return cached;
  }

  if (typeof window === "undefined") return paper;

  // Check localStorage first
  const localMatch = getLocalPapers().find(
    (p) => p.id === paper.id && !p.isSummaryOnly && (p.questions?.length || 0) > 0
  );
  if (localMatch) {
    fullPaperCache.set(paper.id, localMatch);
    return localMatch;
  }

  try {
    const params = new URLSearchParams();
    if (paper.id) params.set("paperId", paper.id);
    if (paper.testCode) params.set("code", paper.testCode);
    const res = await fetch(`/api/papers?${params.toString()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.ok && data.paper) {
        const full: Paper = {
          ...data.paper,
          isSummaryOnly: false,
          questionCount: data.paper.questions?.length || 0,
        };
        fullPaperCache.set(full.id, full);
        return full;
      }
    }
  } catch (e) {
    console.warn("Could not fetch full paper:", e);
  }

  return paper;
};

export const fetchCommunityPapersSummary = async (
  userIdFilter?: string
): Promise<Paper[]> => {
  if (typeof window === "undefined") return [];
  try {
    const params = new URLSearchParams({ summary: "1" });
    if (userIdFilter) params.set("userId", userIdFilter);
    const res = await fetch(`/api/papers?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return data?.ok && Array.isArray(data.papers) ? data.papers : [];
  } catch (e) {
    console.warn("Could not fetch community paper summaries:", e);
    return [];
  }
};

export const fetchCommunityPapers = async (userIdFilter?: string): Promise<Paper[]> => {
  if (typeof window === "undefined") return [];
  const collected: Paper[] = [];
  let offset = 0;

  try {
    for (let page = 0; page < 30; page++) {
      const params = new URLSearchParams();
      if (userIdFilter) params.set("userId", userIdFilter);
      if (offset > 0) params.set("offset", String(offset));
      const qs = params.toString();
      const res = await fetch(`/api/papers${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const data = await res.json().catch(() => null);
      if (!data?.ok || !Array.isArray(data.papers)) break;
      collected.push(...data.papers);
      if (!data.hasMore || typeof data.nextOffset !== "number" || data.nextOffset <= offset) {
        break;
      }
      offset = data.nextOffset;
    }
  } catch (e) {
    console.warn("Could not fetch community papers:", e);
  }

  return collected;
};

export const subscribeUserPapers = (
  userId: string,
  callback: (papers: Paper[]) => void
): (() => void) => {
  const cleanUserId = normalizeClientUserId(userId);
  const getUserLocal = () =>
    getLocalPapers().filter(
      (p) => normalizeClientUserId(p.userId) === cleanUserId
    );

  const notify = () => {
    callback(getUserLocal());
  };

  notify();

  // Fetch user's paper summaries fast (<150ms) so switching browsers or refreshing
  // always restores all user papers immediately without timing out.
  let cancelled = false;
  if (typeof window !== "undefined" && cleanUserId) {
    fetchCommunityPapersSummary(cleanUserId)
      .then((serverMine) => {
        if (cancelled || serverMine.length === 0) return;
        const currentLocal = getLocalPapers();
        const mineLocal = currentLocal.filter(
          (p) => normalizeClientUserId(p.userId) === cleanUserId
        );
        const mergedMine = mergePapersList(mineLocal, serverMine);
        const otherLocal = currentLocal.filter(
          (p) => normalizeClientUserId(p.userId) !== cleanUserId
        );
        setLocalPapers([...mergedMine, ...otherLocal]);
        callback(mergedMine);
      })
      .catch(() => {});
  }

  const { db } = initFirebase();
  let unsubscribeFirestore: (() => void) | null = null;

  if (db) {
    try {
      const q = query(collection(db, "papers"), where("userId", "==", cleanUserId));
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const cloudPapers: Paper[] = [];
          snapshot.forEach((doc) => {
            cloudPapers.push(doc.data() as Paper);
          });

          const currentLocal = getLocalPapers();
          const mineLocal = currentLocal.filter(
            (p) => normalizeClientUserId(p.userId) === cleanUserId
          );
          const mergedMine = mergePapersList(cloudPapers, mineLocal);
          const otherPapers = currentLocal.filter(
            (p) => normalizeClientUserId(p.userId) !== cleanUserId
          );
          setLocalPapers([...mergedMine, ...otherPapers]);

          callback(mergedMine);
        },
        (error) => {
          console.warn("Firestore subscription error, using local:", error);
        }
      );
    } catch (err) {
      console.warn("Error setting up firestore listener:", err);
    }
  }

  const handleMessage = (e: MessageEvent) => {
    if (e.data?.type === "PAPERS_UPDATED") {
      notify();
    }
  };

  const handleLocalEvent = () => {
    notify();
  };

  broadcastChannel?.addEventListener("message", handleMessage);
  if (typeof window !== "undefined") {
    window.addEventListener("mcq_papers_updated", handleLocalEvent);
  }

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
    broadcastChannel?.removeEventListener("message", handleMessage);
    if (typeof window !== "undefined") {
      window.removeEventListener("mcq_papers_updated", handleLocalEvent);
    }
  };
};

export const subscribeAllPapers = (callback: (papers: Paper[]) => void): (() => void) => {
  callback(getLocalPapers());

  let cancelled = false;
  if (typeof window !== "undefined") {
    fetchCommunityPapersSummary()
      .then((serverPapers) => {
        if (cancelled || serverPapers.length === 0) return;
        const merged = mergePapersList(getLocalPapers(), serverPapers);
        callback(merged);
      })
      .catch(() => {});
  }

  const { db } = initFirebase();
  let unsubscribeFirestore: (() => void) | null = null;

  if (db) {
    try {
      const q = query(collection(db, "papers"), orderBy("updatedAt", "desc"));
      unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        const cloudPapers: Paper[] = [];
        snapshot.forEach((doc) => {
          cloudPapers.push(doc.data() as Paper);
        });
        const merged = mergePapersList(cloudPapers, getLocalPapers());
        callback(merged);
      }, (err) => {
        console.warn("Admin firestore papers error:", err);
      });
    } catch (e) {
      console.warn("Admin listener setup error:", e);
    }
  }

  const handleMessage = (e: MessageEvent) => {
    if (e.data?.type === "PAPERS_UPDATED") {
      callback(getLocalPapers());
    }
  };

  broadcastChannel?.addEventListener("message", handleMessage);

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
    broadcastChannel?.removeEventListener("message", handleMessage);
  };
};

export const subscribeAllUsers = (callback: (users: UserProfile[]) => void): (() => void) => {
  callback(getLocalUsers());

  let cancelled = false;
  if (typeof window !== "undefined") {
    fetch("/api/users", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.ok || !Array.isArray(data.users)) return;
        const merged = mergeUsersList(getLocalUsers(), data.users);
        setLocalUsers(merged);
        callback(merged);
      })
      .catch(() => {});
  }

  const { db } = initFirebase();
  let unsubscribeFirestore: (() => void) | null = null;

  if (db) {
    try {
      const q = query(collection(db, "users"));
      unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        const cloudUsers: UserProfile[] = [];
        snapshot.forEach((doc) => {
          cloudUsers.push(doc.data() as UserProfile);
        });
        const merged = mergeUsersList(getLocalUsers(), cloudUsers);
        setLocalUsers(merged);
        callback(merged);
      }, (err) => {
        console.warn("Admin firestore users error:", err);
      });
    } catch (e) {
      console.warn("Admin users listener error:", e);
    }
  }

  const handleMessage = (e: MessageEvent) => {
    if (e.data?.type === "USERS_UPDATED") {
      callback(getLocalUsers());
    }
  };

  broadcastChannel?.addEventListener("message", handleMessage);

  return () => {
    cancelled = true;
    if (unsubscribeFirestore) unsubscribeFirestore();
    broadcastChannel?.removeEventListener("message", handleMessage);
  };
};

export const saveTemporaryDraft = (paperId: string, questions: Question[]): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`mcq_draft_${paperId}`, JSON.stringify({
      questions,
      savedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.warn("Failed to write draft cache", e);
  }
};

export const getTemporaryDraft = (paperId: string): Question[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`mcq_draft_${paperId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.questions)) {
        return parsed.questions;
      }
    }
  } catch (e) {
    console.warn("Failed to read draft cache", e);
  }
  return null;
};

// ==========================================
// Daily Mock Test Scheduler Management
// ==========================================

export const getLocalScheduledTests = (): ScheduledDailyTest[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCHEDULED_TESTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const setLocalScheduledTests = (tests: ScheduledDailyTest[]): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_SCHEDULED_TESTS, JSON.stringify(tests));
    broadcastChannel?.postMessage({ type: "SCHEDULED_TESTS_UPDATED" });
  } catch (e) {}
};

export const saveScheduledDailyTest = async (test: ScheduledDailyTest): Promise<void> => {
  // Server is the source of truth so the cron daemon can run schedules even
  // when no admin browser is open.
  if (typeof window !== "undefined") {
    const res = await fetch("/api/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(test),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "શેડ્યુલ સર્વર પર સેવ થઈ શક્યું નહીં.");
    }
    if (data.schedule?.id) {
      test = { ...test, ...data.schedule };
    }
  }

  const current = getLocalScheduledTests();
  const idx = current.findIndex(t => t.id === test.id);
  if (idx >= 0) {
    current[idx] = test;
  } else {
    current.unshift(test);
  }
  setLocalScheduledTests(current);

  const { db } = initFirebase();
  if (db) {
    try {
      await setDoc(doc(db, "scheduled_tests", test.id), test);
    } catch (e) {
      console.warn("Could not sync scheduled test to firestore", e);
    }
  }
};

export const deleteScheduledDailyTest = async (testId: string): Promise<void> => {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/scheduler?id=${encodeURIComponent(testId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "શેડ્યુલ ડિલીટ થઈ શક્યું નહીં.");
    }
  }

  const current = getLocalScheduledTests().filter(t => t.id !== testId);
  setLocalScheduledTests(current);

  const { db } = initFirebase();
  if (db) {
    try {
      await deleteDoc(doc(db, "scheduled_tests", testId));
    } catch (e) {
      console.warn("Could not delete scheduled test from firestore", e);
    }
  }
};

/** Pull the server-side schedules (admin only). */
export const fetchServerScheduledTests = async (): Promise<ScheduledDailyTest[]> => {
  const res = await fetch("/api/scheduler", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const schedules: ScheduledDailyTest[] = Array.isArray(data.schedules)
    ? data.schedules
    : [];
  if (schedules.length > 0) {
    setLocalScheduledTests(schedules);
  }
  return schedules;
};

/**
 * Intelligent Test Dispatcher (server-side):
 * The API builds a fresh mixed/subject-wise quiz from all server quizzes,
 * saves it under a unique code, and launches the Telegram poll run.
 */
export const dispatchScheduledDailyTest = async (scheduleId: string): Promise<TelegramQuiz | null> => {
  const res = await fetch("/api/scheduler/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: scheduleId }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "ટેસ્ટ મોકલવામાં ક્ષતિ થઈ.");
  }

  await fetchServerScheduledTests().catch(() => {});

  const code = String(data.code || "");
  if (!code) return null;

  // Fetch the generated quiz so the admin panel can show its details.
  try {
    const quizRes = await fetch(`/api/telegram/quiz/${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (quizRes.ok) {
      const quizData = await quizRes.json();
      if (quizData.quiz) return quizData.quiz as TelegramQuiz;
    }
  } catch (e) {
    console.warn("Could not fetch dispatched quiz", e);
  }

  return {
    code,
    paperId: `sched_${scheduleId}`,
    title: "ડેઇલી મોક ટેસ્ટ",
    subject: "",
    timePerQuestion: 30,
    questions: [],
    createdBy: "Admin Scheduler",
    creatorPhone: "server",
    createdAt: new Date().toISOString(),
  };
};

// ==========================================
// Server test attempts (real leaderboard)
// ==========================================

export interface PublicTestAttempt {
  id: string;
  testCode: string;
  paperId: string;
  paperTitle: string;
  subject: string;
  studentName: string;
  score: number;
  totalQuestions: number;
  wrongCount: number;
  percentage: number;
  grade: string;
  completedAt: string;
}

export const fetchServerTestAttempts = async (
  testCodeOrPaperId?: string
): Promise<PublicTestAttempt[]> => {
  if (typeof window === "undefined") return [];
  try {
    const params = new URLSearchParams();
    if (testCodeOrPaperId) {
      if (/^[A-Za-z]+-\d+$/.test(testCodeOrPaperId.trim())) {
        params.set("code", testCodeOrPaperId.trim());
      } else {
        params.set("paperId", testCodeOrPaperId.trim());
      }
    }
    const qs = params.toString();
    const res = await fetch(`/api/attempts${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.attempts) ? data.attempts : [];
  } catch (e) {
    return [];
  }
};

// ==========================================
// Test Attempts & Leaderboard Storage
// ==========================================

export const getLocalTestAttempts = (testCodeOrPaperId?: string): TestAttemptResult[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TEST_ATTEMPTS);
    const list: TestAttemptResult[] = raw ? JSON.parse(raw) : [];
    if (testCodeOrPaperId) {
      const q = testCodeOrPaperId.toLowerCase().trim();
      return list.filter(a => a.testCode?.toLowerCase() === q || a.paperId?.toLowerCase() === q);
    }
    return list;
  } catch (e) {
    return [];
  }
};

export const saveTestAttempt = async (attempt: TestAttemptResult): Promise<void> => {
  const current = getLocalTestAttempts();
  current.unshift(attempt);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_TEST_ATTEMPTS, JSON.stringify(current.slice(0, 200)));
      broadcastChannel?.postMessage({ type: "TEST_ATTEMPTS_UPDATED" });
    } catch (e) {}

    // Sync to the server so the Telegram/web leaderboard reflects every
    // student, not just the current browser.
    fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt),
    }).catch(() => {});
  }

  const { db } = initFirebase();
  if (db) {
    try {
      await setDoc(doc(db, "test_attempts", attempt.id), attempt);
    } catch (e) {
      console.warn("Could not sync test attempt to firestore", e);
    }
  }
};

