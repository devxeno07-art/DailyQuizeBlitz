"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  UserProfile, 
  Paper, 
  FirebaseConfig, 
  SourcePaper, 
  TelegramQuiz, 
  TelegramBotConfig, 
  ScheduledDailyTest,
  ServerOverviewStats,
  PaperSetDispatchRecord
} from "@/types";
import { divideQuestionsIntoSets, QuestionSet } from "@/lib/testSets";
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
  dispatchScheduledDailyTest,
  fetchServerScheduledTests
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
  Radio,
  LogOut,
  Webhook,
  Server,
  Key,
  Shuffle,
  ListOrdered,
  Edit3,
  RotateCcw
} from "lucide-react";

interface AdminPanelProps {
  isOpen?: boolean;
  standalone?: boolean;
  onClose?: () => void;
  onInspectPaper?: (paper: Paper) => void;
}

const PIN_MAX_LENGTH = 64;

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen = true,
  standalone = false,
  onClose,
  onInspectPaper,
}) => {
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "digitization" | "scheduler" | "bot_config" | "database">("users");

  // Supabase State
  const [supabaseData, setSupabaseData] = useState<{
    connected?: boolean;
    tableExists?: boolean;
    hasPinInSupabase?: boolean;
    supabaseUrl?: string;
    latencyMs?: number;
    error?: string;
    setupSql?: string;
    currentPin?: string | null;
  } | null>(null);
  const [loadingSupabase, setLoadingSupabase] = useState(false);
  const [newSupabasePin, setNewSupabasePin] = useState("");
  const [savingSupabasePin, setSavingSupabasePin] = useState(false);
  const [supabasePinSuccess, setSupabasePinSuccess] = useState<string | null>(null);
  const [supabasePinError, setSupabasePinError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const fetchSupabaseStatus = async () => {
    setLoadingSupabase(true);
    setSupabasePinSuccess(null);
    setSupabasePinError(null);
    try {
      const res = await fetch("/api/admin/supabase-status", { cache: "no-store" });
      const data = await res.json();
      setSupabaseData(data);
    } catch (err: any) {
      setSupabaseData({ connected: false, error: err?.message || "Failed to reach server" });
    } finally {
      setLoadingSupabase(false);
    }
  };

  const handleSaveSupabasePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupabasePin.trim()) return;
    setSavingSupabasePin(true);
    setSupabasePinSuccess(null);
    setSupabasePinError(null);
    try {
      const res = await fetch("/api/admin/supabase-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newSupabasePin.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setSupabasePinSuccess("નવો Admin Password સફળતાપૂર્વક Supabase માં સેવ થઈ ગયો છે!");
        setNewSupabasePin("");
        fetchSupabaseStatus();
      } else {
        setSupabasePinError(data.error || "Supabase માં પાસવર્ડ સેવ થઈ શક્યો નહીં.");
      }
    } catch (err: any) {
      setSupabasePinError(err?.message || "Network error");
    } finally {
      setSavingSupabasePin(false);
    }
  };

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
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [pollLogs, setPollLogs] = useState<string[]>([]);
  const [settingMenuBtn, setSettingMenuBtn] = useState(false);
  const [menuBtnMsg, setMenuBtnMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [botSaveMsg, setBotSaveMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookBusy, setWebhookBusy] = useState<string | null>(null);
  const [webhookMsg, setWebhookMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [serverStats, setServerStats] = useState<ServerOverviewStats | null>(null);
  const [serverConfigInfo, setServerConfigInfo] = useState({
    hasBotToken: false,
    hasWebhookSecret: false,
  });

  // Daily Scheduler State
  const [scheduledTests, setScheduledTests] = useState<ScheduledDailyTest[]>([]);
  const [schedTitle, setSchedTitle] = useState("ડેઇલી મોક ટેસ્ટ");
  const [schedMode, setSchedMode] = useState<"all_mixed" | "subject_wise" | "specific_test">("specific_test");
  const [schedSubject, setSchedSubject] = useState("");
  const [schedSpecificCode, setSchedSpecificCode] = useState("");
  const [schedShuffle, setSchedShuffle] = useState(true);
  const [schedUseSetProgression, setSchedUseSetProgression] = useState(false);
  const [schedQuestionCount, setSchedQuestionCount] = useState(25);
  const [schedTimePerQ, setSchedTimePerQ] = useState(30);
  const [schedDailyTime, setSchedDailyTime] = useState("21:00");
  const [schedTargetGroup, setSchedTargetGroup] = useState("");
  const [schedReminderMinutes, setSchedReminderMinutes] = useState<number>(60);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [lastDispatchedQuiz, setLastDispatchedQuiz] = useState<TelegramQuiz | null>(null);
  const [copiedDispatchedCode, setCopiedDispatchedCode] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [serverCommunityPapers, setServerCommunityPapers] = useState<Paper[]>([]);
  const [testSearchFilter, setTestSearchFilter] = useState("");

  // Test Set Manager State (Divide large tests like 500 MCQs into 30/40/50 sets & track progress)
  const [setManagerPaper, setSetManagerPaper] = useState<Paper | null>(null);
  const [setManagerSize, setSetManagerSize] = useState<number>(30);
  const [setManagerCustomSize, setSetManagerCustomSize] = useState<string>("30");
  const [setManagerTimePerQ, setSetManagerTimePerQ] = useState<number>(20);
  const [setManagerShuffle, setSetManagerShuffle] = useState<boolean>(false);
  const [setManagerTargetGroup, setSetManagerTargetGroup] = useState<string>("");
  const [setManagerFilter, setSetManagerFilter] = useState<"all" | "pending" | "completed">("all");
  const [paperSetDispatches, setPaperSetDispatches] = useState<PaperSetDispatchRecord[]>([]);
  const [dispatchingSetKey, setDispatchingSetKey] = useState<string | null>(null);

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

  // Verify the HttpOnly admin session cookie on mount.
  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setIsAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setIsAuthChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshServerStats = async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) setIsAuthenticated(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.stats) setServerStats(data.stats);
    } catch (e) {
      // stats are best-effort
    }
  };

  // Load users, papers, source papers, scheduler & bot config
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    setSourcePapers(getLocalSourcePapers());
    setScheduledTests(getLocalScheduledTests());
    setBotConfig(getTelegramBotConfig());

    const loadServerData = async () => {
      try {
        const [cfgRes, statsRes, schedules, papersRes, setsRes] = await Promise.all([
          fetch("/api/telegram/config", { cache: "no-store" }),
          fetch("/api/admin/stats", { cache: "no-store" }),
          fetchServerScheduledTests().catch(() => [] as ScheduledDailyTest[]),
          fetch("/api/papers", { cache: "no-store" }).catch(() => null),
          fetch("/api/papers/sets", { cache: "no-store" }).catch(() => null),
        ]);

        if (!active) return;

        if (setsRes && setsRes.ok) {
          const sData = await setsRes.json().catch(() => ({}));
          if (sData.ok && Array.isArray(sData.records)) {
            setPaperSetDispatches(sData.records);
          }
        }

        if (papersRes && papersRes.ok) {
          const pData = await papersRes.json().catch(() => ({}));
          if (pData.ok && Array.isArray(pData.papers)) {
            setServerCommunityPapers(pData.papers);
          }
        }

        const cfg = await cfgRes.json().catch(() => ({}));
        if (cfgRes.ok && cfg && cfg.botUsername) {
          setServerConfigInfo({
            hasBotToken: Boolean(cfg.hasBotToken),
            hasWebhookSecret: Boolean(cfg.hasWebhookSecret),
          });
          setBotConfig((prev) => ({
            ...prev,
            ...cfg,
            botToken: "",
            webhookSecret: "",
          }));
        } else if (cfgRes.status === 401) {
          setIsAuthenticated(false);
          return;
        }

        if (statsRes.status === 401) {
          setIsAuthenticated(false);
          return;
        }

        const stats = await statsRes.json().catch(() => ({}));
        if (statsRes.ok && stats.stats) setServerStats(stats.stats);

        if (schedules.length > 0) {
          setScheduledTests(schedules);
        } else if (getLocalScheduledTests().length === 0) {
          setScheduledTests([]);
        }
      } catch (e) {
        // Offline/local mode — fall back to local data already loaded
      }
    };

    loadServerData();

    const unsubUsers = subscribeAllUsers((updatedUsers) => {
      setUsers(updatedUsers);
    });

    const unsubPapers = subscribeAllPapers((updatedPapers) => {
      setAllPapers(updatedPapers);
    });

    return () => {
      active = false;
      unsubUsers();
      unsubPapers();
    };
  }, [isAuthenticated]);

  if (!isOpen && !standalone) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setIsAuthenticated(true);
        setPin("");
      } else {
        setAuthError(data.error || "ખોટો Admin PIN.");
      }
    } catch (e) {
      setAuthError("સર્વર સાથે કનેક્ટ થઈ શકાયું નહીં. ફરી પ્રયાસ કરો.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch (e) {}
    setIsAuthenticated(false);
    setPin("");
    setServerStats(null);
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
  const availableTests = useMemo(() => {
    const map = new Map<string, Paper>();
    serverCommunityPapers.forEach((p) => {
      const key = (p.testCode || p.id).toUpperCase();
      map.set(key, p);
    });
    allPapers.forEach((p) => {
      const key = (p.testCode || p.id).toUpperCase();
      const existing = map.get(key);
      if (!existing || (p.questions?.length || 0) >= (existing.questions?.length || 0)) {
        map.set(key, p);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => (b.questions?.length || 0) - (a.questions?.length || 0)
    );
  }, [allPapers, serverCommunityPapers]);

  const availableSubjects = useMemo(() => {
    const all = [...allPapers, ...serverCommunityPapers];
    return Array.from(
      new Set(all.map((p) => (p.subject || p.category || "").trim()).filter(Boolean))
    );
  }, [allPapers, serverCommunityPapers]);

  const getSubjectQuestionCount = (subj: string) => {
    const all = [...allPapers, ...serverCommunityPapers];
    const seen = new Set<string>();
    let count = 0;
    all.forEach((p) => {
      const s = (p.subject || p.category || "").trim().toLowerCase();
      if (s === subj.toLowerCase()) {
        const key = (p.testCode || p.id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          count += p.questions?.length || 0;
        }
      }
    });
    return count;
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedPaper = availableTests.find(
      (t) => (t.testCode || t.id).toUpperCase() === schedSpecificCode.toUpperCase()
    );
    const existingSched = editingScheduleId
      ? scheduledTests.find((s) => s.id === editingScheduleId)
      : undefined;

    const newSchedule: ScheduledDailyTest = {
      id: editingScheduleId || `sched_${Date.now()}`,
      title:
        schedTitle.trim() ||
        (selectedPaper ? `${selectedPaper.title} (Daily)` : "ડેઇલી મોક ટેસ્ટ"),
      mode: schedMode,
      subject:
        schedMode === "subject_wise"
          ? (schedSubject || availableSubjects[0] || "સામાન્ય જ્ઞાન")
          : schedMode === "specific_test"
          ? (selectedPaper?.subject || selectedPaper?.title || "ચોક્કસ ટેસ્ટ")
          : "બધા વિષયો મિક્સ",
      specificTestCode:
        schedMode === "specific_test"
          ? (schedSpecificCode || selectedPaper?.testCode)
          : undefined,
      specificPaperId:
        schedMode === "specific_test" ? selectedPaper?.id : undefined,
      shuffleQuestions: schedShuffle,
      useSetProgression: schedMode === "specific_test" ? schedUseSetProgression : false,
      currentSetIndex: existingSched?.currentSetIndex || 0,
      totalPaperQuestions: selectedPaper?.questions?.length || existingSched?.totalPaperQuestions,
      questionCount: Number(schedQuestionCount) || 25,
      timePerQuestion: Number(schedTimePerQ) || 30,
      scheduledTime: schedDailyTime,
      isActive: true,
      targetGroupId: schedTargetGroup.trim() || botConfig.targetGroupId || "",
      reminderMinutesBefore: schedReminderMinutes,
      createdAt: existingSched?.createdAt || new Date().toISOString(),
    };
    try {
      await saveScheduledDailyTest(newSchedule);
      const updated = await fetchServerScheduledTests().catch(() =>
        getLocalScheduledTests()
      );
      setScheduledTests(updated);
      alert(
        editingScheduleId
          ? "ડેઇલી ટેસ્ટ શેડ્યુલ સફળતાપૂર્વક અપડેટ થયું!"
          : "નવું ડેઇલી ટેસ્ટ શેડ્યુલ સર્વર પર સફળતાપૂર્વક સેવ થયું! હવે ક્રોન નિર્ધારિત સમયે આપોઆપ ચલાવશે."
      );
      setEditingScheduleId(null);
      refreshServerStats();
    } catch (err: any) {
      alert(err?.message || "શેડ્યુલ સેવ થઈ શક્યું નહીં.");
    }
  };

  const handleEditSchedule = (s: ScheduledDailyTest) => {
    setEditingScheduleId(s.id);
    setSchedTitle(s.title);
    setSchedMode(s.mode || "all_mixed");
    if (s.mode === "specific_test" && s.specificTestCode) {
      setSchedSpecificCode(s.specificTestCode);
    }
    if (s.mode === "subject_wise" && s.subject) {
      setSchedSubject(s.subject);
    }
    setSchedShuffle(s.shuffleQuestions !== false);
    setSchedUseSetProgression(Boolean(s.useSetProgression));
    setSchedQuestionCount(s.questionCount || 25);
    setSchedTimePerQ(s.timePerQuestion || 30);
    setSchedDailyTime(s.scheduledTime || "21:00");
    setSchedTargetGroup(s.targetGroupId || "");
    setSchedReminderMinutes(
      s.reminderMinutesBefore === undefined ? 60 : s.reminderMinutesBefore
    );
    const formEl = document.getElementById("schedule-form-container");
    if (formEl) formEl.scrollIntoView({ behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingScheduleId(null);
    setSchedTitle("ડેઇલી મોક ટેસ્ટ");
    setSchedMode("specific_test");
    setSchedQuestionCount(25);
    setSchedShuffle(true);
    setSchedUseSetProgression(false);
    setSchedReminderMinutes(60);
  };

  const handleResetScheduleSetProgress = async (s: ScheduledDailyTest) => {
    try {
      await saveScheduledDailyTest({ ...s, currentSetIndex: 0 });
      const updated = await fetchServerScheduledTests().catch(() =>
        getLocalScheduledTests()
      );
      setScheduledTests(updated);
    } catch (err: any) {
      alert(err?.message || "પ્રગતિ રીસેટ થઈ શકી નહીં.");
    }
  };

  const refreshPaperSetDispatches = async () => {
    try {
      const res = await fetch("/api/papers/sets", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.records)) {
        setPaperSetDispatches(data.records);
      }
    } catch {}
  };

  const handleOpenSetManager = (paper: Paper) => {
    setSetManagerPaper(paper);
    const total = paper.questions?.length || 0;
    const defaultSize = total >= 200 ? 50 : total >= 60 ? 30 : 20;
    setSetManagerSize(defaultSize);
    setSetManagerCustomSize(String(defaultSize));
    setSetManagerFilter("all");
    setSetManagerTargetGroup(schedTargetGroup || botConfig.targetGroupId || "-1004348674260");
    refreshPaperSetDispatches();
    setTimeout(() => {
      document.getElementById("admin-set-manager-panel")?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  };

  const handleDispatchSetNow = async (set: QuestionSet) => {
    if (!setManagerPaper) return;
    const groupId = setManagerTargetGroup.trim() || botConfig.targetGroupId || "";
    if (!groupId) {
      alert("કૃપા કરીને પહેલા Telegram ગ્રૂપ ID સિલેક્ટ કરો.");
      return;
    }
    setDispatchingSetKey(set.key);
    try {
      const res = await fetch("/api/papers/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch_set",
          paperId: setManagerPaper.id,
          testCode: setManagerPaper.testCode,
          paperTitle: setManagerPaper.title,
          subject: setManagerPaper.subject || setManagerPaper.category,
          setNumber: set.setNumber,
          setSize: set.setSize,
          startIndex: set.startIndex,
          endIndex: set.endIndex,
          timePerQuestion: setManagerTimePerQ,
          targetGroupId: groupId,
          shuffle: setManagerShuffle,
          fallbackQuestions: setManagerPaper.questions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error || "સેટ મોકલવામાં ભૂલ આવી.");
        return;
      }
      if (data.quiz) setLastDispatchedQuiz(data.quiz);
      if (data.record) {
        setPaperSetDispatches((prev) => [
          data.record,
          ...prev.filter((r) => r.id !== data.record.id),
        ]);
      }
    } catch (err: any) {
      alert(err?.message || "નેટવર્ક એરર.");
    } finally {
      setDispatchingSetKey(null);
    }
  };

  const handleToggleSetRecord = async (
    set: QuestionSet,
    existingRecord?: PaperSetDispatchRecord
  ) => {
    if (!setManagerPaper) return;
    try {
      if (existingRecord) {
        const res = await fetch("/api/papers/sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_pending",
            id: existingRecord.id,
          }),
        });
        if (res.ok) {
          setPaperSetDispatches((prev) => prev.filter((r) => r.id !== existingRecord.id));
        }
      } else {
        const res = await fetch("/api/papers/sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_done",
            paperId: setManagerPaper.id,
            testCode: setManagerPaper.testCode,
            setNumber: set.setNumber,
            setSize: set.setSize,
            totalSets: set.totalSets,
            startQuestion: set.startQuestion,
            endQuestion: set.endQuestion,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.record) {
          setPaperSetDispatches((prev) => [
            data.record,
            ...prev.filter((r) => r.id !== data.record.id),
          ]);
        }
      }
    } catch {}
  };

  const handleResetPaperSets = async () => {
    if (!setManagerPaper) return;
    if (!confirm("શું તમે આ પેપરના બધા સેટ્સ ફરીથી 'બાકી (Pending)' કરવા માંગો છો?")) return;
    try {
      const res = await fetch("/api/papers/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          paperId: setManagerPaper.id,
          testCode: setManagerPaper.testCode,
          setSize: setManagerSize,
        }),
      });
      if (res.ok) {
        await refreshPaperSetDispatches();
      }
    } catch {}
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
    } catch (e: any) {
      alert(e?.message || "ટેસ્ટ મોકલવામાં કોઈ ક્ષતિ થઈ.");
    } finally {
      setDispatchingId(null);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (confirm("શું તમે આ ડેઇલી ટેસ્ટ શેડ્યુલ કાઢી નાખવા માંગો છો?")) {
      try {
        await deleteScheduledDailyTest(id);
        setScheduledTests(getLocalScheduledTests());
        refreshServerStats();
      } catch (err: any) {
        alert(err?.message || "શેડ્યુલ ડિલીટ થઈ શક્યું નહીં.");
      }
    }
  };

  const handleToggleScheduleActive = async (s: ScheduledDailyTest) => {
    const updated = { ...s, isActive: !s.isActive };
    try {
      await saveScheduledDailyTest(updated);
      setScheduledTests(getLocalScheduledTests());
    } catch (err: any) {
      alert(err?.message || "શેડ્યુલ અપડેટ થઈ શક્યું નહીં.");
    }
  };

  // Local Polling loop for localhost development or live test answering
  useEffect(() => {
    if (!isPollingActive || !(serverConfigInfo.hasBotToken || botConfig.botToken)) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/telegram/poll", { cache: "no-store" });
        const data = await res.json();
        if (!isMounted) return;
        if (res.status === 401) {
          setPollLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] Unauthorized — admin session expired`,
            ...prev,
          ].slice(0, 5));
          setIsPollingActive(false);
          return;
        }
        if (data.ok && data.processedCount > 0) {
          const newLogs = data.processed.map(
            (p: any) => `[${new Date().toLocaleTimeString()}] Action: ${p.res?.action || "Handled"}`
          );
          setPollLogs((prev) => [...newLogs, ...prev].slice(0, 5));
        }
        if (data.finalized > 0) {
          setPollLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ${data.finalized} ટેસ્ટનું અંતિમ લીડરબોર્ડ મોકલાયું`,
            ...prev,
          ].slice(0, 5));
        }
      } catch (e) {
        // quiet error
      }
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isPollingActive, botConfig.botToken, serverConfigInfo.hasBotToken]);

  const handleSaveBotConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBotSaveMsg(null);
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(botConfig),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          setBotSaveMsg({ ok: false, message: "Admin સેશન સમાપ્ત થઈ ગયું. ફરી લોગિન કરો." });
          return;
        }
        setBotSaveMsg({ ok: false, message: data.error || "બોટ સેટિંગ્સ સેવ થઈ શક્યા નહીં." });
        return;
      }

      const saved = data.config || {};
      setServerConfigInfo({
        hasBotToken: Boolean(saved.hasBotToken),
        hasWebhookSecret: Boolean(saved.hasWebhookSecret),
      });
      // Drop any newly typed token from UI state; the server keeps it.
      const next = { ...botConfig, ...saved, botToken: "", webhookSecret: "" };
      setBotConfig(next);
      setTelegramBotConfig(next);
      setBotConfigSaved(true);
      setBotSaveMsg({ ok: true, message: "બોટ સેટિંગ્સ સર્વર પર સફળતાપૂર્વક સેવ થઈ ગયા છે!" });
      setTimeout(() => setBotConfigSaved(false), 2500);
    } catch (err: any) {
      setBotSaveMsg({ ok: false, message: err?.message || "નેટવર્ક એરર: સેવ થઈ શક્યું નહીં." });
    }
  };

  const handleWebhook = async (action: "set" | "delete" | "info") => {
    setWebhookBusy(action);
    setWebhookMsg(null);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) setIsAuthenticated(false);
        setWebhookMsg({ ok: false, message: data.error || "Webhook કમાન્ડ નિષ્ફળ ગયો." });
        return;
      }

      if (action === "info") {
        const info = data.result?.result || {};
        setWebhookMsg({
          ok: true,
          message:
            `URL: ${info.url || "સેટ નથી"} • Pending: ${info.pending_update_count ?? 0}` +
            (info.last_error_message ? ` • છેલ્લી ભૂલ: ${info.last_error_message}` : ""),
        });
      } else if (action === "set") {
        setWebhookMsg({
          ok: Boolean(data.ok),
          message: data.ok
            ? `Webhook સફળતાપૂર્વક સેટ થયું: ${data.url || ""}`
            : data.error || "Webhook સેટ થઈ શક્યું નહીં.",
        });
      } else {
        setWebhookMsg({
          ok: Boolean(data.ok),
          message: data.ok
            ? "Webhook દૂર કરવામાં આવ્યું. હવે લોકલ polling વાપરી શકાય છે."
            : data.error || "Webhook દૂર કરી શકાયું નહીં.",
        });
      }

      // Refresh whether a secret/token exists after the action.
      const cfgRes = await fetch("/api/telegram/config", { cache: "no-store" });
      if (cfgRes.ok) {
        const cfg = await cfgRes.json().catch(() => ({}));
        setServerConfigInfo({
          hasBotToken: Boolean(cfg.hasBotToken),
          hasWebhookSecret: Boolean(cfg.hasWebhookSecret),
        });
        setBotConfig((prev) => ({ ...prev, ...cfg, botToken: "", webhookSecret: "" }));
      }
    } catch (err: any) {
      setWebhookMsg({ ok: false, message: err?.message || "નેટવર્ક એરર." });
    } finally {
      setWebhookBusy(null);
    }
  };

  const handleSetMenuButton = async () => {
    if (!serverConfigInfo.hasBotToken && !botConfig.botToken) {
      alert("કૃપા કરીને પહેલા બોટ ટોકન સેવ કરો.");
      return;
    }
    setSettingMenuBtn(true);
    setMenuBtnMsg(null);
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...botConfig, setupMenuButton: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.menuResult?.ok) {
        setMenuBtnMsg({ ok: true, message: "ટેલિગ્રામ ચેટ મેનુ બટન (Mini App) સફળતાપૂર્વક સેટ થઈ ગયું!" });
      } else {
        setMenuBtnMsg({
          ok: false,
          message: data.menuResult?.description || data.error || "મેનુ બટન માટે HTTPS લિંક જરૂરી છે (દા.ત. Vercel deployment URL).",
        });
      }
    } catch (e: any) {
      setMenuBtnMsg({ ok: false, message: e.message || "Failed to set menu button" });
    } finally {
      setSettingMenuBtn(false);
    }
  };

  const handleTestBotConnection = async () => {
    if (!serverConfigInfo.hasBotToken && !botConfig.botToken) {
      setBotTestResult({ ok: false, message: "કૃપા કરીને પહેલા બોટ ટોકન સેવ કરો." });
      return;
    }
    setTestingBot(true);
    setBotTestResult(null);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setBotTestResult({
          ok: true,
          message: `કનેક્શન સફળ! બોટ યુઝરનેમ: @${data.botUsername} (${data.botName || ""})`,
        });
        if (data.botUsername && data.botUsername !== botConfig.botUsername) {
          setBotConfig((prev) => ({ ...prev, botUsername: data.botUsername }));
        }
      } else {
        setBotTestResult({
          ok: false,
          message: `કનેક્શન નિષ્ફળ: ${data.error || data.description || "અમાન્ય બોટ ટોકન"}`,
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
        <div className="px-3.5 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-brand-950 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base leading-tight truncate">એડમિન પેનલ (Admin Control)</h3>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                યુઝર્સ ટ્રેકિંગ અને ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન મોનિટરિંગ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isAuthenticated && (
              <button
                onClick={() => setShowConfigModal(true)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
                title="Cloud Database Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-rose-500/30 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
            {standalone ? (
              <a
                href="/"
                className="inline-flex items-center justify-center gap-1 h-9 px-2.5 sm:px-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-bold transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">મુખ્ય પેજ</span>
              </a>
            ) : (
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
                title="બંધ કરો"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Auth Gate if not logged in */}
        {isAuthChecking ? (
          <div className="p-10 max-w-sm mx-auto text-center space-y-3 my-auto">
            <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-700">Admin સેશન ચકાસી રહ્યું છે...</p>
            <p className="text-xs text-slate-500">કૃપા કરીને થોડી સેકન્ડ રાહ જુઓ.</p>
          </div>
        ) : !isAuthenticated ? (
          <div className="p-8 max-w-sm mx-auto text-center space-y-4 my-auto">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-lg">Admin સુરક્ષા Login</h4>
              <p className="text-xs text-slate-500 mt-1">
                એડમિન કંટ્રોલ સેન્ટર ખોલવા માટે Admin Password / PIN દાખલ કરો (Supabase Cloud Database અથવા Local PIN).
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                maxLength={PIN_MAX_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Admin Password / PIN"
                className="w-full text-center text-lg font-mono tracking-widest px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
              {authError && (
                <div className="text-xs text-rose-600 font-medium">{authError}</div>
              )}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 transition-all disabled:opacity-50"
              >
                {isLoggingIn ? "ચકાસી રહ્યું છે..." : "અનલોક કરો (Unlock)"}
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

            {/* Live server overview */}
            {serverStats && (
              <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>લાઈવ સર્વર આંકડા (Server Overview)</span>
                  </div>
                  <button
                    onClick={refreshServerStats}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    રિફ્રેશ
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  {[
                    { label: "ક્વિઝ", value: serverStats.quizzes },
                    { label: "પ્રશ્નો", value: serverStats.totalQuizQuestions },
                    { label: "સેશન્સ", value: serverStats.sessions },
                    { label: "સહભાગીઓ", value: serverStats.participants },
                    { label: "એટેમ્પ્ટ્સ", value: serverStats.attempts },
                    { label: "સરેરાશ %", value: `${serverStats.averagePercentage}%` },
                  ].map((item) => (
                    <div key={item.label} className="p-2 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-base font-black text-emerald-300">{item.value}</div>
                      <div className="text-[10px] text-slate-400 font-semibold">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                  <span>💾 સ્ટોરેજ: <strong className="text-slate-200">{serverStats.storageMode}</strong></span>
                  <span>🔗 Webhook URL: <strong className="text-slate-200">{serverStats.webhookConfigured ? "configured ✓" : "not set"}</strong></span>
                  <span>📅 શેડ્યુલ્સ: <strong className="text-slate-200">{serverStats.schedules}</strong></span>
                  <span>🎯 ચાલુ સેશન્સ: <strong className="text-slate-200">{serverStats.activeSessions}</strong></span>
                </div>
              </div>
            )}

            {/* Admin Tabs */}
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab("users")}
                className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  activeTab === "users"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>યુઝર્સ ({users.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("digitization")}
                className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  activeTab === "digitization"
                    ? "bg-orange-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <FileDown className="w-4 h-4" />
                <span>પેપર્સ ટ્રેકર ({sourcePapers.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("scheduler")}
                className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  activeTab === "scheduler"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>📅 શેડ્યુલર</span>
              </button>

              <button
                onClick={() => setActiveTab("bot_config")}
                className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  activeTab === "bot_config"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>🤖 બોટ સેટિંગ્સ</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("database");
                  fetchSupabaseStatus();
                }}
                className={`h-9 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  activeTab === "database"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>🗄️ ડેટાબેઝ</span>
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

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto text-xs">
                              <div className="text-left sm:text-right sm:mr-1 flex sm:block items-center justify-between gap-2">
                                <div className="font-bold text-indigo-700">
                                  {u.papersCount || 0} પેપર્સ • {u.questionsCount || 0} પ્રશ્નો
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {formatDate(u.lastActive)}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
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
                                  className={`h-9 px-3 rounded-xl border text-xs font-bold shadow-sm inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
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
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span className="truncate">લાઇબ્રેરી મંજૂર</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="truncate">લાઇબ્રેરી આપો</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => setSelectedUser(u)}
                                  className="h-9 px-3 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 font-bold text-xs shadow-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                                >
                                  <Eye className="w-3.5 h-3.5 shrink-0" />
                                  <span>પેપર્સ જુઓ</span>
                                </button>
                              </div>
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

                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-[11px] text-purple-900 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                  <span>
                    આ શેડ્યુલ્સ સર્વર પર સેવ થાય છે અને <code className="bg-white/70 px-1 rounded">/api/cron/tick</code> દ્વારા આપોઆપ ચાલે છે (Vercel Cron અથવા લોકલ બોટ ડેમોન). એડમિન પેનલ ખુલ્લી હોવી જરૂરી નથી.
                  </span>
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
                <div
                  id="schedule-form-container"
                  className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      {editingScheduleId ? (
                        <>
                          <Edit3 className="w-4 h-4 text-indigo-600" />
                          <span>શેડ્યુલ એડિટ કરો (Edit Daily Schedule)</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-purple-600" />
                          <span>નવું ડેઇલી મોક ટેસ્ટ શેડ્યુલ કન્ફિગર કરો</span>
                        </>
                      )}
                    </h5>
                    {editingScheduleId && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="text-xs text-rose-600 hover:underline font-semibold"
                      >
                        ✕ રદ કરો (Cancel)
                      </button>
                    )}
                  </div>

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
                          placeholder="દા.ત. GUJARAT DISTRICT SPECIAL – [RAJKOT]"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>

                      {/* Daily Time */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                          <span>રોજ મોકલવાનો સમય (Daily Time) *</span>
                          <span className="text-[11px] font-mono text-purple-700 font-bold">
                            {schedDailyTime} વાગ્યે
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={schedDailyTime}
                            onChange={(e) => setSchedDailyTime(e.target.value)}
                            required
                            className="px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                          />
                          <div className="flex gap-1 flex-wrap">
                            {["09:00", "13:00", "18:00", "21:00"].map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setSchedDailyTime(t)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                  schedDailyTime === t
                                    ? "bg-purple-600 text-white border-purple-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mode Selection (3 Modes) */}
                    <div>
                      <label className="block font-bold text-slate-700 mb-2">
                        પ્રશ્નો પસંદ કરવાનો મોડ (Question Source Mode) *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Option 1: Specific Test */}
                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                            schedMode === "specific_test"
                              ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-400/30 text-indigo-950 font-semibold shadow-sm"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="sched_mode"
                            checked={schedMode === "specific_test"}
                            onChange={() => setSchedMode("specific_test")}
                            className="mt-1 accent-indigo-600"
                          />
                          <div>
                            <div className="font-bold text-xs sm:text-sm flex items-center gap-1">
                              <span>🎯 ચોક્કસ ટેસ્ટ સિલેક્ટ કરો</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                              બનાવેલા પેપર્સમાંથી કોઈ ચોક્કસ ટેસ્ટ (દા.ત. Rajkot, Jamnagar, Porbandar) પસંદ કરો.
                            </div>
                          </div>
                        </label>

                        {/* Option 2: Subject Wise */}
                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                            schedMode === "subject_wise"
                              ? "bg-purple-50 border-purple-500 ring-2 ring-purple-400/30 text-purple-950 font-semibold shadow-sm"
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
                            <div className="font-bold text-xs sm:text-sm">📚 વિષય / ટોપિક વાઇઝ</div>
                            <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                              ચોક્કસ વિષય (દા.ત. ગુજરાતી વ્યાકરણ, કાયદો, ઇતિહાસ)માંથી પ્રશ્નો મોકલશે.
                            </div>
                          </div>
                        </label>

                        {/* Option 3: All Mixed */}
                        <label
                          className={`p-3.5 rounded-2xl border cursor-pointer flex items-start gap-3 transition-all ${
                            schedMode === "all_mixed"
                              ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/30 text-emerald-950 font-semibold shadow-sm"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="sched_mode"
                            checked={schedMode === "all_mixed"}
                            onChange={() => setSchedMode("all_mixed")}
                            className="mt-1 accent-emerald-600"
                          />
                          <div>
                            <div className="font-bold text-xs sm:text-sm">🎲 બધા જ પ્રશ્નોમાંથી મિક્સ</div>
                            <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                              તમામ પેપર્સમાંથી મિક્સ પ્રશ્નોની ગ્રાન્ડ મોક ટેસ્ટ. (પૂલ: {totalQuestions} પ્રશ્નો)
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Mode 1: Specific Test Selection View */}
                    {schedMode === "specific_test" && (
                      <div className="p-4 bg-white rounded-2xl border border-indigo-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="block font-bold text-indigo-950 text-xs sm:text-sm">
                            કયા પેપર / ટેસ્ટમાંથી પ્રશ્નો મોકલવા છે? * ({availableTests.length} ટેસ્ટ્સ ઉપલબ્ધ)
                          </label>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input
                              type="text"
                              value={testSearchFilter}
                              onChange={(e) => setTestSearchFilter(e.target.value)}
                              placeholder="ટેસ્ટ શોધો (રાજકોટ, Jamnagar, TEST-1062)..."
                              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        {availableTests.length === 0 ? (
                          <p className="text-slate-400 text-xs italic">
                            કોઈ ટેસ્ટ મળ્યો નથી. પહેલા ટેસ્ટ્સ બનાવો અથવા ડિજિટાઇઝ કરો.
                          </p>
                        ) : (
                          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {availableTests
                              .filter((t) => {
                                if (!testSearchFilter) return true;
                                const q = testSearchFilter.toLowerCase();
                                return (
                                  t.title?.toLowerCase().includes(q) ||
                                  t.testCode?.toLowerCase().includes(q) ||
                                  t.subject?.toLowerCase().includes(q)
                                );
                              })
                              .map((t) => {
                                const code = t.testCode || t.id;
                                const isSelected =
                                  schedSpecificCode.toUpperCase() === code.toUpperCase();
                                const qCount = t.questions?.length || 0;
                                return (
                                  <div
                                    key={t.id || t.testCode}
                                    onClick={() => {
                                      setSchedSpecificCode(code);
                                      if (!editingScheduleId) {
                                        setSchedTitle(`${t.title} (Daily Mock)`);
                                      }
                                    }}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                      isSelected
                                        ? "bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-400/30 text-indigo-950 shadow-sm"
                                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 shrink-0">
                                          {t.testCode || "TEST"}
                                        </span>
                                        <span className="font-bold text-xs truncate">
                                          {t.title}
                                        </span>
                                      </div>
                                      {t.subject && (
                                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                          {t.subject}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex-shrink-0 flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenSetManager(t);
                                        }}
                                        className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs inline-flex items-center justify-center gap-1.5 transition-all flex-1 sm:flex-none"
                                        title="આ ટેસ્ટને 30/40/50 ના અલગ સેટ્સમાં વહેંચો અને મોકલો"
                                      >
                                        <Layers className="w-3.5 h-3.5 shrink-0" />
                                        <span>સેટ્સમાં વહેંચો</span>
                                      </button>
                                      <span className="h-9 px-2.5 inline-flex items-center justify-center text-xs font-black font-mono rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                        {qCount} MCQs
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode 2: Subject Dropdown (if subject_wise) */}
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
                              const isSelected =
                                schedSubject === subj ||
                                (!schedSubject && subj === availableSubjects[0]);
                              return (
                                <button
                                  type="button"
                                  key={subj}
                                  onClick={() => setSchedSubject(subj)}
                                  className={`p-2.5 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? "bg-purple-100 border-purple-500 text-purple-950 font-bold shadow-sm"
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

                    {/* Advanced Question Count & Shuffle Settings */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white rounded-2xl border border-slate-200">
                      {/* Question Count */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-bold text-slate-800 text-xs">
                            ટેસ્ટમાં કેટલા પ્રશ્નો રાખવા? (Question Count) *
                          </label>
                          <span className="text-[11px] font-mono font-bold text-purple-700">
                            {schedQuestionCount} MCQs પસંદ
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={schedQuestionCount || ""}
                            onChange={(e) =>
                              setSchedQuestionCount(Math.max(1, Number(e.target.value)))
                            }
                            className="w-24 px-3 py-2 rounded-xl border border-slate-300 font-bold font-mono text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-sm"
                          />
                          <div className="flex items-center gap-1 flex-wrap flex-1">
                            {[10, 15, 20, 25, 30, 50].map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setSchedQuestionCount(count)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                  schedQuestionCount === count
                                    ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                                    : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                                }`}
                              >
                                {count}
                              </button>
                            ))}
                            {schedMode === "specific_test" && (
                              <button
                                type="button"
                                onClick={() => {
                                  const sel = availableTests.find(
                                    (t) =>
                                      (t.testCode || t.id).toUpperCase() ===
                                      schedSpecificCode.toUpperCase()
                                  );
                                  if (sel && sel.questions?.length) {
                                    setSchedQuestionCount(sel.questions.length);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              >
                                બધા ({availableTests.find(
                                  (t) =>
                                    (t.testCode || t.id).toUpperCase() ===
                                    schedSpecificCode.toUpperCase()
                                )?.questions?.length || "All"})
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          દા.ત. ૧૨૦ કે ૨૩૪ પ્રશ્નોમાંથી ગ્રૂપમાં ૧૫ કે ૨૫ પ્રશ્નોનો મોક ટેસ્ટ મોકલવો હોય તો અહીં સંખ્યા સેટ કરો.
                        </p>
                      </div>

                      {/* Shuffle Questions Option */}
                      <div>
                        <label className="block font-bold text-slate-800 text-xs mb-1.5">
                          પ્રશ્નો શફલ (Shuffle / Randomize) કરવા કે નહીં? *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label
                            className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                              schedShuffle
                                ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/20 text-indigo-950 font-bold"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="radio"
                              name="sched_shuffle"
                              checked={schedShuffle}
                              onChange={() => setSchedShuffle(true)}
                              className="accent-indigo-600"
                            />
                            <div>
                              <div className="flex items-center gap-1 text-xs">
                                <Shuffle className="w-3.5 h-3.5 text-indigo-600" />
                                <span>🔀 શફલ (Random)</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-normal">
                                રેન્ડમ પસંદ થશે
                              </div>
                            </div>
                          </label>

                          <label
                            className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                              !schedShuffle
                                ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/20 text-indigo-950 font-bold"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="radio"
                              name="sched_shuffle"
                              checked={!schedShuffle}
                              onChange={() => setSchedShuffle(false)}
                              className="accent-indigo-600"
                            />
                            <div>
                              <div className="flex items-center gap-1 text-xs">
                                <ListOrdered className="w-3.5 h-3.5 text-indigo-600" />
                                <span>🔢 ક્રમ અનુસાર (1 to N)</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-normal">
                                પહેલા પ્રશ્નથી ક્રમમાં
                              </div>
                            </div>
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          ક્રમ અનુસાર પસંદ કરવાથી હંમેશા પેપરના ૧ થી N સુધીના પ્રશ્નો ક્રમવાર રહેશે.
                        </p>
                      </div>

                      {schedMode === "specific_test" && (
                        <div className="sm:col-span-2 pt-3 border-t border-slate-100">
                          <label className="flex items-start gap-3 p-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 cursor-pointer hover:bg-indigo-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={schedUseSetProgression}
                              onChange={(e) => setSchedUseSetProgression(e.target.checked)}
                              className="mt-0.5 w-4 h-4 accent-indigo-600 rounded"
                            />
                            <div className="flex-1">
                              <div className="font-bold text-xs text-indigo-950 flex items-center gap-1.5 flex-wrap">
                                <span>🔁 ક્રમશઃ સેટ મોડ (Auto Set Progression — 500 MCQ માંથી રોજ અલગ સેટ)</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                                  Advanced
                                </span>
                              </div>
                              <p className="text-[11px] text-indigo-800/80 mt-0.5">
                                ચાલુ રાખવાથી દરરોજ અલગ સેટ મોકલાશે (દા.ત. દિવસ-૧: Q1–{schedQuestionCount}, દિવસ-૨: Q{schedQuestionCount + 1}–{schedQuestionCount * 2}...). કોઈ પ્રશ્ન રિપીટ નહીં થાય!
                              </p>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Time per Question */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                          <span>પ્રશ્ન દીઠ સમય (Timer)</span>
                          <span className="text-purple-700 font-mono text-xs">{schedTimePerQ} સેકન્ડ</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min={10}
                            max={600}
                            value={schedTimePerQ || ""}
                            onChange={(e) => setSchedTimePerQ(Number(e.target.value))}
                            placeholder="સેકન્ડ ટાઈપ કરો"
                            className="w-full pl-3 pr-16 py-2 rounded-xl border border-slate-300 font-bold font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold select-none">સેકન્ડ</span>
                        </div>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {[15, 20, 25, 30, 45, 60].map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setSchedTimePerQ(sec)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
                                schedTimePerQ === sec
                                  ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Target Group */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-bold text-slate-700">
                            Telegram ગ્રૂપ / ચેનલ ID
                          </label>
                          <span className="text-[10px] text-sky-600 font-semibold">
                            ડિફોલ્ટ: {botConfig.targetGroupId || "-1004348674260"}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={schedTargetGroup}
                          onChange={(e) => setSchedTargetGroup(e.target.value)}
                          placeholder={botConfig.targetGroupId || "-1004348674260"}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800 bg-white text-xs"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={() => setSchedTargetGroup("-1004348674260")}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              schedTargetGroup === "-1004348674260" ||
                              (!schedTargetGroup && botConfig.targetGroupId === "-1004348674260")
                                ? "bg-sky-600 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            💥 GPSC Exams (-1004348674260)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSchedTargetGroup("-1003919156629")}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              schedTargetGroup === "-1003919156629"
                                ? "bg-amber-600 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            🧪 ટેસ્ટ ગ્રૂપ (-1003919156629)
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          જે ગ્રૂપમાં મોક ટેસ્ટ મોકલવો હોય તે ગ્રૂપ સિલેક્ટ કરો અથવા Chat ID દાખલ કરો.
                        </p>
                      </div>
                    </div>

                    {/* Upcoming Test Auto-Reminder Selector */}
                    <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                          <span>🔔 આગામી ટેસ્ટ રિમાઇન્ડર (Upcoming Test Reminder • 3 મિનિટમાં ઓટો-ડિલીટ)</span>
                        </label>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          {schedReminderMinutes === 0
                            ? "બંધ (Off)"
                            : schedReminderMinutes >= 1440
                            ? "આખો દિવસ (ટેસ્ટ શરૂ થાય ત્યાં સુધી)"
                            : `ટેસ્ટના ${schedReminderMinutes} મિનિટ પહેલાથી`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { val: 30, label: "30 મિનિટ પહેલાથી" },
                          { val: 60, label: "60 મિનિટ પહેલાથી (Recommended)" },
                          { val: 120, label: "2 કલાક પહેલાથી" },
                          { val: 1440, label: "ટેસ્ટ પહેલા આખો દિવસ" },
                          { val: 0, label: "બંધ (Off)" },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => setSchedReminderMinutes(opt.val)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                              schedReminderMinutes === opt.val
                                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                : "bg-white text-amber-900 border-amber-200 hover:bg-amber-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-900/80">
                        જ્યાં સુધી ટેસ્ટ શરૂ ન થાય ત્યાં સુધી ગ્રૂપમાં કાઉન્ટડાઉન રિમાઇન્ડર મોકલાશે અને દરેક રિમાઇન્ડર ૩ મિનિટમાં આપોઆપ ડિલીટ થતું રહેશે.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      {editingScheduleId && (
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all"
                        >
                          રદ કરો (Cancel)
                        </button>
                      )}
                      <button
                        type="submit"
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 flex items-center gap-1.5 transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          {editingScheduleId
                            ? "શેડ્યુલ અપડેટ કરો (Update Schedule)"
                            : "શેડ્યુલ સેવ કરો (Save Daily Schedule)"}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Test Set Manager Panel (500 MCQ -> 30/40/50 Sets + Remaining Tracker) */}
                {setManagerPaper && (() => {
                  const allQs = setManagerPaper.questions || [];
                  const baseKey = setManagerPaper.testCode || setManagerPaper.id;
                  const sets = divideQuestionsIntoSets(baseKey, allQs, setManagerSize);
                  const relevantRecords = paperSetDispatches.filter(
                    (r) =>
                      (r.paperId && r.paperId === setManagerPaper.id) ||
                      (setManagerPaper.testCode &&
                        r.testCode &&
                        r.testCode.toUpperCase() === setManagerPaper.testCode.toUpperCase())
                  );
                  const getSetRecord = (s: QuestionSet) =>
                    relevantRecords.find(
                      (r) => r.setSize === s.setSize && r.setNumber === s.setNumber
                    );

                  const doneCount = sets.filter((s) => Boolean(getSetRecord(s))).length;
                  const remainingCount = sets.length - doneCount;
                  const doneQuestionsCount = sets.reduce(
                    (sum, s) => (getSetRecord(s) ? sum + s.questionCount : sum),
                    0
                  );
                  const remainingQuestionsCount = Math.max(0, allQs.length - doneQuestionsCount);
                  const nextRemainingSet = sets.find((s) => !getSetRecord(s)) || null;
                  const progressPct =
                    allQs.length > 0
                      ? Math.min(100, Math.round((doneQuestionsCount / allQs.length) * 100))
                      : 0;

                  const visibleSets = sets.filter((s) => {
                    const isDone = Boolean(getSetRecord(s));
                    if (setManagerFilter === "pending") return !isDone;
                    if (setManagerFilter === "completed") return isDone;
                    return true;
                  });

                  return (
                    <div
                      id="admin-set-manager-panel"
                      className="rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-sky-50 border-2 border-indigo-300 p-4 sm:p-6 space-y-4 shadow-lg animate-fadeIn"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider">
                              📦 Test Set Manager
                            </span>
                            <span className="font-mono text-xs font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-md">
                              {setManagerPaper.testCode || setManagerPaper.id}
                            </span>
                          </div>
                          <h5 className="font-bold text-slate-900 text-sm sm:text-base mt-1">
                            {setManagerPaper.title} ({allQs.length} MCQs)
                          </h5>
                          <p className="text-[11px] text-slate-500">
                            મોટી ટેસ્ટને ૩૦, ૪૦ કે ૫૦ ના નાના સેટ્સમાં વહેંચો, કયો સેટ ગ્રૂપમાં મોકલાયો છે અને કયો બાકી છે તે ટ્રેક કરો.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSetManagerPaper(null)}
                          className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800"
                          title="બંધ કરો"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Progress Overview */}
                      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="text-[10px] text-slate-500 font-bold">કુલ પ્રશ્નો</div>
                            <div className="text-sm font-black font-mono text-slate-900">{allQs.length}</div>
                          </div>
                          <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200">
                            <div className="text-[10px] text-indigo-700 font-bold">કુલ સેટ્સ</div>
                            <div className="text-sm font-black font-mono text-indigo-900">{sets.length} Sets</div>
                          </div>
                          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                            <div className="text-[10px] text-emerald-700 font-bold">✅ મોકલાયેલ (Done)</div>
                            <div className="text-sm font-black font-mono text-emerald-800">
                              {doneCount} Sets ({doneQuestionsCount} Qs)
                            </div>
                          </div>
                          <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                            <div className="text-[10px] text-amber-700 font-bold">⏳ બાકી (Remaining)</div>
                            <div className="text-sm font-black font-mono text-amber-800">
                              {remainingCount} Sets ({remainingQuestionsCount} Qs)
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-600">કુલ પૂર્ણતા ({doneCount}/{sets.length} Sets)</span>
                            <span className="text-indigo-700 font-mono">{progressPct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Controls: Set Size + Group + Timer + Shuffle */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 text-xs">
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-800 block">
                            દરેક સેટની સાઈઝ (MCQs per Set):
                          </label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[20, 25, 30, 40, 50, 100].map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => {
                                  setSetManagerSize(sz);
                                  setSetManagerCustomSize(String(sz));
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                  setManagerSize === sz
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {sz}
                              </button>
                            ))}
                            <input
                              type="number"
                              min={5}
                              max={Math.max(5, allQs.length)}
                              value={setManagerCustomSize}
                              onChange={(e) => {
                                setSetManagerCustomSize(e.target.value);
                                const v = Number(e.target.value);
                                if (v >= 5) setSetManagerSize(Math.min(v, allQs.length || v));
                              }}
                              className="w-14 px-2 py-1 rounded-lg border border-slate-300 font-mono font-bold text-xs text-center"
                              placeholder="30"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-800 block">
                            ટાર્ગેટ ગ્રૂપ & ટાઈમર:
                          </label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSetManagerTargetGroup("-1004348674260")}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                                setManagerTargetGroup === "-1004348674260"
                                  ? "bg-sky-600 text-white border-sky-600"
                                  : "bg-slate-50 text-slate-700 border-slate-200"
                              }`}
                            >
                              💥 GPSC Exams
                            </button>
                            <button
                              type="button"
                              onClick={() => setSetManagerTargetGroup("-1003919156629")}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                                setManagerTargetGroup === "-1003919156629"
                                  ? "bg-amber-600 text-white border-amber-600"
                                  : "bg-slate-50 text-slate-700 border-slate-200"
                              }`}
                            >
                              🧪 ટેસ્ટ ગ્રૂપ
                            </button>
                            <div className="flex items-center gap-1 ml-auto">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <input
                                type="number"
                                min={5}
                                max={600}
                                value={setManagerTimePerQ}
                                onChange={(e) => setSetManagerTimePerQ(Math.max(5, Number(e.target.value)))}
                                className="w-12 px-1.5 py-1 rounded-lg border border-slate-300 font-mono font-bold text-xs text-center"
                              />
                              <span className="text-[10px] text-slate-500">sec</span>
                            </div>
                          </div>
                        </div>

                        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSetManagerShuffle(!setManagerShuffle)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${
                                setManagerShuffle
                                  ? "bg-amber-50 border-amber-300 text-amber-800"
                                  : "bg-slate-50 border-slate-200 text-slate-700"
                              }`}
                            >
                              <Shuffle className="w-3 h-3" />
                              <span>{setManagerShuffle ? "સેટમાં શફલ થશે" : "ક્રમ અનુસાર (Q1→N)"}</span>
                            </button>

                            {doneCount > 0 && (
                              <button
                                type="button"
                                onClick={handleResetPaperSets}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>રીસેટ ({setManagerSize}s)</span>
                              </button>
                            )}
                          </div>

                          {nextRemainingSet && (
                            <button
                              type="button"
                              disabled={dispatchingSetKey === nextRemainingSet.key}
                              onClick={() => handleDispatchSetNow(nextRemainingSet)}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {dispatchingSetKey === nextRemainingSet.key
                                  ? "મોકલાઈ રહ્યું છે..."
                                  : `⚡ આગલો બાકી સેટ મોકલો: ${nextRemainingSet.label}`}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter Tabs + Set Cards Grid */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="font-bold text-slate-900 text-xs">
                            સેટ્સની યાદી ({visibleSets.length})
                          </span>
                          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
                            <button
                              type="button"
                              onClick={() => setSetManagerFilter("all")}
                              className={`px-2.5 py-1 rounded-lg ${
                                setManagerFilter === "all" ? "bg-slate-800 text-white" : "text-slate-600"
                              }`}
                            >
                              બધા ({sets.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setSetManagerFilter("pending")}
                              className={`px-2.5 py-1 rounded-lg ${
                                setManagerFilter === "pending" ? "bg-amber-500 text-white" : "text-slate-600"
                              }`}
                            >
                              ⏳ બાકી ({remainingCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setSetManagerFilter("completed")}
                              className={`px-2.5 py-1 rounded-lg ${
                                setManagerFilter === "completed" ? "bg-emerald-600 text-white" : "text-slate-600"
                              }`}
                            >
                              ✅ પૂર્ણ ({doneCount})
                            </button>
                          </div>
                        </div>

                        <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                          {visibleSets.map((s) => {
                            const rec = getSetRecord(s);
                            const isDone = Boolean(rec);
                            const isSending = dispatchingSetKey === s.key;
                            return (
                              <div
                                key={s.key}
                                className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                                  isDone
                                    ? "bg-emerald-50/70 border-emerald-200"
                                    : "bg-white border-slate-200"
                                }`}
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                        isDone
                                          ? "bg-emerald-600 text-white"
                                          : "bg-indigo-100 text-indigo-800"
                                      }`}
                                    >
                                      Set {s.setNumber}
                                    </span>
                                    <span className="font-bold text-slate-900 text-xs">
                                      Q{s.startQuestion}–{s.endQuestion} ({s.questionCount} Qs)
                                    </span>
                                  </div>
                                  <div className="text-[10px]">
                                    {isDone ? (
                                      <span className="text-emerald-800 font-semibold">
                                        ✅ મોકલાયેલ {rec?.quizCode ? `(${rec.quizCode})` : ""}
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-semibold">
                                        ⏳ બાકી છે (Remaining)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSetRecord(s, rec)}
                                    className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-bold text-slate-600"
                                    title={isDone ? "ફરીથી બાકી (Pending) માર્ક કરો" : "પૂર્ણ (Done) માર્ક કરો"}
                                  >
                                    {isDone ? "↺ બાકી" : "✓ પૂર્ણ"}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isSending}
                                    onClick={() => handleDispatchSetNow(s)}
                                    className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 disabled:opacity-50 ${
                                      isDone
                                        ? "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                                    }`}
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>{isSending ? "..." : isDone ? "ફરી મોકલો" : "મોકલો"}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Existing Schedules Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-slate-900 text-sm">
                        હાલના સક્રિય શેડ્યુલ્સ ({scheduledTests.length})
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        તમે અલગ અલગ સમય માટે મલ્ટિપલ ડેઇલી શેડ્યુલ્સ (દા.ત. સવારે 9:00, બપોરે 2:00, રાત્રે 9:00) સેટ કરી શકો છો.
                      </p>
                    </div>
                  </div>

                  {scheduledTests.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                      હજુ સુધી કોઈ ડેઇલી શેડ્યુલ કન્ફિગર કરેલ નથી. ઉપરના ફોર્મ વડે નવું શેડ્યુલ ઉમેરો.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {scheduledTests.map((s) => (
                        <div
                          key={s.id}
                          className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-300 transition-all"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{s.title}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  s.mode === "specific_test"
                                    ? "bg-sky-100 text-sky-800 border border-sky-200"
                                    : s.mode === "subject_wise"
                                    ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                    : "bg-purple-100 text-purple-800 border border-purple-200"
                                }`}
                              >
                                {s.mode === "specific_test"
                                  ? `🎯 ટેસ્ટ: ${s.specificTestCode || "Specific"}`
                                  : s.mode === "subject_wise"
                                  ? `📚 વિષય: ${s.subject}`
                                  : "🎲 બધા પ્રશ્નો મિક્સ"}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {s.shuffleQuestions !== false ? "🔀 શફલ" : "🔢 ક્રમ અનુસાર"}
                              </span>
                              {s.useSetProgression && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                                  <span>🔁 આગામી: Set {(s.currentSetIndex || 0) + 1}</span>
                                  {(s.currentSetIndex || 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResetScheduleSetProgress(s);
                                      }}
                                      className="underline text-indigo-900 ml-1 hover:text-rose-700"
                                      title="Set 1 પર રીસેટ કરો"
                                    >
                                      (Reset)
                                    </button>
                                  )}
                                </span>
                              )}
                              <span
                                onClick={() => handleToggleScheduleActive(s)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                                  s.isActive
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200"
                                    : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                                }`}
                                title="ક્લિક કરીને સક્રિય/થોભાવો"
                              >
                                {s.isActive ? "● સક્રિય (Daily Active)" : "○ થોભાવેલ (Paused)"}
                              </span>
                            </div>

                            <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                              <span>⏰ સમય: <strong>રોજ {s.scheduledTime} વાગ્યે</strong></span>
                              <span>•</span>
                              <span>📊 <strong>{s.questionCount} MCQs</strong></span>
                              <span>•</span>
                              <span>⏱ <strong>{s.timePerQuestion} સે./પ્રશ્ન</strong></span>
                              {s.targetGroupId && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-slate-600">
                                    ગ્રૂપ:{" "}
                                    {s.targetGroupId === "-1004348674260"
                                      ? "GPSC Exams (-1004348674260)"
                                      : s.targetGroupId === "-1003919156629"
                                      ? "ટેસ્ટ ગ્રૂપ (-1003919156629)"
                                      : s.targetGroupId}
                                  </span>
                                </>
                              )}
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

                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-1 sm:pt-0">
                            <button
                              onClick={() => handleDispatchNow(s.id)}
                              disabled={dispatchingId === s.id}
                              className="flex-1 sm:flex-none h-10 px-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-sm inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                              title="તરત જ આ ટેસ્ટ ગ્રૂપમાં મોકલો"
                            >
                              <Send className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{dispatchingId === s.id ? "મોકલાઈ રહ્યું છે..." : "હમણાં જ ક્વિઝ મોકલો"}</span>
                            </button>

                            <button
                              onClick={() => handleEditSchedule(s)}
                              className="w-10 h-10 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 flex items-center justify-center transition-colors shrink-0"
                              title="એડિટ કરો"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteSchedule(s.id)}
                              className="w-10 h-10 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 flex items-center justify-center transition-colors shrink-0"
                              title="ડિલીટ કરો"
                            >
                              <Trash2 className="w-4 h-4" />
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
              <div className="max-w-3xl space-y-6">
                <div>
                  <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <Bot className="w-5 h-5 text-sky-600" />
                    <span>ટેલિગ્રામ બોટ & Mini App કંટ્રોલ (Telegram Bot & Admin Control)</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    તમારા ટેલિગ્રામ બોટનું ટોકન, એડમિન ID અને Mini App કન્ફિગર કરો જેથી ગ્રૂપમાં સીધા જ મોક ટેસ્ટ, પોલ્સ અને લીડરબોર્ડ ટેબલ પરિણામો મોકલી શકાય.
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

                {menuBtnMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 animate-fadeIn ${
                      menuBtnMsg.ok
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-amber-50 border-amber-300 text-amber-800"
                    }`}
                  >
                    {menuBtnMsg.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    )}
                    <span>{menuBtnMsg.message}</span>
                  </div>
                )}

                {botSaveMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 animate-fadeIn ${
                      botSaveMsg.ok
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-rose-50 border-rose-300 text-rose-800"
                    }`}
                  >
                    {botSaveMsg.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                    <span>{botSaveMsg.message}</span>
                  </div>
                )}

                <form onSubmit={handleSaveBotConfig} className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4 text-xs">
                  {/* Bot Token */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Telegram Bot Token (BotFather પાસેથી મળેલ) *
                    </label>
                    <input
                      type="password"
                      value={botConfig.botToken}
                      onChange={(e) => setBotConfig({ ...botConfig, botToken: e.target.value })}
                      placeholder={
                        serverConfigInfo.hasBotToken
                          ? "•••••• ટોકન સર્વર પર સેવ છે — બદલવા નવો ટોકન દાખલ કરો"
                          : "દા.ત. 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className={`text-[11px] mt-1 ${serverConfigInfo.hasBotToken ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}`}>
                      {serverConfigInfo.hasBotToken
                        ? "✅ બોટ ટોકન સર્વર પર સુરક્ષિત રીતે સેવ છે. ખાલી છોડો તો જૂનો ટોકન જ રહેશે."
                        : "⚠️ હજી કોઈ બોટ ટોકન સેવ થયેલ નથી."}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      જો બોટ ન હોય, તો ટેલિગ્રામમાં <strong>@BotFather</strong> ને <code>/newbot</code> કમાન્ડ આપીને મિનિટોમાં બોટ ટોકન મેળવો.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Bot Username */}
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

                    {/* Admin Telegram ID */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        👑 Admin Telegram ID / Username (@ વગર)
                      </label>
                      <input
                        type="text"
                        value={botConfig.adminTelegramId || ""}
                        onChange={(e) => setBotConfig({ ...botConfig, adminTelegramId: e.target.value.replace(/^@/, "").trim() })}
                        placeholder="દા.ત. 123456789 અથવા your_tg_username"
                        className="w-full px-3.5 py-2 rounded-xl border border-purple-300 bg-purple-50/40 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                      />
                      <p className="text-[10px] text-purple-700 mt-1">
                        આ ID ધરાવનાર યુઝર Telegram માં સીધા જ <code>/admin</code>, <code>/dispatch</code> અને <code>/stats</code> કમાન્ડ વાપરી શકશે.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Default Time Per Question */}
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

                    {/* Default Group */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        ડિફોલ્ટ Telegram ગ્રૂપ / ચેનલ ID
                      </label>
                      <input
                        type="text"
                        value={botConfig.targetGroupId || ""}
                        onChange={(e) => setBotConfig({ ...botConfig, targetGroupId: e.target.value })}
                        placeholder="@gsrtc_discussion_group અથવા -100xxxxxxxxxx"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  {/* WebApp / Mini App URL */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>📱 Telegram Mini App HTTPS URL (વૈકલ્પિક)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Telegram requires HTTPS for Mini App</span>
                    </label>
                    <input
                      type="url"
                      value={botConfig.webAppUrl || ""}
                      onChange={(e) => setBotConfig({ ...botConfig, webAppUrl: e.target.value.trim() })}
                      placeholder="દા.ત. https://your-project.vercel.app અથવા ngrok https URL"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      આ લિંક વડે Telegram Mini App ખુલે છે જેથી મોબાઈલમાં યુઝર્સ સરળતાથી ટેસ્ટ બનાવી શકે છે.
                    </p>
                  </div>

                  {/* Action Buttons: Menu Button & Connection Test */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleSetMenuButton}
                      disabled={settingMenuBtn}
                      className="px-3.5 py-2 rounded-xl border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>{settingMenuBtn ? "સેટ થઈ રહ્યું છે..." : "📌 Telegram Mini App Menu Button સેટ કરો"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestBotConnection}
                      disabled={testingBot}
                      className="px-3.5 py-2 rounded-xl border border-sky-300 bg-white hover:bg-sky-50 text-sky-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingBot ? "animate-spin" : ""}`} />
                      <span>{testingBot ? "ચકાસી રહ્યું છે..." : "બોટ કનેક્શન ટેસ્ટ કરો"}</span>
                    </button>

                    <div className="ml-auto">
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        <span>બોટ સેટિંગ્સ સેવ કરો</span>
                      </button>
                    </div>
                  </div>
                </form>

                {/* Webhook Management */}
                <div className="p-4 rounded-3xl bg-white border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                        <Webhook className="w-4 h-4 text-sky-600" />
                        <span>Telegram Webhook (Production)</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Production માં webhook વાપરો જેથી દરેક મેસેજ તરત જ પ્રોસેસ થાય. Localhost પર polling વાપરો.
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                        serverConfigInfo.hasWebhookSecret
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                      }`}
                    >
                      {serverConfigInfo.hasWebhookSecret ? "Secret configured ✓" : "Secret not configured"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleWebhook("set")}
                      disabled={Boolean(webhookBusy) || !serverConfigInfo.hasBotToken}
                      className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Webhook className="w-3.5 h-3.5" />
                      <span>{webhookBusy === "set" ? "સેટ થઈ રહ્યું છે..." : "Webhook સેટ કરો"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWebhook("info")}
                      disabled={Boolean(webhookBusy) || !serverConfigInfo.hasBotToken}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${webhookBusy === "info" ? "animate-spin" : ""}`} />
                      <span>માહિતી જુઓ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWebhook("delete")}
                      disabled={Boolean(webhookBusy) || !serverConfigInfo.hasBotToken}
                      className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Webhook દૂર કરો</span>
                    </button>
                  </div>

                  {webhookMsg && (
                    <div
                      className={`p-3 rounded-xl text-xs font-semibold border break-words ${
                        webhookMsg.ok
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : "bg-rose-50 border-rose-300 text-rose-800"
                      }`}
                    >
                      {webhookMsg.message}
                    </div>
                  )}
                </div>

                {/* Local Polling Runner Section */}
                <div className="p-4 rounded-3xl bg-slate-900 text-white space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">🔄 લોકલ બોટ રનર (Background Polling)</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPollingActive
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {isPollingActive ? "● લાઈવ એક્ટિવ (Polling ON)" : "○ બંધ (Inactive)"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        જ્યારે તમે લોકલહોસ્ટ પર હોવ (Webhook વગર), ત્યારે આ ચાલુ રાખવાથી બોટ ટેલિગ્રામ મેસેજ અને ટેસ્ટ કોડને તરત જ રિસ્પોન્ડ કરશે.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsPollingActive(!isPollingActive)}
                      className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all whitespace-nowrap ${
                        isPollingActive
                          ? "bg-rose-600 hover:bg-rose-700 text-white"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30"
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>{isPollingActive ? "પોલિંગ બંધ કરો" : "લાઈવ પોલિંગ શરૂ કરો"}</span>
                    </button>
                  </div>

                  {pollLogs.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-400 border border-slate-800 space-y-1">
                      <div className="text-[10px] text-slate-500 font-sans font-bold">છેલ્લી બોટ પ્રવૃત્તિ (Recent Updates):</div>
                      {pollLogs.map((log, idx) => (
                        <div key={idx} className="truncate">✓ {log}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Commands and Instructions Card */}
                <div className="p-4 rounded-3xl bg-gradient-to-br from-indigo-50/70 to-purple-50/70 border border-indigo-200/70 space-y-3 text-xs text-slate-700">
                  <div className="font-bold text-indigo-950 flex items-center gap-1.5 text-sm">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>ટેલિગ્રામ ગ્રૂપ & એડમિન વપરાશ માર્ગદર્શિકા (How to Use)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                    <div className="p-3 rounded-2xl bg-white border border-indigo-100 space-y-1.5">
                      <div className="font-bold text-indigo-900 flex items-center gap-1">
                        <span>👥 ટેલિગ્રામ ગ્રૂપમાં મોક ટેસ્ટ શરૂ કરવા:</span>
                      </div>
                      <p>૧. બોટને તમારા ગ્રૂપમાં <strong>Admin</strong> તરીકે ઍડ કરો (Polls & Messages ની પરવાનગી આપો).</p>
                      <p>૨. ગ્રૂપમાં સીધો જ ટેસ્ટ કોડ ટાઈપ કરો: <code className="bg-indigo-50 px-1 py-0.5 rounded text-indigo-700 font-bold">GSRTC-1001</code> અથવા <code className="bg-indigo-50 px-1 py-0.5 rounded text-indigo-700 font-bold">/quiz GSRTC-1001</code></p>
                      <p>૩. બોટ તરત જ ઇન્ટરેક્ટિવ ક્વિઝ પોલ શરૂ કરશે અને અંતે <strong>સ્કોરબોર્ડ ટેબલ</strong> પરિણામ આપશે!</p>
                      <p>૪. કોઈપણ ટેસ્ટનું અગાઉનું પરિણામ જોવા માટે: <code className="bg-indigo-50 px-1 py-0.5 rounded text-indigo-700 font-bold">/results &lt;CODE&gt;</code></p>
                    </div>

                    <div className="p-3 rounded-2xl bg-white border border-indigo-100 space-y-1.5">
                      <div className="font-bold text-purple-900 flex items-center gap-1">
                        <span>👑 ટેલિગ્રામમાંથી એડમિન હેન્ડલિંગ & Mini App:</span>
                      </div>
                      <p>• <strong>/admin</strong> : એડમિન કંટ્રોલ પેનલ મેનુ ખોલો (માત્ર એડમિન ID માટે).</p>
                      <p>• <strong>/dispatch</strong> : તાત્કાલિક ડેઇલી ટેસ્ટ ગ્રૂપમાં રવાના કરો.</p>
                      <p>• <strong>/stats</strong> : સિસ્ટમના તમામ MCQs અને ટેસ્ટના આંકડા જુઓ.</p>
                      <p>• <strong>/start</strong> અથવા <strong>/app</strong> : મોબાઇલ-ફ્રેન્ડલી Telegram Mini App ખોલો જેથી સામાન્ય યુઝર્સ પણ પોતાના પ્રશ્નો/ટેસ્ટ બનાવી શકે.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: SUPABASE DATABASE & ADMIN PASSWORD */}
            {activeTab === "database" && (
              <div className="max-w-3xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Database className="w-5 h-5 text-emerald-600" />
                      <span>Supabase Cloud Database &amp; Admin Security</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      તમારા Supabase PostgreSQL ક્લાઉડ ડેટાબેઝ સાથે જોડાણ અને Admin Password નું કેન્દ્રિય સંચાલન.
                    </p>
                  </div>
                  <button
                    onClick={fetchSupabaseStatus}
                    disabled={loadingSupabase}
                    className="self-start px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSupabase ? "animate-spin" : ""}`} />
                    <span>રિફ્રેશ સ્ટેટસ</span>
                  </button>
                </div>

                {/* Connection Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Supabase REST API
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${supabaseData?.connected ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <span className="font-bold text-slate-900 text-sm">
                        {supabaseData?.connected ? "કનેક્ટેડ (Online)" : "ડિસ્કનેક્ટ"}
                      </span>
                    </div>
                    {supabaseData?.latencyMs ? (
                      <p className="text-[11px] text-emerald-600 font-mono">
                        રેસ્પોન્સ: {supabaseData.latencyMs}ms
                      </p>
                    ) : null}
                  </div>

                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      app_settings ટેબલ
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${supabaseData?.tableExists ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
                      <span className="font-bold text-slate-900 text-sm">
                        {supabaseData?.tableExists ? "એક્ટિવ ✓" : "ટેબલ મળ્યું નથી ⚠️"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {supabaseData?.tableExists ? "SQL સ્કીમા કન્ફિગર થયેલ છે" : "નીચેની SQL સ્ક્રિપ્ટ રન કરો"}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Admin Password સ્ત્રોત
                    </span>
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-slate-900 text-sm">
                        {supabaseData?.hasPinInSupabase ? "Supabase Cloud" : "Local / ENV (Fallback)"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {supabaseData?.hasPinInSupabase ? "ડેટાબેઝમાંથી વેરિફાય થાય છે" : "ડિફોલ્ટ PIN: 7777"}
                    </p>
                  </div>
                </div>

                {/* Password Management Card */}
                <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      <Key className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900 text-sm">
                        Supabase માંથી Admin Password બદલો / સેટ કરો
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        તમે અહીંથી જે પાસવર્ડ સેટ કરશો તે સીધો તમારા Supabase ના <code>app_settings</code> ટેબલમાં સેવ થશે.
                      </p>
                    </div>
                  </div>

                  {supabasePinSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>{supabasePinSuccess}</span>
                    </div>
                  )}

                  {supabasePinError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      <span>{supabasePinError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveSupabasePin} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        નવો Admin Password / PIN દાખલ કરો *
                      </label>
                      <input
                        type="text"
                        value={newSupabasePin}
                        onChange={(e) => setNewSupabasePin(e.target.value)}
                        placeholder="દા.ત. MySecurePass@2026 અથવા 1234"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        પાસવર્ડ ઓછામાં ઓછો ૩ અક્ષરનો હોવો જોઈએ. તમે Supabase ડેશબોર્ડના Table Editor માંથી પણ સીધો <code>admin_pin</code> ની value બદલી શકો છો.
                      </p>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="submit"
                        disabled={savingSupabasePin || !newSupabasePin.trim()}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
                      >
                        {savingSupabasePin ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        <span>Supabase માં સેવ કરો</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* 1-Click SQL Setup Card */}
                <div className="p-5 rounded-3xl bg-slate-900 text-white space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h5 className="font-bold text-sm text-emerald-400 flex items-center gap-1.5">
                        <span>⚡ Supabase SQL Setup Script (1-Click Copy)</span>
                      </h5>
                      <p className="text-xs text-slate-400 mt-0.5">
                        તમારા Supabase માં <code>app_settings</code> ટેબલ બનાવવા માટે નીચેનો SQL કોડ રન કરો.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (supabaseData?.setupSql) {
                            navigator.clipboard.writeText(supabaseData.setupSql);
                            setCopiedSql(true);
                            setTimeout(() => setCopiedSql(false), 2000);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSql ? "કોપી થઈ ગયું! ✓" : "SQL કોપી કરો"}</span>
                      </button>

                      <a
                        href="https://supabase.com/dashboard/project/wfipwaysilwuuueqamuk/sql/new"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Supabase SQL Editor ખોલો</span>
                      </a>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto max-h-48">
                    <pre className="whitespace-pre">{supabaseData?.setupSql || "-- Loading SQL Script..."}</pre>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-300 space-y-1">
                    <span className="font-bold text-amber-300">📌 સ્ટેપ્સ:</span>
                    <p>૧. ઉપર આપેલ બટનથી <strong>SQL કોપી કરો</strong>.</p>
                    <p>૨. <strong>Supabase SQL Editor ખોલો</strong> લિંક પર ક્લિક કરી ક્વેરી બોક્સમાં પેસ્ટ કરો.</p>
                    <p>૩. લીલા રંગના <strong>Run</strong> બટન પર ક્લિક કરો. તરત જ ટેબલ બની જશે અને તમારો એડમિન પાસવર્ડ ક્લાઉડ સાથે કનેક્ટ થઈ જશે!</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Add New Source Paper Google Drive Link */}
        {showAddSourceModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
