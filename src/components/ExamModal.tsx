"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Paper, Question, TestAttemptResult } from "@/types";
import {
  saveTestAttempt,
  fetchServerTestAttempts,
  PublicTestAttempt,
  getLocalTestAttempts,
} from "@/lib/storage";
import {
  divideQuestionsIntoSets,
  getSetCompletionInfo,
  getStudentPaperProgress,
  markStudentSetCompleted,
  QuestionSet,
  resetStudentPaperProgress,
  savePreferredSetSize,
  StudentPaperProgress,
} from "@/lib/testSets";
import { useAuth } from "@/context/AuthContext";
import confetti from "canvas-confetti";
import {
  X,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  BookOpen,
  Bot,
  Copy,
  Check,
  Layers,
  Play,
  Shuffle,
  ListOrdered,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { LeaderboardCard, LeaderboardEntry } from "./LeaderboardCard";

interface ExamModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
}

const SET_SIZE_PRESETS = [20, 25, 30, 40, 50, 100];

const shuffleArray = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const ExamModal: React.FC<ExamModalProps> = ({ paper, isOpen, onClose }) => {
  const { user } = useAuth();

  // Mode: "lobby" (Set Splitter & Progress) | "exam" | "result"
  const [viewMode, setViewMode] = useState<"lobby" | "exam" | "result">("lobby");
  const [splitMode, setSplitMode] = useState<"sets" | "full">("sets");
  const [setSize, setSetSize] = useState<number>(30);
  const [customSetInput, setCustomSetInput] = useState<string>("30");
  const [shuffleWithinSet, setShuffleWithinSet] = useState<boolean>(false);
  const [setFilter, setSetFilter] = useState<"all" | "pending" | "completed">("all");
  const [studentProgress, setStudentProgress] = useState<StudentPaperProgress | null>(null);

  // Active exam slice
  const [activeSet, setActiveSet] = useState<QuestionSet | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);

  // Exam running state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [copiedHeaderCode, setCopiedHeaderCode] = useState(false);
  const [showTimerPopover, setShowTimerPopover] = useState(false);
  const [customAddMinutes, setCustomAddMinutes] = useState<number>(10);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [serverAttempts, setServerAttempts] = useState<PublicTestAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  const submittedRef = useRef(false);
  const timerArmedRef = useRef(false);
  const submitRef = useRef<() => void>(() => {});

  const allQuestions = useMemo(() => paper?.questions || [], [paper]);

  // Compute sets for the paper
  const questionSets = useMemo(() => {
    if (!paper || allQuestions.length === 0) return [];
    const baseKey = paper.testCode || paper.id;
    return divideQuestionsIntoSets(baseKey, allQuestions, setSize);
  }, [paper, allQuestions, setSize]);

  // Initialize on modal open
  useEffect(() => {
    if (isOpen && paper) {
      submittedRef.current = false;
      timerArmedRef.current = false;
      setSelectedAnswers({});
      setIsSubmitted(false);
      setCurrentIndex(0);
      setCurrentAttemptId(null);
      setServerAttempts([]);
      setShowTimerPopover(false);

      const defaultSize =
        allQuestions.length >= 100 ? 50 : allQuestions.length >= 40 ? 30 : 20;
      const prog = getStudentPaperProgress(
        paper.id,
        paper.testCode,
        user?.phoneNumber,
        defaultSize
      );
      setStudentProgress(prog);
      const chosenSize = prog.preferredSetSize || defaultSize;
      setSetSize(chosenSize);
      setCustomSetInput(String(chosenSize));
      setSetFilter("all");

      if (allQuestions.length > 15) {
        // Large paper -> show Set Splitter Lobby first
        setSplitMode("sets");
        setViewMode("lobby");
        setActiveSet(null);
        setActiveQuestions([]);
      } else {
        // Small paper (<= 15 Qs) -> start immediately, user can still open Sets lobby from header
        setSplitMode("full");
        setActiveSet(null);
        setActiveQuestions(allQuestions);
        setTimeLeft(Math.max(60, (paper.timeLimitMinutes || 20) * 60));
        setViewMode("exam");
      }
    } else {
      submittedRef.current = false;
      timerArmedRef.current = false;
    }
  }, [isOpen, paper, user?.phoneNumber, allQuestions]);

  // Countdown runs only while actively taking an exam
  useEffect(() => {
    if (!isOpen || viewMode !== "exam" || isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, viewMode, isSubmitted]);

  useEffect(() => {
    if (isOpen && viewMode === "exam" && !isSubmitted && timeLeft > 0) {
      timerArmedRef.current = true;
    }
  }, [isOpen, viewMode, isSubmitted, timeLeft]);

  // Auto-submit once when the countdown genuinely reaches zero.
  useEffect(() => {
    if (!isOpen || viewMode !== "exam" || isSubmitted || timeLeft > 0) return;
    if (!timerArmedRef.current) return;
    timerArmedRef.current = false;
    submitRef.current();
  }, [isOpen, viewMode, isSubmitted, timeLeft]);

  // Load real peer attempts from the server for the result leaderboard.
  useEffect(() => {
    if (!isOpen || !isSubmitted || !paper) return;
    let active = true;
    setLoadingAttempts(true);
    fetchServerTestAttempts(paper.testCode || paper.id).then((list) => {
      if (!active) return;
      setServerAttempts(list);
      setLoadingAttempts(false);
    });
    return () => {
      active = false;
    };
  }, [isOpen, isSubmitted, paper]);

  if (!isOpen || !paper) return null;

  const startTestWithQuestions = (
    questionsToRun: Question[],
    targetSet: QuestionSet | null
  ) => {
    submittedRef.current = false;
    timerArmedRef.current = false;
    const ordered = shuffleWithinSet ? shuffleArray(questionsToRun) : questionsToRun;

    setActiveSet(targetSet);
    setActiveQuestions(ordered);
    setSelectedAnswers({});
    setIsSubmitted(false);
    setCurrentIndex(0);
    setCurrentAttemptId(null);
    setServerAttempts([]);
    setShowTimerPopover(false);

    const suggestedMins = targetSet
      ? Math.max(5, targetSet.questionCount)
      : Math.max(5, paper.timeLimitMinutes || ordered.length || 30);
    setTimeLeft(suggestedMins * 60);
    setViewMode("exam");
  };

  const handleSelectSetSize = (size: number) => {
    const valid = Math.max(1, Math.min(allQuestions.length || 1, Math.floor(size)));
    setSetSize(valid);
    setCustomSetInput(String(valid));
    savePreferredSetSize(paper.id, paper.testCode, user?.phoneNumber, valid);
  };

  const handleResetProgress = () => {
    if (
      confirm(
        "શું તમે આ ટેસ્ટની બધી પૂર્ણ કરેલ સેટ્સની પ્રગતિ રીસેટ કરવા માંગો છો?"
      )
    ) {
      resetStudentPaperProgress(paper.id, paper.testCode, user?.phoneNumber);
      setStudentProgress(
        getStudentPaperProgress(paper.id, paper.testCode, user?.phoneNumber, setSize)
      );
    }
  };

  const questions = activeQuestions;
  const totalQuestions = questions.length;
  const currentQ = questions[currentIndex];

  const handleSelectOption = (optIndex: number) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentIndex]: optIndex,
    }));
  };

  const handleClearAnswer = () => {
    if (isSubmitted) return;
    const copy = { ...selectedAnswers };
    delete copy[currentIndex];
    setSelectedAnswers(copy);
  };

  const calculateGrade = (pct: number): string => {
    if (pct >= 85) return "A+";
    if (pct >= 70) return "A";
    if (pct >= 55) return "B";
    if (pct >= 40) return "C";
    if (pct >= 33) return "D";
    return "E";
  };

  const handleSubmitTest = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setIsSubmitted(true);
    setViewMode("result");

    let correct = 0;
    let wrong = 0;
    questions.forEach((q, idx) => {
      const ans = selectedAnswers[idx];
      if (ans === q.correctAnswer) {
        correct++;
      } else if (ans !== undefined) {
        wrong++;
      }
    });

    const percentage =
      totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
    const grade = calculateGrade(percentage);

    // Update student set & question progress
    const targetSetMeta = activeSet || {
      setNumber: 1,
      setSize: allQuestions.length,
      startIndex: 0,
      endIndex: allQuestions.length,
      startQuestion: 1,
      endQuestion: allQuestions.length,
    };

    const updatedProgress = markStudentSetCompleted(
      paper.id,
      paper.testCode,
      user?.phoneNumber,
      targetSetMeta,
      correct,
      totalQuestions,
      percentage
    );
    setStudentProgress(updatedProgress);

    const attempt: TestAttemptResult = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      testCode: paper.testCode || "GSRTC-101",
      paperId: paper.id,
      paperTitle: activeSet ? `${paper.title} [${activeSet.label}]` : paper.title,
      subject: paper.subject || paper.category,
      studentName: user?.name || "GSRTC Aspirant",
      studentPhone: user?.phoneNumber || "",
      score: correct,
      totalQuestions: totalQuestions,
      wrongCount: wrong,
      percentage: percentage,
      grade: grade,
      setKey: activeSet?.key,
      setNumber: activeSet?.setNumber,
      setSize: activeSet?.setSize,
      setLabel: activeSet?.label,
      completedAt: new Date().toISOString(),
    };
    setCurrentAttemptId(attempt.id);
    saveTestAttempt(attempt);

    if (percentage >= 40) {
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    }
  };

  submitRef.current = handleSubmitTest;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Score calculations
  let correctCount = 0;
  let wrongCount = 0;

  questions.forEach((q, idx) => {
    const chosen = selectedAnswers[idx];
    if (chosen === q.correctAnswer) {
      correctCount++;
    } else if (chosen !== undefined) {
      wrongCount++;
    }
  });

  const scorePercent = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

  // Overall progress calculations for Lobby
  const completedQuestionCount = studentProgress?.completedIndices?.length || 0;
  const remainingQuestionCount = Math.max(0, allQuestions.length - completedQuestionCount);
  const overallPercent =
    allQuestions.length > 0
      ? Math.min(100, Math.round((completedQuestionCount / allQuestions.length) * 100))
      : 0;

  const setStatuses = questionSets.map((s) => ({
    set: s,
    status: studentProgress
      ? getSetCompletionInfo(s, studentProgress)
      : { isCompleted: false, coveredCount: 0 },
  }));

  const completedSetsCount = setStatuses.filter((item) => item.status.isCompleted).length;
  const remainingSetsCount = setStatuses.length - completedSetsCount;
  const nextPendingSet = setStatuses.find((item) => !item.status.isCompleted)?.set || null;

  const filteredSetStatuses = setStatuses.filter((item) => {
    if (setFilter === "pending") return !item.status.isCompleted;
    if (setFilter === "completed") return item.status.isCompleted;
    return true;
  });

  // Next set after currently active set
  const nextSetAfterCurrent =
    activeSet && activeSet.setNumber < questionSets.length
      ? questionSets[activeSet.setNumber]
      : nextPendingSet;

  const buildLeaderboardEntries = (): LeaderboardEntry[] => {
    const merged = new Map<
      string,
      {
        id: string;
        studentName: string;
        studentPhone?: string;
        score: number;
        totalQuestions: number;
        wrongCount: number;
        percentage: number;
        grade: string;
      }
    >();

    serverAttempts.forEach((attempt) => merged.set(attempt.id, attempt));
    getLocalTestAttempts(paper.testCode || paper.id).forEach((attempt) => {
      merged.set(attempt.id, attempt);
    });

    const entries: LeaderboardEntry[] = Array.from(merged.values()).map(
      (attempt) => ({
        rank: 0,
        name: attempt.studentName || "વિદ્યાર્થી",
        score: attempt.score,
        total: attempt.totalQuestions || totalQuestions,
        wrong: attempt.wrongCount,
        percentage: attempt.percentage,
        grade: attempt.grade || calculateGrade(attempt.percentage),
        isCurrentUser:
          attempt.id === currentAttemptId ||
          Boolean(
            user?.phoneNumber &&
              attempt.studentPhone &&
              attempt.studentPhone === user.phoneNumber &&
              attempt.id === currentAttemptId
          ),
      })
    );

    if (!entries.some((entry) => entry.isCurrentUser)) {
      entries.push({
        rank: 0,
        name: user?.name || "તમે (You)",
        score: correctCount,
        total: totalQuestions,
        wrong: wrongCount,
        percentage: scorePercent,
        grade: calculateGrade(scorePercent),
        isCurrentUser: true,
      });
    }

    entries.sort(
      (a, b) =>
        b.score - a.score ||
        a.wrong - b.wrong ||
        b.percentage - a.percentage
    );

    return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
  };

  const leaderboardList = viewMode === "result" ? buildLeaderboardEntries() : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[96vh] flex flex-col">
        {/* Top Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 truncate min-w-0">
            <BookOpen className="w-5 h-5 flex-shrink-0" />
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm truncate">{paper.title}</h3>
                {activeSet && viewMode !== "lobby" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap">
                    {activeSet.label}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-indigo-100">
                {viewMode === "lobby"
                  ? `ટેસ્ટ સેટ પસંદગી • કુલ ${allQuestions.length} MCQs`
                  : isSubmitted
                  ? "ટેસ્ટ પરિણામ & સ્કોરબોર્ડ"
                  : `મોક ટેસ્ટ મોડ (${totalQuestions} પ્રશ્નો)`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {viewMode !== "lobby" && allQuestions.length > 5 && (
              <button
                type="button"
                onClick={() => {
                  submittedRef.current = false;
                  timerArmedRef.current = false;
                  setIsSubmitted(false);
                  setViewMode("lobby");
                }}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full text-xs font-bold transition-colors"
                title="સેટ્સ લિસ્ટ પર જાઓ"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">સેટ્સ</span>
              </button>
            )}

            {paper.testCode && (
              <div
                onClick={() => {
                  navigator.clipboard.writeText(`/quiz ${paper.testCode}`);
                  setCopiedHeaderCode(true);
                  setTimeout(() => setCopiedHeaderCode(false), 2000);
                }}
                className="hidden sm:inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full text-xs font-mono font-bold cursor-pointer transition-colors"
                title="ટેલિગ્રામ કમાન્ડ કોપી કરો"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>કોડ: {paper.testCode}</span>
                {copiedHeaderCode ? (
                  <Check className="w-3 h-3 text-emerald-300" />
                ) : (
                  <Copy className="w-3 h-3 text-white/80" />
                )}
              </div>
            )}

            {viewMode === "exam" && !isSubmitted && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTimerPopover(!showTimerPopover)}
                  className="flex items-center space-x-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full text-xs font-mono font-bold transition-all border border-white/20"
                  title="સમય બદલો / ટાઈમ ઉમેરો (Adjust Timer)"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTimer(timeLeft)}</span>
                  <span className="text-[10px] bg-white/30 px-1 rounded hover:bg-white/40">+/-</span>
                </button>

                {showTimerPopover && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white text-slate-800 rounded-2xl shadow-2xl p-3 border border-slate-200 z-50 animate-fadeIn text-xs space-y-2.5">
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-brand-600" />
                        <span>ટેસ્ટ સમય કસ્ટમાઇઝ કરો</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowTimerPopover(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">ઝડપી સમય ઉમેરો:</span>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {[5, 10, 15].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setTimeLeft((prev) => prev + m * 60);
                              setShowTimerPopover(false);
                            }}
                            className="px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-lg border border-brand-200 text-xs"
                          >
                            +{m} Min
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 font-medium">કસ્ટમ મિનિટ સેટ કરો:</span>
                      <div className="flex gap-1.5 mt-1">
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={customAddMinutes}
                          onChange={(e) => setCustomAddMinutes(Math.max(1, Number(e.target.value)))}
                          className="w-16 px-2 py-1 border border-slate-300 rounded-lg font-mono font-bold text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setTimeLeft(customAddMinutes * 60);
                            setShowTimerPopover(false);
                          }}
                          className="flex-1 px-2 py-1 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs"
                        >
                          સેટ કરો
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY */}
        {viewMode === "lobby" ? (
          /* SET SPLITTER & PROGRESS LOBBY */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
            {/* Overall Progress Card */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>તમારી આ ટેસ્ટની પ્રગતિ (Completion Tracker)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    કુલ {allQuestions.length} પ્રશ્નોમાંથી કેટલા પ્રશ્નો પૂરા થયા અને કેટલા બાકી છે તે અહીં દેખાશે.
                  </p>
                </div>

                {completedQuestionCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetProgress}
                    className="self-start sm:self-auto px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>પ્રગતિ રીસેટ કરો</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                  <div className="text-[10px] text-indigo-600 font-bold uppercase">કુલ MCQs</div>
                  <div className="text-base sm:text-lg font-black text-indigo-900 font-mono">
                    {allQuestions.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] text-emerald-700 font-bold uppercase">✅ પૂર્ણ થયેલ</div>
                  <div className="text-base sm:text-lg font-black text-emerald-800 font-mono">
                    {completedQuestionCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] text-amber-700 font-bold uppercase">⏳ બાકી રહેલ</div>
                  <div className="text-base sm:text-lg font-black text-amber-800 font-mono">
                    {remainingQuestionCount}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-600">
                    {completedSetsCount} / {questionSets.length} Sets પૂર્ણ
                  </span>
                  <span className="text-indigo-700 font-mono">{overallPercent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Mode & Set Size Configuration */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSplitMode("sets")}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                    splitMode === "sets"
                      ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Layers className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-xs sm:text-sm">📚 અલગ અલગ સેટ્સ (Sets)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      ૩૦, ૪૦, કે ૫૦ પ્રશ્નોના નાના ભાગમાં વહેંચીને આપો
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSplitMode("full")}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                    splitMode === "full"
                      ? "bg-brand-50 border-brand-500 ring-2 ring-brand-500/20 text-brand-950"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-xs sm:text-sm">📝 આખું પેપર ({allQuestions.length} Qs)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      તમામ {allQuestions.length} પ્રશ્નોનો ટેસ્ટ એકસાથે આપો
                    </div>
                  </div>
                </button>
              </div>

              {splitMode === "sets" ? (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800">
                      દરેક સેટમાં કેટલા પ્રશ્નો રાખવા? (Questions per Set)
                    </label>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                      {allQuestions.length} MCQs ÷ {setSize} = {questionSets.length} Sets
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {SET_SIZE_PRESETS.map((num) => {
                      if (num > allQuestions.length && num !== 20) return null;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleSelectSetSize(num)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                            setSize === num
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {num} MCQs/Set
                        </button>
                      );
                    })}
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[11px] text-slate-500 font-semibold">કસ્ટમ:</span>
                      <input
                        type="number"
                        min={5}
                        max={Math.max(5, allQuestions.length)}
                        value={customSetInput}
                        onChange={(e) => {
                          setCustomSetInput(e.target.value);
                          const val = Number(e.target.value);
                          if (val >= 5) handleSelectSetSize(val);
                        }}
                        className="w-16 px-2 py-1 rounded-xl border border-slate-300 font-mono font-bold text-xs text-center"
                      />
                    </div>
                  </div>

                  {/* Order Toggle + Quick Continue CTA */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShuffleWithinSet(!shuffleWithinSet)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors self-start ${
                        shuffleWithinSet
                          ? "bg-amber-50 border-amber-300 text-amber-800"
                          : "bg-slate-50 border-slate-200 text-slate-700"
                      }`}
                    >
                      {shuffleWithinSet ? (
                        <>
                          <Shuffle className="w-3.5 h-3.5" />
                          <span>સેટની અંદર પ્રશ્નો શફલ થશે</span>
                        </>
                      ) : (
                        <>
                          <ListOrdered className="w-3.5 h-3.5" />
                          <span>ક્રમ અનુસાર (Q1 → Q{allQuestions.length})</span>
                        </>
                      )}
                    </button>

                    {nextPendingSet && (
                      <button
                        type="button"
                        onClick={() =>
                          startTestWithQuestions(nextPendingSet.questions, nextPendingSet)
                        }
                        className="w-full sm:w-auto h-10 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-brand-600 hover:from-indigo-700 hover:to-brand-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Play className="w-3.5 h-3.5 fill-current flex-shrink-0" />
                        <span className="truncate">આગલો સેટ: {nextPendingSet.label}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-xs text-slate-600">
                    તમામ <strong>{allQuestions.length} પ્રશ્નો</strong> એક જ ટેસ્ટમાં આવશે. (સમય: ~{Math.max(5, paper.timeLimitMinutes || allQuestions.length)} મિનિટ)
                  </div>
                  <button
                    type="button"
                    onClick={() => startTestWithQuestions(allQuestions, null)}
                    className="w-full sm:w-auto h-10 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 flex-shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>આખો ટેસ્ટ શરૂ કરો</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sets Grid */}
            {splitMode === "sets" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    તમામ સેટ્સ ({questionSets.length}) • બાકી: {remainingSetsCount} • પૂર્ણ: {completedSetsCount}
                  </h5>

                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setSetFilter("all")}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        setFilter === "all"
                          ? "bg-slate-800 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      બધા ({questionSets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetFilter("pending")}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        setFilter === "pending"
                          ? "bg-amber-500 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      ⏳ બાકી ({remainingSetsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetFilter("completed")}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        setFilter === "completed"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      ✅ પૂર્ણ ({completedSetsCount})
                    </button>
                  </div>
                </div>

                {filteredSetStatuses.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    {setFilter === "pending"
                      ? "🎉 વાહ! તમે બધા જ સેટ્સ પૂર્ણ કરી લીધા છે!"
                      : "હજુ સુધી કોઈ સેટ પૂર્ણ કરેલ નથી. નીચેનામાંથી કોઈપણ સેટ શરૂ કરો."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {filteredSetStatuses.map(({ set, status }) => (
                      <div
                        key={set.key}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          status.isCompleted
                            ? "bg-emerald-50/70 border-emerald-200 hover:border-emerald-300"
                            : "bg-white border-slate-200 hover:border-indigo-300 shadow-xs"
                        }`}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                status.isCompleted
                                  ? "bg-emerald-600 text-white"
                                  : "bg-indigo-100 text-indigo-800"
                              }`}
                            >
                              Set {set.setNumber}
                            </span>
                            <span className="font-bold text-slate-900 text-xs">
                              પ્રશ્ન {set.startQuestion} – {set.endQuestion}
                            </span>
                          </div>

                          <div className="text-[11px] flex items-center gap-2 flex-wrap">
                            <span className="text-slate-500 font-medium">
                              {set.questionCount} MCQs
                            </span>
                            {status.isCompleted ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                {status.summary
                                  ? `પૂર્ણ (${status.summary.score}/${status.summary.total} • ${status.summary.percentage}%)`
                                  : `પૂર્ણ (${status.coveredCount}/${set.questionCount})`}
                              </span>
                            ) : status.coveredCount > 0 ? (
                              <span className="text-amber-700 font-semibold">
                                ⏳ અંશતઃ ({status.coveredCount}/{set.questionCount} પૂર્ણ)
                              </span>
                            ) : (
                              <span className="text-amber-700 font-semibold">
                                ⏳ બાકી છે
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => startTestWithQuestions(set.questions, set)}
                          className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1 flex-shrink-0 transition-all ${
                            status.isCompleted
                              ? "bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                          }`}
                        >
                          {status.isCompleted ? (
                            <>
                              <RotateCcw className="w-3 h-3" />
                              <span>ફરી આપો</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current" />
                              <span>શરૂ કરો</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : viewMode === "result" ? (
          /* RESULT SCREEN WITH LEADERBOARD TABLE */
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-6">
            <LeaderboardCard
              testTitle={activeSet ? `${paper.title} [${activeSet.label}]` : paper.title}
              subject={paper.subject || paper.title}
              totalQuestions={totalQuestions}
              timePerQuestion={30}
              testCode={paper.testCode}
              entries={leaderboardList}
              webUrl={typeof window !== "undefined" ? window.location.href : "#"}
            />
            {loadingAttempts && (
              <p className="text-center text-[11px] text-slate-400 -mt-3">
                અન્ય વિદ્યાર્થીઓના પરિણામ લોડ થઈ રહ્યાં છે...
              </p>
            )}

            {/* Quick Set Navigation Actions */}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {nextSetAfterCurrent && activeSet && (
                <button
                  type="button"
                  onClick={() =>
                    startTestWithQuestions(nextSetAfterCurrent.questions, nextSetAfterCurrent)
                  }
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-brand-600 hover:from-indigo-700 hover:to-brand-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>આગલો સેટ આપો: {nextSetAfterCurrent.label}</span>
                </button>
              )}

              {allQuestions.length > 15 && (
                <button
                  type="button"
                  onClick={() => {
                    submittedRef.current = false;
                    setIsSubmitted(false);
                    setViewMode("lobby");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>બધા સેટ્સ & પ્રગતિ જુઓ</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => startTestWithQuestions(activeQuestions, activeSet)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>આ ટેસ્ટ ફરીથી આપો</span>
              </button>
            </div>

            {/* Answer Key & Explanation Review */}
            <div className="space-y-3 pt-2">
              <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>વિગતવાર ઉત્તરાવલી & સોલ્યુશન (Answer Key Review)</span>
              </h5>

              {questions.map((q, idx) => {
                const userAns = selectedAnswers[idx];
                const isCorrect = userAns === q.correctAnswer;
                const isSkipped = userAns === undefined;
                const labels = ["A", "B", "C", "D", "E"];
                const displayQNum = activeSet ? activeSet.startQuestion + idx : idx + 1;

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                      isCorrect
                        ? "bg-emerald-50/40 border-emerald-200"
                        : isSkipped
                        ? "bg-slate-50 border-slate-200"
                        : "bg-rose-50/40 border-rose-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="px-1.5 h-5 rounded-md bg-white border border-slate-200 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                          {displayQNum}
                        </span>
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          {q.questionText}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase flex-shrink-0 ${
                          isCorrect
                            ? "bg-emerald-600 text-white"
                            : isSkipped
                            ? "bg-slate-200 text-slate-700"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        {isCorrect ? "સાચો" : isSkipped ? "છોડી દીધો" : "ખોટો"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-7">
                      {q.options.map((opt, optIdx) => {
                        const isCorrectOption = q.correctAnswer === optIdx;
                        const isUserChoice = userAns === optIdx;

                        let optClass = "bg-white border-slate-200 text-slate-700";
                        if (isCorrectOption) {
                          optClass =
                            "bg-emerald-50 border-emerald-400 font-bold text-emerald-900 ring-1 ring-emerald-400";
                        } else if (isUserChoice && !isCorrectOption) {
                          optClass =
                            "bg-rose-50 border-rose-400 text-rose-900 font-medium line-through";
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`p-2 rounded-xl border flex items-center gap-2 ${optClass}`}
                          >
                            <span className="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center bg-slate-100 text-slate-700">
                              {labels[optIdx]}
                            </span>
                            <span className="truncate">{opt}</span>
                            {isCorrectOption && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-auto flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="pl-7 pt-1 text-slate-600 bg-white/80 p-2 rounded-xl border border-slate-200/60">
                        💡 <strong>સમજૂતી:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ACTIVE TEST QUESTION VIEW */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
                  પ્રશ્ન {currentIndex + 1} / {totalQuestions}
                  {activeSet ? ` (મૂળ Q#${activeSet.startQuestion + currentIndex})` : ""}
                </span>

                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-slate-500">
                    જવાબ આપ્યા: {Object.keys(selectedAnswers).length}
                  </span>
                </div>
              </div>

              {currentQ ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">
                      {currentQ.questionText}
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {currentQ.options.map((opt, optIndex) => {
                      const isSelected = selectedAnswers[currentIndex] === optIndex;
                      const labels = ["A", "B", "C", "D", "E"];

                      return (
                        <button
                          key={optIndex}
                          type="button"
                          onClick={() => handleSelectOption(optIndex)}
                          className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all transform active:scale-[0.99] ${
                            isSelected
                              ? "border-brand-500 bg-brand-50/80 ring-2 ring-brand-500 shadow-sm"
                              : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                              isSelected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {labels[optIndex]}
                          </span>
                          <span className="text-xs sm:text-sm font-medium flex-1">
                            {opt}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-brand-600 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">કોઈ પ્રશ્ન નથી</div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="h-10 px-3.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center space-x-1 flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>પાછળ</span>
              </button>

              <button
                type="button"
                onClick={handleClearAnswer}
                disabled={selectedAnswers[currentIndex] === undefined}
                className="h-10 px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-30 whitespace-nowrap"
              >
                સાફ કરો
              </button>

              {currentIndex === totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={handleSubmitTest}
                  className="h-10 px-4 sm:px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center space-x-1 flex-shrink-0"
                >
                  <span>સબમિટ કરો</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  className="h-10 px-4 sm:px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm flex items-center justify-center space-x-1 flex-shrink-0"
                >
                  <span>આગળ</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
