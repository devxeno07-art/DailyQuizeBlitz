export interface UserProfile {
  id: string; // Phone number normalized
  phoneNumber: string;
  name: string;
  createdAt: string;
  lastActive: string;
  hasLibraryAccess?: boolean; // Granted only by Admin from hidden admin portal
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

export interface SourcePaper {
  id: string;
  title: string;
  description?: string;
  pdfUrl: string;
  examName?: string;
  year?: string;
  category: string;
  targetQuestions: number;
  createdAt: string;
}

export interface Paper {
  id: string;
  userId: string; // phone number of author
  userName: string;
  creatorPhone?: string; // phone number or telegram ID of creator
  title: string;
  subject: string;
  category: string; // GSRTC, GPSC, Police, General, etc.
  description?: string;
  targetQuestions?: number;
  timeLimitMinutes?: number;
  isPublic?: boolean;
  testCode?: string; // Persistent unique code like "GSRTC-4821" to run this specific test in Telegram groups
  sourcePaperId?: string;
  sourcePdfUrl?: string;
  isDigitizedCompleted?: boolean;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface TelegramQuiz {
  code: string; // e.g. "GSRTC-8492"
  paperId: string;
  title: string;
  subject: string;
  timePerQuestion: number; // in seconds, e.g. 30
  questions: Question[];
  createdBy: string;
  creatorPhone: string;
  createdAt: string;
}

export interface TelegramBotConfig {
  botToken: string;
  botUsername: string; // without @, e.g. "GsrtcMockQuizBot"
  adminTelegramId?: string; // Numeric ID (e.g. "123456789") or @username of the admin to manage bot directly from Telegram
  webAppUrl?: string; // Custom HTTPS Mini App URL (e.g. https://your-app.vercel.app)
  defaultTimePerQuestion?: number; // e.g. 30
  targetGroupId?: string; // e.g. "@gsrtc_discussion" or chat ID "-100xxxx"
  webhookUrl?: string;
  webhookSecret?: string; // Telegram X-Telegram-Bot-Api-Secret-Token
  pollDelayMs?: number; // delay between consecutive poll messages
}

export interface ScheduledDailyTest {
  id: string;
  title: string;
  mode: 'all_mixed' | 'subject_wise' | 'specific_test';
  subject?: string;
  specificTestCode?: string; // e.g. "TEST-1062"
  specificPaperId?: string;
  shuffleQuestions?: boolean; // true = random shuffle, false = sequential from Q1
  questionCount: number;
  timePerQuestion: number;
  scheduledTime: string; // e.g. "21:00" (Asia/Kolkata)
  isActive: boolean;
  targetGroupId?: string;
  lastRunAt?: string;
  lastRunDay?: string; // YYYY-MM-DD in Asia/Kolkata, prevents duplicate runs
  lastGeneratedCode?: string;
  createdAt: string;
}

export interface TestAttemptResult {
  id: string;
  testCode: string;
  paperId: string;
  paperTitle: string;
  subject: string;
  studentName: string;
  studentPhone: string;
  score: number;
  totalQuestions: number;
  wrongCount: number;
  percentage: number;
  grade: string;
  completedAt: string;
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

// ==========================================
// Telegram live quiz sessions (real results)
// ==========================================

export interface TelegramPollRecord {
  pollId: string;
  questionIndex: number;
  questionId?: string;
  correctOptionId: number;
  chatId: number;
  messageId?: number;
  sentAt: string;
}

export interface TelegramParticipantAnswer {
  optionId: number; // -1 when the answer was retracted
  answeredAt: string;
}

export interface TelegramParticipant {
  userId: string;
  name: string;
  username?: string;
  answers: Record<string, TelegramParticipantAnswer>; // pollId -> answer
  score: number;
  wrong: number;
  answeredCount: number;
  joinedAt: string;
  lastAnsweredAt: string;
}

export interface TelegramQuizSession {
  id: string; // `${code}@${chatId}`
  code: string;
  chatId: number;
  chatTitle?: string;
  quiz: TelegramQuiz; // snapshot of the quiz at launch time
  status: "active" | "completed" | "stopped" | "error";
  startedAt: string;
  startedBy: {
    id: string;
    name: string;
    username?: string;
  };
  polls: TelegramPollRecord[];
  participants: Record<string, TelegramParticipant>;
  finalizeAt?: string;
  leaderboardSentAt?: string;
  error?: string;
}

export interface ServerOverviewStats {
  quizzes: number;
  totalQuizQuestions: number;
  sessions: number;
  activeSessions: number;
  participants: number;
  attempts: number;
  averagePercentage: number;
  schedules: number;
  storageMode: "redis" | "file" | "memory";
  webhookConfigured: boolean;
}
