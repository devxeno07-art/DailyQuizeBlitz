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
import { X, Trophy, Bot, Copy, Check, PlayCircle, ExternalLink } from "lucide-react";

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

  const totalQuestions = paper.questions?.length || 50;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl bg-[#0f172a] rounded-3xl shadow-2xl overflow-hidden border border-slate-800 max-h-[94vh] flex flex-col text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{paper.title}</h3>
              <p className="text-[11px] text-slate-400">
                લાઈવ સ્કોરબોર્ડ પરિણામ & ટેલિગ્રામ લીડરબોર્ડ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {paper.testCode && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`/quiz ${paper.testCode}`);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/40 text-xs font-mono font-bold hover:bg-sky-500/30 transition-colors"
                title="ટેલિગ્રામ કમાન્ડ કોપી કરો"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>/quiz {paper.testCode}</span>
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-sky-300" />}
              </button>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0"
              title="બંધ કરો"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {loadingAttempts && (
            <p className="text-center text-[11px] text-slate-400">
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
        <div className="px-4 sm:px-5 py-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs text-slate-400">
            કુલ {paper.questions?.length || 0} પ્રશ્નો • કોડ: <span className="font-mono text-sky-400 font-bold">{paper.testCode || "-"}</span>
          </div>

          <div className={`grid ${onTakeTest ? "grid-cols-2" : "grid-cols-1"} sm:flex items-center gap-2 w-full sm:w-auto`}>
            {onTakeTest && (
              <button
                onClick={() => {
                  onClose();
                  onTakeTest(paper);
                }}
                className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
              >
                <PlayCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">ટેસ્ટ આપો</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center"
            >
              બંધ કરો
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
