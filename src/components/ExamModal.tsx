"use client";

import React, { useState, useEffect } from "react";
import { Paper } from "@/types";
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

  const questions = paper?.questions || [];
  const totalQuestions = questions.length;

  useEffect(() => {
    if (isOpen && paper) {
      setCurrentIndex(0);
      setSelectedAnswers({});
      setIsSubmitted(false);
      setTimeLeft((paper.timeLimitMinutes || 60) * 60);
    }
  }, [isOpen, paper]);

  useEffect(() => {
    if (!isOpen || isSubmitted || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isSubmitted, timeLeft]);

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
    setIsSubmitted(true);

    let correct = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) {
        correct++;
      }
    });

    const percentage = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
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

  // Build Leaderboard Entries matching user's requested table format
  const buildLeaderboardEntries = (): LeaderboardEntry[] => {
    const userName = user?.name || "તમે (You)";
    const userGrade = calculateGrade(scorePercent);

    // Realistic competitors for group scoreboard context
    const peers = [
      { name: "Sizuu 💖 Rtw", scoreRatio: 0.72, wrongFactor: 0.2 },
      { name: "Jãy ...", scoreRatio: 0.65, wrongFactor: 0.25 },
      { name: "આદિવાસી રાઠવા 🌿🏹", scoreRatio: 0.58, wrongFactor: 0.3 },
      { name: "Dolly Rtw 💙", scoreRatio: 0.52, wrongFactor: 0.35 },
      { name: "Geeta", scoreRatio: 0.44, wrongFactor: 0.4 },
      { name: "Azuuu 1026", scoreRatio: 0.35, wrongFactor: 0.45 },
    ];

    const allParticipants = [
      {
        name: userName,
        score: correctCount,
        total: totalQuestions,
        wrong: wrongCount,
        percentage: scorePercent,
        grade: userGrade,
        isCurrentUser: true,
      },
      ...peers.map((p) => {
        const pScore = Math.max(1, Math.min(totalQuestions, Math.round(totalQuestions * p.scoreRatio)));
        const pWrong = Math.max(0, Math.min(totalQuestions - pScore, Math.round(totalQuestions * p.wrongFactor)));
        const pPct = totalQuestions > 0 ? (pScore / totalQuestions) * 100 : 0;
        return {
          name: p.name,
          score: pScore,
          total: totalQuestions,
          wrong: pWrong,
          percentage: pPct,
          grade: calculateGrade(pPct),
          isCurrentUser: false,
        };
      }),
    ];

    // Sort by Score descending, then by wrong count ascending
    allParticipants.sort((a, b) => b.score - a.score || a.wrong - b.wrong);

    // Assign rank 1, 2, 3...
    return allParticipants.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
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
              <div className="flex items-center space-x-1 bg-white/20 px-2.5 py-1 rounded-full text-xs font-mono font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTimer(timeLeft)}</span>
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
                  setSelectedAnswers({});
                  setIsSubmitted(false);
                  setCurrentIndex(0);
                  setTimeLeft((paper.timeLimitMinutes || 60) * 60);
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
