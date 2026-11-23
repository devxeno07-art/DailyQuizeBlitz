import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { 
  getFirestore, 
  Firestore, 
  enableIndexedDbPersistence,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { FirebaseConfig } from "@/types";

const defaultEnvConfig: Partial<FirebaseConfig> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const getStoredFirebaseConfig = (): FirebaseConfig | null => {
  if (typeof window === "undefined") return null;
  try {
    const custom = localStorage.getItem("mcq_firebase_custom_config");
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed.projectId && parsed.apiKey) {
        return parsed as FirebaseConfig;
      }
    }
  } catch (e) {
    console.warn("Could not read custom Firebase config from localStorage", e);
  }

  if (defaultEnvConfig.projectId && defaultEnvConfig.apiKey) {
    return defaultEnvConfig as FirebaseConfig;
  }
  return null;
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export const initFirebase = (): { app: FirebaseApp | null; db: Firestore | null } => {
  if (db && app) return { app, db };
  
  const config = getStoredFirebaseConfig();
  if (!config) {
    return { app: null, db: null };
  }

  try {
    if (getApps().length === 0) {
      app = initializeApp(config);
      // Initialize with offline persistence to ensure zero progress loss
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      } catch (err) {
        // Fallback for environments where multiple tab manager might fail
        db = getFirestore(app);
      }
    } else {
      app = getApp();
      db = getFirestore(app);
    }
    return { app, db };
  } catch (err) {
    console.error("Firebase init failed:", err);
    return { app: null, db: null };
  }
};
