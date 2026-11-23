"use client";

import React, { useState, useEffect } from "react";
import { 
  UserProfile, 
  Paper, 
  FirebaseConfig, 
  SourcePaper, 
  TelegramQuiz, 
  TelegramBotConfig, 
  ScheduledDailyTest 
} from "@/types";
import { 
  subscribeAllUsers, 
  subscribeAllPapers, 
  getLocalUsers, 
  getLocalPapers,
  getLocalSourcePapers,
  addOrUpdateSourcePaper,
  toggleUserLibraryAccess,
  getTelegramBotConfig,
  setTelegramBotConfig,
  getLocalScheduledTests,
  saveScheduledDailyTest,
  deleteScheduledDailyTest,
  dispatchScheduledDailyTest
} from "@/lib/storage";
import { getStoredFirebaseConfig, initFirebase } from "@/lib/firebase";
import { 
  ShieldCheck, 
  Users, 
  FileText, 
  Layers, 
  Search, 
  Lock, 
  Eye, 
  X, 
  CheckCircle2, 
  Clock, 
  Cloud, 
  Database, 
  Settings, 
  ArrowLeft,
  Download,
  Phone,
  Sparkles,
  FileDown,
  Plus,
  ExternalLink,
  BookOpen,
  Calendar,
  Bot,
  Play,
  Send,
  Trash2,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  Radio
} from "lucide-react";

interface AdminPanelProps {
  isOpen?: boolean;
  standalone?: boolean;
  onClose?: () => void;
  onInspectPaper?: (paper: Paper) => void;
}

const DEFAULT_ADMIN_PIN = "7777";

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen = true,
  standalone = false,
  onClose,
  onInspectPaper,
}) => {
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "digitization" | "scheduler" | "bot_config">("users");

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [sourcePapers, setSourcePapers] = useState<SourcePaper[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Bot Config State
  const [botConfig, setBotConfig] = useState<TelegramBotConfig>(() => getTelegramBotConfig());
  const [botConfigSaved, setBotConfigSaved] = useState(false);
  const [testingBot, setTestingBot] = useState(false);
  const [botTestResult, setBotTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Daily Scheduler State
  const [scheduledTests, setScheduledTests] = useState<ScheduledDailyTest[]>([]);
  const [schedTitle, setSchedTitle] = useState("ડેઇલી મેગા મોક ટેસ્ટ - GSRTC");
  const [schedMode, setSchedMode] = useState<"all_mixed" | "subject_wise">("all_mixed");
  const [schedSubject, setSchedSubject] = useState("");
  const [schedQuestionCount, setSchedQuestionCount] = useState(50);
  const [schedTimePerQ, setSchedTimePerQ] = useState(30);
  const [schedDailyTime, setSchedDailyTime] = useState("21:00");
  const [schedTargetGroup, setSchedTargetGroup] = useState("");
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [lastDispatchedQuiz, setLastDispatchedQuiz] = useState<TelegramQuiz | null>(null);
  const [copiedDispatchedCode, setCopiedDispatchedCode] = useState(false);

  // Add Source Paper Form Modal
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceTarget, setNewSourceTarget] = useState(100);
  const [newSourceExam, setNewSourceExam] = useState("GSRTC સ્પેશિયલ");

  // Cloud Config Modal inside Admin
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customConfig, setCustomConfig] = useState<Partial<FirebaseConfig>>(() => {
    const stored = getStoredFirebaseConfig();
    return stored || {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    };
  });
  const [configSaved, setConfigSaved] = useState(false);

  // Load users, papers, source papers, scheduler & bot config
  useEffect(() => {
    if (!isAuthenticated) return;

    setSourcePapers(getLocalSourcePapers());
    setScheduledTests(getLocalScheduledTests());
    setBotConfig(getTelegramBotConfig());

    const unsubUsers = subscribeAllUsers((updatedUsers) => {
      setUsers(updatedUsers);
    });

    const unsubPapers = subscribeAllPapers((updatedPapers) => {
      setAllPapers(updatedPapers);
    });

    return () => {
      unsubUsers();
      unsubPapers();
    };
  }, [isAuthenticated]);

  if (!isOpen && !standalone) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === DEFAULT_ADMIN_PIN || pin === "admin") {
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("ખોટો PIN! ડિફોલ્ટ PIN '7777' છે.");
    }
  };

  const totalQuestions = allPapers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);

  const usersWithCounts = users.map((u) => {
    const userPapers = allPapers.filter((p) => p.userId === u.id);
    const uQuestions = userPapers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
    return {
      ...u,
      papersCount: userPapers.length,
      questionsCount: uQuestions,
    };
  });

  const filteredUsers = usersWithCounts.filter((u) =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.phoneNumber.includes(userSearch)
  );

  const selectedUserPapers = selectedUser
    ? allPapers.filter((p) => p.userId === selectedUser.id)
    : [];

  const handleCreateSourcePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle || !newSourceUrl) return;

    const newSp: SourcePaper = {
      id: `source_paper_${Date.now()}`,
      title: newSourceTitle.trim(),
      pdfUrl: newSourceUrl.trim(),
      examName: newSourceExam.trim(),
      category: "GSRTC સ્પેશિયલ",
      targetQuestions: Number(newSourceTarget) || 100,
      createdAt: new Date().toISOString(),
    };

    await addOrUpdateSourcePaper(newSp);
    setSourcePapers(getLocalSourcePapers());
    setShowAddSourceModal(false);
    setNewSourceTitle("");
    setNewSourceUrl("");
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("mcq_firebase_custom_config", JSON.stringify(customConfig));
      setConfigSaved(true);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Scheduler & Bot Handlers
  const availableSubjects = Array.from(
    new Set(allPapers.map((p) => (p.subject || p.category || "").trim()).filter(Boolean))
  );

  const getSubjectQuestionCount = (subj: string) => {
    const matching = allPapers.filter(
      (p) =>
        p.subject?.toLowerCase().trim() === subj.toLowerCase().trim() ||
        p.category?.toLowerCase().trim() === subj.toLowerCase().trim()
    );
    return matching.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const newSchedule: ScheduledDailyTest = {
      id: `sched_${Date.now()}`,
      title: schedTitle.trim() || "ડેઇલી મોક ટેસ્ટ",
      mode: schedMode,
      subject: schedMode === "subject_wise" ? (schedSubject || availableSubjects[0] || "સામાન્ય જ્ઞાન") : "બધા વિષયો મિક્સ",
      questionCount: Number(schedQuestionCount) || 50,
      timePerQuestion: Number(schedTimePerQ) || 30,
      scheduledTime: schedDailyTime,
      isActive: true,
      targetGroupId: schedTargetGroup.trim() || botConfig.targetGroupId || "",
      createdAt: new Date().toISOString(),
    };
    await saveScheduledDailyTest(newSchedule);
    setScheduledTests(getLocalScheduledTests());
    alert("ડેઇલી ટેસ્ટ શેડ્યુલ સફળતાપૂર્વક સેવ થયું!");
  };

  const handleDispatchNow = async (scheduleId: string) => {
    setDispatchingId(scheduleId);
    try {
      const quiz = await dispatchScheduledDailyTest(scheduleId);
      if (quiz) {
        setLastDispatchedQuiz(quiz);
        setScheduledTests(getLocalScheduledTests());
      } else {
        alert("પસંદ કરેલ કેટેગરીમાં પૂરતા પ્રશ્નો ઉપલબ્ધ નથી.");
      }
    } catch (e) {
      alert("ટેસ્ટ મોકલવામાં કોઈ ક્ષતિ થઈ.");
    } finally {
      setDispatchingId(null);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (confirm("શું તમે આ ડેઇલી ટેસ્ટ શેડ્યુલ કાઢી નાખવા માંગો છો?")) {
      await deleteScheduledDailyTest(id);
      setScheduledTests(getLocalScheduledTests());
    }
  };

  const handleToggleScheduleActive = async (s: ScheduledDailyTest) => {
    const updated = { ...s, isActive: !s.isActive };
    await saveScheduledDailyTest(updated);
    setScheduledTests(getLocalScheduledTests());
  };

  const handleSaveBotConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramBotConfig(botConfig);
    setBotConfigSaved(true);
    setTimeout(() => setBotConfigSaved(false), 2500);
  };

  const handleTestBotConnection = async () => {
    if (!botConfig.botToken) {
      setBotTestResult({ ok: false, message: "કૃપા કરીને પહેલા બોટ ટોકન નાખો." });
      return;
    }
    setTestingBot(true);
    setBotTestResult(null);
    try {
      const res = await fetch(`https://api.telegram.org/bot${botConfig.botToken}/getMe`);
      const data = await res.json();
      if (data.ok && data.result) {
        setBotTestResult({
          ok: true,
          message: `કનેક્શન સફળ! બોટ યુઝરનેમ: @${data.result.username} (${data.result.first_name})`,
        });
        if (!botConfig.botUsername && data.result.username) {
          const updated = { ...botConfig, botUsername: data.result.username };
          setBotConfig(updated);
          setTelegramBotConfig(updated);
        }
      } else {
        setBotTestResult({
          ok: false,
          message: `કનેક્શન નિષ્ફળ: ${data.description || "અમાન્ય બોટ ટોકન"}`,
        });
      }
    } catch (e) {
      setBotTestResult({
        ok: false,
        message: "નેટવર્ક એરર: ટેલિગ્રામ સર્વર સાથે કનેક્ટ થઈ શક્યું નથી.",
      });
    } finally {
      setTestingBot(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("gu-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const wrapperClass = standalone
    ? "min-h-screen bg-slate-900 p-2 sm:p-6 flex flex-col items-center justify-start"
    : "fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn";

  const containerClass = standalone
    ? "w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto min-h-[88vh]"
    : "w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[94vh] flex flex-col";

  return (
    <div className={wrapperClass}>
      <div className={containerClass}>
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-brand-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">એડમિન પેનલ (Admin Control Center)</h3>
              <p className="text-[11px] text-slate-400">
                યુઝર્સ ટ્રેકિંગ અને ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન મોનિટરિંગ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isAuthenticated && (
              <button
                onClick={() => setShowConfigModal(true)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                title="Cloud Database Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {standalone ? (
              <a
                href="/"
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-bold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>મુખ્ય પેજ</span>
              </a>
            ) : (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/20 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Auth Gate if not logged in */}
        {!isAuthenticated ? (
          <div className="p-8 max-w-sm mx-auto text-center space-y-4 my-auto">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-lg">Admin સુરક્ષા પિન</h4>
              <p className="text-xs text-slate-500 mt-1">
                એડમિન કંટ્રોલ સેન્ટર ખોલવા માટે સુરક્ષા PIN દાખલ કરો. (Default: <strong>7777</strong>)
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN (દા.ત. 7777)"
                className="w-full text-center text-xl font-mono tracking-widest px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
              {authError && (
                <div className="text-xs text-rose-600 font-medium">{authError}</div>
              )}
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 transition-all"
              >
                અનલોક કરો (Unlock)
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Admin View */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Live Analytics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-4 rounded-2xl border border-indigo-200/60">
                <div className="flex items-center justify-between text-indigo-700">
                  <span className="text-xs font-bold">કુલ યુઝર્સ</span>
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{users.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">સક્રિય એકાઉન્ટ્સ</div>
              </div>

              <div className="bg-gradient-to-br from-brand-50 to-brand-100/50 p-4 rounded-2xl border border-brand-200/60">
                <div className="flex items-center justify-between text-brand-700">
                  <span className="text-xs font-bold">ડિજિટલ પેપર્સ</span>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{allPapers.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">બનાવેલ પ્રોજેક્ટ્સ</div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 rounded-2xl border border-emerald-200/60">
                <div className="flex items-center justify-between text-emerald-700">
                  <span className="text-xs font-bold">કુલ MCQs</span>
                  <Layers className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalQuestions}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">ડિજિટલ પ્રશ્નો</div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 rounded-2xl border border-amber-200/60">
                <div className="flex items-center justify-between text-amber-700">
                  <span className="text-xs font-bold">ઓલ્ડ PDF પેપર્સ</span>
                  <FileDown className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{sourcePapers.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Google Drive સોર્સ</div>
              </div>
            </div>

            {/* Admin Tabs */}
            <div className="flex border-b border-slate-200 space-x-2 sm:space-x-4 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab("users")}
                className={`pb-2.5 text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === "users"
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>યુઝર્સ & પેપર્સ ({users.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("digitization")}
                className={`pb-2.5 text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === "digitization"
                    ? "border-orange-600 text-orange-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <FileDown className="w-4 h-4" />
                <span>ઓલ્ડ પેપર્સ ટ્રેકર ({sourcePapers.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("scheduler")}
                className={`pb-2.5 text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === "scheduler"
                    ? "border-purple-600 text-purple-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>📅 ડેઇલી મોક ટેસ્ટ શેડ્યુલર</span>
              </button>

              <button
                onClick={() => setActiveTab("bot_config")}
                className={`pb-2.5 text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === "bot_config"
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>🤖 ટેલિગ્રામ બોટ સેટિંગ્સ</span>
              </button>
            </div>

            {/* TAB 1: USERS & PAPERS */}
            {activeTab === "users" && (
              <>
                {selectedUser ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedUser(null)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h4 className="font-bold text-slate-900 text-base">
                            {selectedUser.name} ના પેપર્સ ({selectedUserPapers.length})
                          </h4>
                          <p className="text-xs text-slate-500 font-mono">
                            મોબાઈલ: {selectedUser.phoneNumber}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedUser(null)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >
                        તમામ યુઝર્સ જુઓ
                      </button>
                    </div>

                    {selectedUserPapers.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        આ યુઝરે હજુ સુધી કોઈ પેપર બનાવ્યું નથી.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedUserPapers.map((paper) => (
                          <div
                            key={paper.id}
                            className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-brand-400 transition-all space-y-2"
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                                {paper.category || "General"}
                              </span>
                              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(paper.updatedAt)}
                              </span>
                            </div>
                            <h5 className="font-bold text-slate-900 text-sm">{paper.title}</h5>
                            <p className="text-xs text-slate-500">વિષય: {paper.subject || "-"}</p>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                              <span className="font-bold text-indigo-700">
                                {paper.questions?.length || 0} પ્રશ્નો
                              </span>
                              <button
                                onClick={() => {
                                  onInspectPaper?.(paper);
                                  onClose?.();
                                }}
                                className="px-3 py-1 rounded-lg bg-brand-600 text-white font-bold text-xs hover:bg-brand-700"
                              >
                                પેપર ખોલો
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                        <Users className="w-4 h-4 text-brand-600" />
                        <span>તમામ યુઝર્સનું લિસ્ટ (Registered Users)</span>
                      </h4>

                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="નામ કે નંબરથી શોધો..."
                          className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    {filteredUsers.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        કોઈ યુઝર મળ્યો નથી.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredUsers.map((u) => (
                          <div
                            key={u.id}
                            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                                <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{u.phoneNumber}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto text-xs flex-wrap">
                              <div className="text-left sm:text-right mr-1">
                                <div className="font-bold text-indigo-700">
                                  {u.papersCount || 0} પેપર્સ • {u.questionsCount || 0} પ્રશ્નો
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  છેલ્લે સક્રિય: {formatDate(u.lastActive)}
                                </div>
                              </div>

                              {/* Toggle Library Access */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await toggleUserLibraryAccess(u.id);
                                  setUsers((prev) =>
                                    prev.map((user) =>
                                      user.id === u.id ? { ...user, hasLibraryAccess: !user.hasLibraryAccess } : user
                                    )
                                  );
                                }}
                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all ${
                                  u.hasLibraryAccess
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200"
                                }`}
                                title={
                                  u.hasLibraryAccess
                                    ? "ઓરિજિનલ પેપર્સ લાઇબ્રેરી મંજૂર છે (ક્લિક કરી રદ કરો)"
                                    : "ઓરિજિનલ પેપર્સ લાઇબ્રેરી એક્સેસ આપો"
                                }
                              >
                                {u.hasLibraryAccess ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>લાઇબ્રેરી મંજૂર (Active)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                    <span>લાઇબ્રેરી આપો (Grant)</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => setSelectedUser(u)}
                                className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 font-bold text-xs shadow-sm flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>પેપર્સ જુઓ</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* TAB 2: DIGITIZATION MISSION TRACKER */}
            {activeTab === "digitization" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">
                      ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન પ્રોગ્રેસ
                    </h4>
                    <p className="text-xs text-slate-500">
                      કયા ઓલ્ડ પેપર પર કેટલા પ્રશ્નો ડિજિટલ રૂપમાં સેવ થયા છે તેનું લાઈવ સ્ટેટસ
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddSourceModal(true)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ નવી PDF લિંક ઉમેરો</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sourcePapers.map((sp) => {
                    const linked = allPapers.filter((p) => p.sourcePaperId === sp.id);
                    const totalDigitized = linked.reduce(
                      (max, p) => Math.max(max, p.questions?.length || 0),
                      0
                    );
                    const percent = Math.min(100, Math.round((totalDigitized / sp.targetQuestions) * 100));

                    return (
                      <div
                        key={sp.id}
                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <h5 className="font-bold text-slate-900 text-sm">{sp.title}</h5>
                          <a
                            href={sp.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
                          >
                            <span>PDF</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {/* Progress */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-600">
                              ડિજિટલ પ્રશ્નો: {totalDigitized} / {sp.targetQuestions}
                            </span>
                            <span className="font-bold text-orange-600">{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-orange-500 h-full rounded-full"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Contributors list */}
                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                          {linked.length > 0 ? (
                            <div className="space-y-1">
                              <span className="font-bold text-slate-700">ડિજિટાઇઝ કરી રહેલા યુઝર્સ:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {linked.map((lp) => (
                                  <span
                                    key={lp.id}
                                    onClick={() => {
                                      onInspectPaper?.(lp);
                                      onClose?.();
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-800 cursor-pointer hover:border-brand-500 text-[10px] font-medium"
                                  >
                                    {lp.userName} ({lp.questions?.length || 0} MCQs)
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-amber-700">હજુ સુધી કોઈએ આ પેપર લખવાનું શરૂ નથી કર્યું.</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: DAILY MOCK TEST SCHEDULER */}
            {activeTab === "scheduler" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <span>ડેઇલી મોક ટેસ્ટ શેડ્યુલર (Daily Mock Test Scheduler)</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      રોજ નિયત સમયે આપોઆપ અથવા એક જ ક્લિકમાં તમામ પ્રશ્નોમાંથી મિક્સ કે સ્પેસિફિક વિષય મુજબ મોક ટેસ્ટ જનરેટ કરી ટેલિગ્રામમાં મોકલો.
                    </p>
                  </div>
                  <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                    કુલ પ્રાપ્ય પ્રશ્નો: <strong>{totalQuestions} MCQs</strong>
                  </div>
                </div>

                {/* Last Dispatched Banner */}
                {lastDispatchedQuiz && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                        🎉 મોક ટેસ્ટ સફળતાપૂર્વક જનરેટ થઈ ગઈ!
                      </span>
                      <button
                        onClick={() => setLastDispatchedQuiz(null)}
                        className="text-white/80 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h5 className="font-bold text-sm sm:text-base">{lastDispatchedQuiz.title}</h5>
                        <p className="text-xs text-emerald-100">
                          વિષય: {lastDispatchedQuiz.subject} • {lastDispatchedQuiz.questions.length} પ્રશ્નો • સમય: {lastDispatchedQuiz.timePerQuestion} સે./પ્રશ્ન
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`/quiz ${lastDispatchedQuiz.code}`);
                            setCopiedDispatchedCode(true);
                            setTimeout(() => setCopiedDispatchedCode(false), 2000);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-white text-emerald-800 font-mono font-bold text-xs shadow-sm flex items-center gap-1.5 hover:bg-emerald-50"
                        >
                          <span>/quiz {lastDispatchedQuiz.code}</span>
                          {copiedDispatchedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Schedule Creation Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-4">
                  <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4 text-purple-600" />
                    <span>નવું ડેઇલી મોક ટેસ્ટ શેડ્યુલ કન્ફિગર કરો</span>
                  </h5>

                  <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Test Title */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          ટેસ્ટનું નામ / શીર્ષક *
                        </label>
                        <input
                          type="text"
                          value={schedTitle}
                          onChange={(e) => setSchedTitle(e.target.value)}
                          placeholder="દા.ત. ડેઇલી મેગા મોક ટેસ્ટ - GSRTC"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>

                      {/* Daily Time */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          રોજ મોકલવાનો સમય (Daily Scheduled Time) *
                        </label>
                        <input
                          type="time"
                          value={schedDailyTime}
                          onChange={(e) => setSchedDailyTime(e.target.value)}
                          required
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* Mode Selection */}
                    <div>
                      <label className="block font-bold text-slate-700 mb-2">
                        પ્રશ્નો પસંદ કરવાનો મોડ (Question Source Mode) *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                            schedMode === "all_mixed"
                              ? "bg-purple-50 border-purple-400 ring-2 ring-purple-400/30 text-purple-950 font-semibold"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="sched_mode"
                            checked={schedMode === "all_mixed"}
                            onChange={() => setSchedMode("all_mixed")}
                            className="mt-1 accent-purple-600"
                          />
                          <div>
                            <div className="font-bold text-xs sm:text-sm">🎲 બધા જ પ્રશ્નોમાંથી મિક્સ (All Questions Mix)</div>
                            <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                              સિસ્ટમમાં બનેલા તમામ ડિજિટલ પેપર્સમાંથી રેન્ડમ રીતે પ્રશ્નો પસંદ કરીને ટેસ્ટ તૈયાર કરશે. (પૂલ: {totalQuestions} પ્રશ્નો)
                            </div>
                          </div>
                        </label>

                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                            schedMode === "subject_wise"
                              ? "bg-purple-50 border-purple-400 ring-2 ring-purple-400/30 text-purple-950 font-semibold"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="sched_mode"
                            checked={schedMode === "subject_wise"}
                            onChange={() => setSchedMode("subject_wise")}
                            className="mt-1 accent-purple-600"
                          />
                          <div>
                            <div className="font-bold text-xs sm:text-sm">📚 વિષય વાઇઝ (Subject-Wise)</div>
                            <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                              કોઈ ચોક્કસ વિષય (દા.ત. ગુજરાતી વ્યાકરણ, GSRTC સ્પેશિયલ, કાયદો)માંથી જ પ્રશ્નો મોકલશે.
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Subject Dropdown (if subject_wise) */}
                    {schedMode === "subject_wise" && (
                      <div className="p-3.5 bg-white rounded-2xl border border-purple-200 space-y-1.5">
                        <label className="block font-bold text-purple-950">
                          કયા વિષયની મોક ટેસ્ટ રાખવી છે? *
                        </label>
                        {availableSubjects.length === 0 ? (
                          <p className="text-slate-400 text-xs italic">
                            કોઈ વિષય મળ્યો નથી. ડિજિટલ પેપર્સ બનાવતી વખતે વિષય દાખલ કરો.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {availableSubjects.map((subj) => {
                              const qCount = getSubjectQuestionCount(subj);
                              const isSelected = schedSubject === subj || (!schedSubject && subj === availableSubjects[0]);
                              return (
                                <button
                                  type="button"
                                  key={subj}
                                  onClick={() => setSchedSubject(subj)}
                                  className={`p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? "bg-purple-100 border-purple-500 text-purple-950 font-bold shadow-xs"
                                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  <div className="truncate text-xs">{subj}</div>
                                  <div className="text-[10px] text-purple-700 font-mono mt-0.5">
                                    {qCount} MCQs પ્રાપ્ય
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Questions Count */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          ટેસ્ટમાં કેટલા પ્રશ્નો રાખવા?
                        </label>
                        <select
                          value={schedQuestionCount}
                          onChange={(e) => setSchedQuestionCount(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                        >
                          <option value={10}>૧૦ પ્રશ્નો (Quick Quiz)</option>
                          <option value={20}>૨૦ પ્રશ્નો</option>
                          <option value={30}>૩૦ પ્રશ્નો</option>
                          <option value={50}>૫૦ પ્રશ્નો (Standard)</option>
                          <option value={60}>૬૦ પ્રશ્નો (Duo/Grammar)</option>
                          <option value={100}>૧૦૦ પ્રશ્નો (Mega Mock)</option>
                        </select>
                      </div>

                      {/* Time per Question */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          પ્રશ્ન દીઠ સમય
                        </label>
                        <select
                          value={schedTimePerQ}
                          onChange={(e) => setSchedTimePerQ(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                        >
                          <option value={15}>૧૫ સેકન્ડ (Fast)</option>
                          <option value={30}>૩૦ સેકન્ડ (Standard)</option>
                          <option value={45}>૪૫ સેકન્ડ</option>
                          <option value={60}>૬૦ સેકન્ડ (Detailed)</option>
                        </select>
                      </div>

                      {/* Target Group */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Telegram ગ્રૂપ / ચેનલ ID (વૈકલ્પિક)
                        </label>
                        <input
                          type="text"
                          value={schedTargetGroup}
                          onChange={(e) => setSchedTargetGroup(e.target.value)}
                          placeholder={botConfig.targetGroupId || "@gsrtc_group"}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 flex items-center gap-1.5 transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>શેડ્યુલ સેવ કરો (Save Daily Schedule)</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Existing Schedules Table */}
                <div className="space-y-3">
                  <h5 className="font-bold text-slate-900 text-sm">
                    હાલના સક્રિય શેડ્યુલ્સ ({scheduledTests.length})
                  </h5>

                  {scheduledTests.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                      હજુ સુધી કોઈ ડેઇલી શેડ્યુલ કન્ફિગર કરેલ નથી. ઉપરના ફોર્મ વડે નવું શેડ્યુલ ઉમેરો.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {scheduledTests.map((s) => (
                        <div
                          key={s.id}
                          className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{s.title}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  s.mode === "subject_wise"
                                    ? "bg-indigo-100 text-indigo-800"
                                    : "bg-purple-100 text-purple-800"
                                }`}
                              >
                                {s.mode === "subject_wise" ? `વિષય: ${s.subject}` : "બધા પ્રશ્નો મિક્સ"}
                              </span>
                              <span
                                onClick={() => handleToggleScheduleActive(s)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${
                                  s.isActive
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {s.isActive ? "● સક્રિય (Daily Active)" : "○ થોભાવેલ (Paused)"}
                              </span>
                            </div>

                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                              <span>⏰ સમય: <strong>રોજ {s.scheduledTime} વાગ્યે</strong></span>
                              <span>•</span>
                              <span>📊 <strong>{s.questionCount} MCQs</strong></span>
                              <span>•</span>
                              <span>⏱ <strong>{s.timePerQuestion} સે./પ્રશ્ન</strong></span>
                              {s.lastGeneratedCode && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-purple-700 font-bold">
                                    છેલ્લો કોડ: {s.lastGeneratedCode}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button
                              onClick={() => handleDispatchNow(s.id)}
                              disabled={dispatchingId === s.id}
                              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{dispatchingId === s.id ? "મોકલાઈ રહ્યું છે..." : "હમણાં જ ક્વિઝ મોકલો"}</span>
                            </button>

                            <button
                              onClick={() => handleDeleteSchedule(s.id)}
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200"
                              title="ડિલીટ કરો"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: TELEGRAM BOT SETTINGS */}
            {activeTab === "bot_config" && (
              <div className="max-w-2xl space-y-6">
                <div>
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <Bot className="w-5 h-5 text-sky-600" />
                    <span>ટેલિગ્રામ બોટ કન્ફિગરેશન (Telegram Bot Settings)</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    તમારા ટેલિગ્રામ બોટનું ટોકન અને યુઝરનેમ અહીં કન્ફિગર કરો જેથી ગ્રૂપમાં સીધા જ મોક ટેસ્ટ અને લીડરબોર્ડ પરિણામો મોકલી શકાય.
                  </p>
                </div>

                {botConfigSaved && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>બોટ સેટિંગ્સ સફળતાપૂર્વક સેવ થઈ ગયા છે!</span>
                  </div>
                )}

                {botTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 animate-fadeIn ${
                      botTestResult.ok
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-rose-50 border-rose-300 text-rose-800"
                    }`}
                  >
                    {botTestResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                    <span>{botTestResult.message}</span>
                  </div>
                )}

                <form onSubmit={handleSaveBotConfig} className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Telegram Bot Token (BotFather પાસેથી મળેલ) *
                    </label>
                    <input
                      type="password"
                      value={botConfig.botToken}
                      onChange={(e) => setBotConfig({ ...botConfig, botToken: e.target.value })}
                      placeholder="દા.ત. 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      જો બોટ ન હોય, તો ટેલિગ્રામમાં <strong>@BotFather</strong> ને <code>/newbot</code> કમાન્ડ આપીને મિનિટોમાં બોટ ટોકન મેળવો.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Bot Username (@ વગર)
                      </label>
                      <input
                        type="text"
                        value={botConfig.botUsername}
                        onChange={(e) => setBotConfig({ ...botConfig, botUsername: e.target.value.replace(/^@/, "") })}
                        placeholder="દા.ત. GsrtcMockQuizBot"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        ડિફોલ્ટ સમય (સેકન્ડ પ્રતિ પ્રશ્ન)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={300}
                        value={botConfig.defaultTimePerQuestion || 30}
                        onChange={(e) => setBotConfig({ ...botConfig, defaultTimePerQuestion: Number(e.target.value) })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      ડિફોલ્ટ ટેલિગ્રામ ગ્રૂપ અથવા ચેનલ Username / Chat ID
                    </label>
                    <input
                      type="text"
                      value={botConfig.targetGroupId || ""}
                      onChange={(e) => setBotConfig({ ...botConfig, targetGroupId: e.target.value })}
                      placeholder="@gsrtc_discussion_group અથવા -100xxxxxxxxxx"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      ડેઇલી મોક ટેસ્ટ શેડ્યુલર સીધા જ આ ગ્રૂપમાં ટેસ્ટ નોટિફિકેશન મોકલશે.
                    </p>
                  </div>

                  {/* Webhook helper */}
                  <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-1.5">
                    <span className="font-bold text-sky-950 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                      <span>વેબહૂક URL (Webhook Endpoint)</span>
                    </span>
                    <p className="text-[11px] text-slate-600">
                      ગ્રૂપમાં <code>/quiz CODE</code> અથવા <code>/results CODE</code> કમાન્ડ્સ આપવા માટે આ વેબહૂક URL સેટ કરી શકો છો:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-sky-200 font-mono text-slate-800 flex-1 truncate">
                        {typeof window !== "undefined" ? `${window.location.origin}/api/telegram/webhook` : "/api/telegram/webhook"}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/api/telegram/webhook`;
                          navigator.clipboard.writeText(url);
                          alert("Webhook URL કોપી થઈ ગઈ!");
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-[11px]"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleTestBotConnection}
                      disabled={testingBot}
                      className="px-4 py-2.5 rounded-xl border border-sky-300 bg-white hover:bg-sky-50 text-sky-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingBot ? "animate-spin" : ""}`} />
                      <span>{testingBot ? "ચકાસી રહ્યું છે..." : "બોટ કનેક્શન ટેસ્ટ કરો"}</span>
                    </button>

                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      <span>બોટ સેટિંગ્સ સેવ કરો</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Modal: Add New Source Paper Google Drive Link */}
        {showAddSourceModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm">નવું ઓલ્ડ પેપર (Google Drive Link) ઉમેરો</h4>
                <button
                  onClick={() => setShowAddSourceModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSourcePaper} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">પેપરનું શીર્ષક / નામ *</label>
                  <input
                    type="text"
                    value={newSourceTitle}
                    onChange={(e) => setNewSourceTitle(e.target.value)}
                    placeholder="દા.ત. GSRTC Conductor Exam 2021"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Google Drive PDF લિંક *</label>
                  <input
                    type="url"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">કુલ પ્રશ્નો</label>
                    <input
                      type="number"
                      value={newSourceTarget}
                      onChange={(e) => setNewSourceTarget(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">પરીક્ષા કેટેગરી</label>
                    <input
                      type="text"
                      value={newSourceExam}
                      onChange={(e) => setNewSourceExam(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSourceModal(false)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    રદ કરો
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-700"
                  >
                    લિંક સેવ કરો
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cloud Config Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-brand-600" />
                  <h4 className="font-bold text-slate-900 text-sm">Firebase Cloud સેટિંગ્સ</h4>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Vercel પર ફ્રી હોસ્ટિંગ માટે તમે Firebase Console માંથી ક્રેડેન્શિયલ અહીં પેસ્ટ કરી શકો છો.
              </p>

              <form onSubmit={handleSaveFirebaseConfig} className="space-y-2.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Project ID *</label>
                  <input
                    type="text"
                    value={customConfig.projectId || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, projectId: e.target.value })}
                    placeholder="my-mcq-project"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">API Key *</label>
                  <input
                    type="text"
                    value={customConfig.apiKey || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, apiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Auth Domain</label>
                  <input
                    type="text"
                    value={customConfig.authDomain || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, authDomain: e.target.value })}
                    placeholder="my-mcq-project.firebaseapp.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">App ID</label>
                  <input
                    type="text"
                    value={customConfig.appId || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, appId: e.target.value })}
                    placeholder="1:123456789:web:abcdef..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                {configSaved && (
                  <div className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                    સેટિંગ્સ સેવ થઈ ગઈ! પેજ રીલોડ થઈ રહ્યું છે...
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    બંધ કરો
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-brand-600 text-white font-bold hover:bg-brand-700"
                  >
                    સેવ કરો અને કનેક્ટ કરો
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
