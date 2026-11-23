"use client";

import React, { useState } from "react";
import { Paper } from "@/types";
import { LeaderboardCard, LeaderboardEntry } from "./LeaderboardCard";
import { getLocalTestAttempts } from "@/lib/storage";
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

  // Fetch real student attempts if any, plus realistic benchmark peers from user screenshot
  const attempts = getLocalTestAttempts(paper.testCode || paper.id);

  const defaultPeers = [
    { name: "Sizuu 💗 Rtw", scoreRatio: 0.267, wrong: 25 },
    { name: "Jãy ...", scoreRatio: 0.200, wrong: 30 },
    { name: "આદિવાસી રાઠવા 🌿🏹", scoreRatio: 0.183, wrong: 23 },
    { name: "Dolly Rtw 💙", scoreRatio: 0.167, wrong: 22 },
    { name: "Geeta", scoreRatio: 0.100, wrong: 2 },
    { name: "Azuuu 1026", scoreRatio: 0.017, wrong: 2 },
    { name: "D∑V⨂∑NO ⚡", scoreRatio: 0.017, wrong: 4 },
  ];

  const realEntries: LeaderboardEntry[] = attempts.map((att) => ({
    rank: 1,
    name: att.studentName,
    score: att.score,
    total: att.totalQuestions || totalQuestions,
    wrong: att.wrongCount,
    percentage: att.percentage,
    grade: att.grade,
    isCurrentUser: user?.phoneNumber === att.studentPhone,
  }));

  // Add benchmark peers if list has fewer than 7 entries
  const currentNames = new Set(realEntries.map((e) => e.name));
  defaultPeers.forEach((p) => {
    if (!currentNames.has(p.name)) {
      const pScore = Math.max(1, Math.round(totalQuestions * p.scoreRatio));
      const pPct = totalQuestions > 0 ? (pScore / totalQuestions) * 100 : 0;
      realEntries.push({
        rank: 1,
        name: p.name,
        score: pScore,
        total: totalQuestions,
        wrong: p.wrong,
        percentage: pPct,
        grade: calculateGrade(pPct),
        isCurrentUser: false,
      });
    }
  });

  // Sort descending by score, then ascending by wrong count
  realEntries.sort((a, b) => b.score - a.score || a.wrong - b.wrong);

  // Assign ranks
  const entries: LeaderboardEntry[] = realEntries.slice(0, 10).map((e, idx) => ({
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
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
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-slate-400">
            કુલ {paper.questions?.length || 0} પ્રશ્નો • કોડ: <span className="font-mono text-sky-400 font-bold">{paper.testCode || "-"}</span>
          </div>

          <div className="flex items-center gap-2">
            {onTakeTest && (
              <button
                onClick={() => {
                  onClose();
                  onTakeTest(paper);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
              >
                <PlayCircle className="w-4 h-4" />
                <span>ટેસ્ટ આપો (Take Test)</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
            >
              બંધ કરો
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
