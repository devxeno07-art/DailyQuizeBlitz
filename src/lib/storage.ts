import { Paper, UserProfile, Question } from "@/types";
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

// Channel for cross-tab realtime sync
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel("mcq_realtime_sync");
  } catch (e) {
    console.warn("BroadcastChannel not supported", e);
  }
}

// Helper to get local data safely
export const getLocalPapers = (): Paper[] => {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_PAPERS);
    return data ? JSON.parse(data) : [];
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

// Current logged in user
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

// Login or register user with just Phone Number & Name (no password!)
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

  // 1. Update local users
  const localUsers = getLocalUsers();
  const existingIndex = localUsers.findIndex(u => u.id === cleanPhone);
  if (existingIndex >= 0) {
    // Preserve initial createdAt, update name if provided and lastActive
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

  // 2. Sync to Firebase if available
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

// Save a Paper (Draft or Completed) with real-time sync
export const savePaper = async (paper: Paper): Promise<void> => {
  const now = new Date().toISOString();
  const updatedPaper: Paper = {
    ...paper,
    updatedAt: now,
  };

  // 1. Save to localStorage immediately (guarantees zero progress loss)
  const localPapers = getLocalPapers();
  const existingIdx = localPapers.findIndex(p => p.id === paper.id);
  if (existingIdx >= 0) {
    localPapers[existingIdx] = updatedPaper;
  } else {
    localPapers.unshift(updatedPaper);
  }
  setLocalPapers(localPapers);

  // Clear temp draft cache once committed
  if (typeof window !== "undefined") {
    localStorage.removeItem(`mcq_draft_${paper.id}`);
  }

  // Update user stats locally
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

  // 2. Realtime sync to Cloud Firestore
  const { db } = initFirebase();
  if (db) {
    try {
      const paperRef = doc(db, "papers", paper.id);
      await setDoc(paperRef, updatedPaper);

      // Also update user summary in Firestore
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

// Delete Paper
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

// Subscribe to real-time papers for a specific user
export const subscribeUserPapers = (
  userId: string, 
  callback: (papers: Paper[]) => void
): (() => void) => {
  // Initial local dispatch
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
        // Sort newest first
        cloudPapers.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        
        // Merge cloud papers into local papers so offline works flawlessly
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

  // Cross-tab broadcast listener
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

// Admin: Subscribe to ALL papers
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

// Admin: Subscribe to ALL users
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

// Save temporary draft to avoid progress loss while typing
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
