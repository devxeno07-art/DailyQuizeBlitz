import { Paper, UserProfile, Question, SourcePaper, TelegramQuiz, TelegramBotConfig } from "@/types";
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

// Telegram Bot Config
export const getTelegramBotConfig = (): TelegramBotConfig => {
  if (typeof window === "undefined") {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN || "",
      botUsername: process.env.TELEGRAM_BOT_USERNAME || "GsrtcMockQuizBot",
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_BOT_CONFIG);
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  return {
    botToken: process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || "",
    botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "GsrtcMockQuizBot",
  };
};

export const setTelegramBotConfig = (cfg: TelegramBotConfig): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_TELEGRAM_BOT_CONFIG, JSON.stringify(cfg));
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

export const deletePaper = async (paperId: string): Promise<void> => {
  const localPapers = getLocalPapers();
  const filtered = localPapers.filter(p => p.id !== paperId);
  setLocalPapers(filtered);

  if (typeof window !== "undefined") {
    localStorage.removeItem(`mcq_draft_${paperId}`);
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

export const subscribeUserPapers = (
  userId: string, 
  callback: (papers: Paper[]) => void
): (() => void) => {
  const initialLocal = getLocalPapers().filter(p => p.userId === userId);
  callback(initialLocal);

  const { db } = initFirebase();
  let unsubscribeFirestore: (() => void) | null = null;

  if (db) {
    try {
      const q = query(collection(db, "papers"), where("userId", "==", userId));
      unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        const cloudPapers: Paper[] = [];
        snapshot.forEach((doc) => {
          cloudPapers.push(doc.data() as Paper);
        });
        cloudPapers.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        
        const currentLocal = getLocalPapers();
        const otherPapers = currentLocal.filter(p => p.userId !== userId);
        setLocalPapers([...cloudPapers, ...otherPapers]);

        callback(cloudPapers);
      }, (error) => {
        console.warn("Firestore subscription error, using local:", error);
      });
    } catch (err) {
      console.warn("Error setting up firestore listener:", err);
    }
  }

  const handleMessage = (e: MessageEvent) => {
    if (e.data?.type === "PAPERS_UPDATED") {
      const updated = getLocalPapers().filter(p => p.userId === userId);
      callback(updated);
    }
  };

  broadcastChannel?.addEventListener("message", handleMessage);

  return () => {
    if (unsubscribeFirestore) unsubscribeFirestore();
    broadcastChannel?.removeEventListener("message", handleMessage);
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
