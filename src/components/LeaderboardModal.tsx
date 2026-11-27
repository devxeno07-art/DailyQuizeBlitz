"use client";

import React, { useState, useEffect } from "react";
import { Paper } from "@/types";
import { LeaderboardCard, LeaderboardEntry } from "./LeaderboardCard";
import {
  getLocalTestAttempts,
  fetchServerTestAttempts,
  PublicTestAttempt,
} from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { X, Trophy, Bot, Copy, Check, PlayCircle } from "lucide-react";

interface LeaderboardModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
  onTakeTest?: (paper: Paper) => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  paper,
  isOpen,
  onClose,
  onTakeTest,
}) => {
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [serverAttempts, setServerAttempts] = useState<PublicTestAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  useEffect(() => {
    if (!isOpen || !paper) return;
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
  }, [isOpen, paper]);

  if (!isOpen || !paper) return null;

  const totalQuestions = paper.questions?.length || paper.questionCount || 50;

  const calculateGrade = (pct: number): string => {
    if (pct >= 85) return "A+";
    if (pct >= 70) return "A";
    if (pct >= 55) return "B";
    if (pct >= 40) return "C";
    if (pct >= 33) return "D";
    return "E";
  };

  // Merge server-synced attempts with local attempts (local wins so the
  // student's own phone number is available for the "You" highlight).
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

  const rawEntries: LeaderboardEntry[] = Array.from(merged.values()).map(
    (attempt) => ({
      rank: 0,
      name: attempt.studentName || "વિદ્યાર્થી",
      score: attempt.score,
      total: attempt.totalQuestions || totalQuestions,
      wrong: attempt.wrongCount,
      percentage: attempt.percentage,
      grade: attempt.grade || calculateGrade(attempt.percentage),
      isCurrentUser: Boolean(
        user?.phoneNumber &&
          attempt.studentPhone &&
          attempt.studentPhone === user.phoneNumber
      ),
    })
  );

  // Sort descending by score, then ascending by wrong count
  rawEntries.sort(
    (a, b) =>
      b.score - a.score || a.wrong - b.wrong || b.percentage - a.percentage
  );

  // Assign ranks
  const entries: LeaderboardEntry[] = rawEntries.slice(0, 20).map((e, idx) => ({
    ...e,
    rank: idx + 1,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[94vh] flex flex-col text-slate-900">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 text-amber-300 flex items-center justify-center font-bold shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">{paper.title}</h3>
              <p className="text-[11px] text-indigo-100 truncate">
                લાઈવ સ્કોરબોર્ડ પરિણામ &amp; ટેલિગ્રામ લીડરબોર્ડ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {paper.testCode && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`/quiz ${paper.testCode}`);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-mono font-bold transition-colors"
                title="ટેલિગ્રામ કમાન્ડ કોપી કરો"
              >
                <Bot className="w-3.5 h-3.5 text-sky-200" />
                <span>/quiz {paper.testCode}</span>
                {copiedCode ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 text-indigo-100" />}
              </button>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
              title="બંધ કરો"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/70 p-3 sm:p-5 space-y-4">
          {loadingAttempts && (
            <p className="text-center text-xs text-slate-500 font-medium">
              પરિણામો લોડ થઈ રહ્યાં છે...
            </p>
          )}
          <LeaderboardCard
            testTitle={paper.title}
            subject={paper.subject || paper.title}
            totalQuestions={totalQuestions}
            timePerQuestion={paper.timeLimitMinutes ? Math.round((paper.timeLimitMinutes * 60) / totalQuestions) : 30}
            testCode={paper.testCode}
            entries={entries}
            webUrl={typeof window !== "undefined" ? window.location.href : "#"}
          />
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs text-slate-500 font-medium">
            કુલ <strong className="text-slate-800">{paper.questions?.length || paper.questionCount || 0}</strong> પ્રશ્નો • કોડ: <span className="font-mono text-indigo-600 font-bold">{paper.testCode || "-"}</span>
          </div>

          <div className={`grid ${onTakeTest ? "grid-cols-2" : "grid-cols-1"} sm:flex items-center gap-2 w-full sm:w-auto`}>
            {onTakeTest && (
              <button
                onClick={() => {
                  onClose();
                  onTakeTest(paper);
                }}
                className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all"
              >
                <PlayCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">ટેસ્ટ આપો</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center justify-center transition-colors"
            >
              બંધ કરો
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
