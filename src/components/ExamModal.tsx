"use client";

import React, { useState, useEffect } from "react";
import { Paper } from "@/types";
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
  Info
} from "lucide-react";

interface ExamModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExamModal: React.FC<ExamModalProps> = ({ paper, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);

  const questions = paper?.questions || [];
  const totalQuestions = questions.length;

  // Initialize test
  useEffect(() => {
    if (isOpen && paper) {
      setCurrentIndex(0);
      setSelectedAnswers({});
      setIsSubmitted(false);
      setTimeLeft((paper.timeLimitMinutes || 60) * 60);
    }
  }, [isOpen, paper]);

  // Timer countdown
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
    setShowSummaryDrawer(false);

    // Calculate score for celebration
    let correct = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) {
        correct++;
      }
    });

    const percentage = Math.round((correct / totalQuestions) * 100);
    if (percentage >= 50) {
      try {
        confetti({
          particleCount: 80,
          spread: 60,
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

  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[95vh] flex flex-col">
        {/* Top Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2 truncate">
            <BookOpen className="w-5 h-5 flex-shrink-0" />
            <div className="truncate">
              <h3 className="font-bold text-sm truncate">{paper.title}</h3>
              <p className="text-[10px] text-indigo-100">
                {isSubmitted ? "ટેસ્ટ પરિણામ & ઉત્તરાવલી" : "મોક ટેસ્ટ મોડ (Mock Test)"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
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
          /* RESULT SCREEN */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Score Banner */}
            <div className="bg-gradient-to-br from-indigo-50 to-brand-50 rounded-3xl p-6 text-center border border-indigo-100 shadow-inner">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3 shadow-md">
                <Trophy className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-black text-slate-900">ટેસ્ટ પૂર્ણ થઈ ગઈ છે!</h4>
              <p className="text-xs text-slate-600 mt-1">તમારું એકંદર પ્રદર્શન નીચે મુજબ છે</p>

              <div className="mt-4 flex items-center justify-center space-x-2">
                <span className="text-4xl sm:text-5xl font-black text-brand-600">
                  {correctCount}
                </span>
                <span className="text-2xl text-slate-400 font-bold">/ {totalQuestions}</span>
                <span className="text-sm font-bold text-slate-600 bg-white px-2.5 py-1 rounded-full border border-slate-200 ml-2">
                  {scorePercent}%
                </span>
              </div>

              {/* Stats Breakdown */}
              <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-indigo-200/50">
                <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                  <div className="text-emerald-600 font-bold text-lg">{correctCount}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">સાચા જવાબ</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-rose-200 text-center">
                  <div className="text-rose-600 font-bold text-lg">{wrongCount}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">ખોટા જવાબ</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                  <div className="text-slate-600 font-bold text-lg">{unattemptedCount}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">અણઉકેલાયેલા</div>
                </div>
              </div>
            </div>

            {/* Answer Key & Explanation Review */}
            <div className="space-y-3">
              <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>વિગતવાર ઉત્તરાવલી (Detailed Solutions)</span>
              </h5>

              {questions.map((q, idx) => {
                const userAns = selectedAnswers[idx];
                const isCorrect = userAns === q.correctAnswer;
                const isSkipped = userAns === undefined;
                const labels = ["A", "B", "C", "D", "E"];

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border text-xs space-y-2.5 ${
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

                    {/* Options list */}
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
                      <div className="pl-7 pt-1 text-slate-600 bg-white/70 p-2 rounded-xl border border-slate-200/60">
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
              {/* Question progress & Navigation Pill */}
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

              {/* Question Text */}
              {currentQ ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">
                      {currentQ.questionText}
                    </p>
                  </div>

                  {/* Options List */}
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

            {/* Bottom Controls */}
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
                  <span>ટેસ્ટ સબમિટ કરો</span>
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
