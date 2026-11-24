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
    try {
      const res = await fetch("/api/telegram/save-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quiz),
      });
      if (!res.ok) {
        console.warn("Could not sync quiz to server", res.status);
      }
    } catch (e) {
      console.warn("Could not sync quiz to server", e);
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
    saveTelegramQuiz(directQuiz);
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
    console.error("Error writing local papers", e);
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

export const toggleUserLibraryAccess = async (userId: string): Promise<boolean> => {
  const users = getLocalUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return false;
  
  const newState = !users[idx].hasLibraryAccess;
  users[idx].hasLibraryAccess = newState;
  setLocalUsers(users);

  const current = getCurrentUser();
  if (current && current.id === userId) {
    current.hasLibraryAccess = newState;
    setCurrentUser(current);
  }

  const { db } = initFirebase();
  if (db) {
    try {
      await setDoc(doc(db, "users", userId), { hasLibraryAccess: newState }, { merge: true });
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
  const cleanPhone = phoneNumber.trim().replace(/\D/g, "");
  const cleanName = name.trim();
  const now = new Date().toISOString();

  const userObj: UserProfile = {
    id: cleanPhone,
    phoneNumber: cleanPhone,
    name: cleanName,
    createdAt: now,
    lastActive: now,
  };

  const localUsers = getLocalUsers();
  const existingIndex = localUsers.findIndex(u => u.id === cleanPhone);
  if (existingIndex >= 0) {
    userObj.createdAt = localUsers[existingIndex].createdAt || now;
    if (!cleanName && localUsers[existingIndex].name) {
      userObj.name = localUsers[existingIndex].name;
    }
    localUsers[existingIndex] = { ...localUsers[existingIndex], ...userObj };
  } else {
    localUsers.push(userObj);
  }
  setLocalUsers(localUsers);
  setCurrentUser(userObj);

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
export const savePaper = async (paper: Paper): Promise<void> => {
  const now = new Date().toISOString();
  const code = paper.testCode || generateTestCode(paper.category);

  const updatedPaper: Paper = {
    ...paper,
    testCode: code,
    updatedAt: now,
  };

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
  }

  // Auto-sync to Telegram Quizzes store so the code is always live!
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
    saveTelegramQuiz(tQuiz);
  }

  const localUsers = getLocalUsers();
  const userIdx = localUsers.findIndex(u => u.id === paper.userId);
  if (userIdx >= 0) {
    const userPapers = localPapers.filter(p => p.userId === paper.userId);
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

      const userRef = doc(db, "users", paper.userId);
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

export const fetchCommunityPapers = async (): Promise<Paper[]> => {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/papers", { cache: "no-store" });
    const data = await res.json();
    if (data.ok && Array.isArray(data.papers)) {
      return data.papers;
    }
  } catch (e) {
    console.warn("Could not fetch community papers:", e);
  }
  return [];
};

export const subscribeUserPapers = (
  userId: string,
  callback: (papers: Paper[]) => void
): (() => void) => {
  const notify = () => {
    const updated = getLocalPapers().filter((p) => p.userId === userId);
    callback(updated);
  };

  notify();

  const { db } = initFirebase();
  let unsubscribeFirestore: (() => void) | null = null;

  if (db) {
    try {
      const q = query(collection(db, "papers"), where("userId", "==", userId));
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const cloudPapers: Paper[] = [];
          snapshot.forEach((doc) => {
            cloudPapers.push(doc.data() as Paper);
          });
          cloudPapers.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );

          const currentLocal = getLocalPapers();
          const otherPapers = currentLocal.filter((p) => p.userId !== userId);
          setLocalPapers([...cloudPapers, ...otherPapers]);

          callback(cloudPapers);
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
    if (unsubscribeFirestore) unsubscribeFirestore();
    broadcastChannel?.removeEventListener("message", handleMessage);
    if (typeof window !== "undefined") {
      window.removeEventListener("mcq_papers_updated", handleLocalEvent);
    }
  };
};

export const subscribeAllPapers = (callback: (papers: Paper[]) => void): (() => void) => {
  callback(getLocalPapers());

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
        setLocalPapers(cloudPapers);
        callback(cloudPapers);
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
    if (unsubscribeFirestore) unsubscribeFirestore();
    broadcastChannel?.removeEventListener("message", handleMessage);
  };
};

export const subscribeAllUsers = (callback: (users: UserProfile[]) => void): (() => void) => {
  callback(getLocalUsers());

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
        setLocalUsers(cloudUsers);
        callback(cloudUsers);
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

