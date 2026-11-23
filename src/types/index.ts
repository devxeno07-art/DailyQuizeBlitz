export interface UserProfile {
  id: string; // Phone number normalized
  phoneNumber: string;
  name: string;
  createdAt: string;
  lastActive: string;
  papersCount?: number;
  questionsCount?: number;
}

export interface Question {
  id: string;
  paperId: string;
  questionNumber: number;
  questionText: string;
  options: string[]; // typically 4 or 5 options
  correctAnswer: number; // 0 for A, 1 for B, 2 for C, 3 for D, 4 for E
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Paper {
  id: string;
  userId: string; // phone number of author
  userName: string;
  title: string;
  subject: string;
  category: string; // GSRTC, GPSC, Police, General, etc.
  description?: string;
  targetQuestions?: number;
  timeLimitMinutes?: number;
  isPublic?: boolean;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface SyncStatus {
  isOnline: boolean;
  isCloudConnected: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
}
