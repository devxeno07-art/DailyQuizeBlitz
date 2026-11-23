"use client";

import React, { useState, useEffect, useRef } from "react";
import { Paper, TestAttemptResult } from "@/types";
import {
  saveTestAttempt,
  fetchServerTestAttempts,
  PublicTestAttempt,
  getLocalTestAttempts,
} from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import confetti from "canvas-confetti";
import { 
  X, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Share2, 
  Trophy,
  Award,
  BookOpen,
  Info,
  Bot,
  Copy,
  Check
} from "lucide-react";
import { LeaderboardCard, LeaderboardEntry } from "./LeaderboardCard";

interface ExamModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExamModal: React.FC<ExamModalProps> = ({ paper, isOpen, onClose }) => {
  const { user } = useAuth();
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

  const questions = paper?.questions || [];
  const totalQuestions = questions.length;

  useEffect(() => {
    if (isOpen && paper) {
      submittedRef.current = false;
      timerArmedRef.current = false;
      setCurrentIndex(0);
      setSelectedAnswers({});
      setIsSubmitted(false);
      setCurrentAttemptId(null);
      setServerAttempts([]);
      setTimeLeft(Math.max(60, (paper.timeLimitMinutes || 60) * 60));
    } else {
      submittedRef.current = false;
      timerArmedRef.current = false;
    }
  }, [isOpen, paper]);

  // Countdown runs independently of the current answer selection, so a
  // re-render never restarts the interval or loses time.
  useEffect(() => {
    if (!isOpen || isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, isSubmitted]);

  useEffect(() => {
    if (isOpen && !isSubmitted && timeLeft > 0) {
      timerArmedRef.current = true;
    }
  }, [isOpen, isSubmitted, timeLeft]);

  // Auto-submit once when the countdown genuinely reaches zero.
  useEffect(() => {
    if (!isOpen || isSubmitted || timeLeft > 0) return;
    if (!timerArmedRef.current) return;
    timerArmedRef.current = false;
    submitRef.current();
  }, [isOpen, isSubmitted, timeLeft]);

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

  const handleSubmitTest = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setIsSubmitted(true);

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

    const percentage = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
    const grade = calculateGrade(percentage);

    const attempt: TestAttemptResult = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      testCode: paper.testCode || "GSRTC-101",
      paperId: paper.id,
      paperTitle: paper.title,
      subject: paper.subject || paper.category,
      studentName: user?.name || "GSRTC Aspirant",
      studentPhone: user?.phoneNumber || "",
      score: correct,
      totalQuestions: totalQuestions,
      wrongCount: wrong,
      percentage: percentage,
      grade: grade,
      completedAt: new Date().toISOString(),
    };
    setCurrentAttemptId(attempt.id);
    saveTestAttempt(attempt);

    if (percentage >= 40) {
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}
    }
  };

  // Keep the timer's auto-submit callback pointed at the latest answers.
  submitRef.current = handleSubmitTest;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Score calculations
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  questions.forEach((q, idx) => {
    const chosen = selectedAnswers[idx];
    if (chosen === undefined) {
      unattemptedCount++;
    } else if (chosen === q.correctAnswer) {
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const scorePercent = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

  const calculateGrade = (pct: number): string => {
    if (pct >= 85) return "A+";
    if (pct >= 70) return "A";
    if (pct >= 55) return "B";
    if (pct >= 40) return "C";
    if (pct >= 33) return "D";
    return "E";
  };

  // Build leaderboard entries from real attempts (local + server sync).
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

    // Always include the attempt the student just finished, even if the
    // server sync has not completed yet.
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

  const leaderboardList = buildLeaderboardEntries();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[96vh] flex flex-col">
        {/* Top Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2 truncate">
            <BookOpen className="w-5 h-5 flex-shrink-0" />
            <div className="truncate">
              <h3 className="font-bold text-sm truncate">{paper.title}</h3>
              <p className="text-[10px] text-indigo-100">
                {isSubmitted ? "ટેસ્ટ પરિણામ & સ્કોરબોર્ડ" : "મોક ટેસ્ટ મોડ (Mock Test)"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
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

            {!isSubmitted && (
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

        {/* Test Body */}
        {isSubmitted ? (
          /* RESULT SCREEN WITH LEADERBOARD TABLE */
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-6">
            {/* The exact Leaderboard & Scoreboard Table from user's screenshot */}
            <LeaderboardCard
              testTitle={paper.title}
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
                        <span className="w-5 h-5 rounded-md bg-white border border-slate-200 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          {q.questionText}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase flex-shrink-0 ${
                        isCorrect
                          ? "bg-emerald-600 text-white"
                          : isSkipped
                          ? "bg-slate-200 text-slate-700"
                          : "bg-rose-600 text-white"
                      }`}>
                        {isCorrect ? "સાચો" : isSkipped ? "છોડી દીધો" : "ખોટો"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-7">
                      {q.options.map((opt, optIdx) => {
                        const isCorrectOption = q.correctAnswer === optIdx;
                        const isUserChoice = userAns === optIdx;

                        let optClass = "bg-white border-slate-200 text-slate-700";
                        if (isCorrectOption) {
                          optClass = "bg-emerald-50 border-emerald-400 font-bold text-emerald-900 ring-1 ring-emerald-400";
                        } else if (isUserChoice && !isCorrectOption) {
                          optClass = "bg-rose-50 border-rose-400 text-rose-900 font-medium line-through";
                        }

                        return (
                          <div key={optIdx} className={`p-2 rounded-xl border flex items-center gap-2 ${optClass}`}>
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

            {/* Bottom Actions */}
            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                onClick={() => {
                  submittedRef.current = false;
                  timerArmedRef.current = false;
                  setSelectedAnswers({});
                  setIsSubmitted(false);
                  setCurrentIndex(0);
                  setCurrentAttemptId(null);
                  setServerAttempts([]);
                  setTimeLeft(Math.max(60, (paper.timeLimitMinutes || 60) * 60));
                }}
                className="px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 hover:bg-brand-700 flex items-center space-x-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ટેસ્ટ ફરીથી આપો</span>
              </button>
            </div>
          </div>
        ) : (
          /* ACTIVE TEST QUESTION VIEW */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
                  પ્રશ્ન {currentIndex + 1} / {totalQuestions}
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
                          <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                            isSelected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
                          }`}>
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
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 disabled:opacity-30 flex items-center space-x-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">પાછળ</span>
              </button>

              <button
                type="button"
                onClick={handleClearAnswer}
                disabled={selectedAnswers[currentIndex] === undefined}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-30"
              >
                જવાબ સાફ કરો
              </button>

              {currentIndex === totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={handleSubmitTest}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center space-x-1"
                >
                  <span>ટેસ્ટ સબમિટ કરો & પરિણામ જુઓ</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 flex items-center space-x-1"
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
