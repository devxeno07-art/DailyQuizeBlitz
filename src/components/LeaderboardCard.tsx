"use client";

import React, { useState, useRef } from "react";
import { Copy, Check, Share2, Award, Download, ExternalLink, Trophy } from "lucide-react";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  total: number;
  wrong: number;
  percentage: number;
  grade: string;
  isCurrentUser?: boolean;
}

interface LeaderboardCardProps {
  testTitle: string;
  subject: string;
  totalQuestions: number;
  timePerQuestion?: number;
  entries: LeaderboardEntry[];
  webUrl?: string;
}

export const LeaderboardCard: React.FC<LeaderboardCardProps> = ({
  testTitle,
  subject,
  totalQuestions,
  timePerQuestion = 30,
  entries,
  webUrl = "#",
}) => {
  const [copiedTelegram, setCopiedTelegram] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Calculate grade based on percentage
  const calculateGrade = (pct: number): string => {
    if (pct >= 85) return "A+";
    if (pct >= 70) return "A";
    if (pct >= 55) return "B";
    if (pct >= 40) return "C";
    if (pct >= 33) return "D";
    return "E";
  };

  // Medals mapping
  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="flex items-center gap-1 font-bold text-amber-300">🥇 1</span>;
    if (rank === 2) return <span className="flex items-center gap-1 font-bold text-slate-300">🥈 2</span>;
    if (rank === 3) return <span className="flex items-center gap-1 font-bold text-amber-600">🥉 3</span>;
    return <span className="text-slate-400 font-semibold pl-1">{rank}</span>;
  };

  // Format exact Telegram Monospace Table string
  const generateTelegramFormat = () => {
    let msg = `🏆 *મેગા મોક ટેસ્ટ પરિણામ અને લીડરબોર્ડ*\n\n`;
    msg += `📚 *વિષય:* 📖 ${subject} (${totalQuestions} MCQs)\n`;
    msg += `📊 *કુલ પ્રશ્નો:* ${totalQuestions} | ⏱ *સમય:* ${timePerQuestion} સે./પ્રશ્ન | 👥 *વિદ્યાર્થીઓ:* ${entries.length}\n\n`;
    msg += `📋 *મોક ટેસ્ટ સ્કોરબોર્ડ ટેબલ (Top ${entries.length} / ${entries.length})*\n\n`;
    msg += `\`ક્રમ  વિદ્યાર્થી       સ્કોર    ખોટા     %    ગ્રેડ\`\n`;
    msg += `\`-------------------------------------------------\`\n`;

    entries.forEach((e) => {
      const rankStr = e.rank.toString().padEnd(3);
      const nameStr = (e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name).padEnd(14);
      const scoreStr = `${e.score}/${e.total}`.padEnd(8);
      const wrongStr = e.wrong.toString().padEnd(6);
      const pctStr = `${e.percentage.toFixed(1)}%`.padEnd(7);
      const gradeStr = e.grade;
      msg += `\`${rankStr} ${nameStr} ${scoreStr} ${wrongStr} ${pctStr} ${gradeStr}\`\n`;
    });

    msg += `\n👏 *ઉત્કૃષ્ટ પ્રદર્શન કરનાર તમામ વિદ્યાર્થીઓને ખૂબ ખૂબ અભિનંદન!* 🎯\n`;
    msg += `🌐 *સંપૂર્ણ HTML Table & આન્સર કી:* ${webUrl}\n`;
    return msg;
  };

  const handleCopyTelegram = () => {
    const text = generateTelegramFormat();
    navigator.clipboard.writeText(text);
    setCopiedTelegram(true);
    setTimeout(() => setCopiedTelegram(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = generateTelegramFormat();
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, "_blank");
  };

  return (
    <div className="space-y-3">
      {/* Visual Leaderboard Card Matching Screenshot */}
      <div 
        ref={cardRef}
        className="bg-[#0f172a] text-slate-100 rounded-3xl p-4 sm:p-6 border border-slate-800 shadow-2xl relative overflow-hidden font-sans"
      >
        {/* Main Title */}
        <div className="flex items-center justify-center space-x-2 text-center pb-4">
          <span className="text-xl sm:text-2xl">🏆</span>
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
            મેગા મોક ટેસ્ટ પરિણામ અને લીડરબોર્ડ
          </h3>
        </div>

        {/* Subject & Info Box with Pink Left Accent */}
        <div className="bg-[#1e2238]/90 rounded-2xl p-3.5 sm:p-4 border-l-4 border-pink-500 relative mb-4 shadow-inner">
          <span className="absolute top-2 right-3 text-pink-400 font-serif text-2xl select-none opacity-80">
            ❞
          </span>

          <div className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-1.5 flex-wrap">
            <span>📚 <strong>વિષય:</strong></span>
            <span>📖 {subject} ({totalQuestions} MCQs)</span>
          </div>

          <div className="text-[11px] sm:text-xs text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
            <span>📊 કુલ પ્રશ્નો: <strong className="text-slate-200">{totalQuestions}</strong></span>
            <span>|</span>
            <span>⏱ સમય: <strong className="text-slate-200">{timePerQuestion} સે./પ્રશ્ન</strong></span>
            <span>|</span>
            <span>👥 વિદ્યાર્થીઓ: <strong className="text-slate-200">{entries.length}</strong></span>
          </div>
        </div>

        {/* Scoreboard Table Title */}
        <div className="text-center my-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 text-slate-300 text-xs font-semibold border border-slate-700/60">
            📋 મોક ટેસ્ટ સ્કોરબોર્ડ ટેબલ (Top {entries.length} / {entries.length})
          </span>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto no-scrollbar rounded-xl border border-slate-800/80 bg-slate-950/40">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-slate-900/80">
                <th className="py-2.5 px-3 text-center w-12">ક્રમ</th>
                <th className="py-2.5 px-3">વિદ્યાર્થી</th>
                <th className="py-2.5 px-3 text-center">સ્કોર</th>
                <th className="py-2.5 px-3 text-center">ખોટા</th>
                <th className="py-2.5 px-3 text-center">%</th>
                <th className="py-2.5 px-3 text-center w-12">ગ્રેડ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {entries.map((entry) => (
                <tr 
                  key={entry.rank}
                  className={`transition-colors hover:bg-slate-800/40 ${
                    entry.isCurrentUser 
                      ? "bg-brand-950/40 font-bold border-l-2 border-brand-500" 
                      : entry.rank <= 3 
                      ? "bg-slate-900/30" 
                      : ""
                  }`}
                >
                  {/* Rank */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {getRankBadge(entry.rank)}
                  </td>

                  {/* Student Name */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-slate-100">{entry.name}</span>
                      {entry.isCurrentUser && (
                        <span className="text-[9px] bg-brand-600 text-white px-1.5 py-0.2 rounded-full">
                          તમે (You)
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Score */}
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-100 whitespace-nowrap">
                    {entry.score}/{entry.total}
                  </td>

                  {/* Wrong count */}
                  <td className="py-2.5 px-3 text-center font-mono text-rose-400 whitespace-nowrap">
                    {entry.wrong}
                  </td>

                  {/* Percentage */}
                  <td className="py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap text-slate-200">
                    {entry.percentage.toFixed(1)}%
                  </td>

                  {/* Grade */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span className={`inline-block w-6 text-center py-0.5 rounded text-xs font-black ${
                      entry.grade.startsWith("A") 
                        ? "bg-emerald-500/20 text-emerald-400" 
                        : entry.grade.startsWith("B") 
                        ? "bg-sky-500/20 text-sky-400" 
                        : entry.grade.startsWith("C") 
                        ? "bg-amber-500/20 text-amber-400" 
                        : "bg-rose-500/20 text-rose-400"
                    }`}>
                      {entry.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Greetings */}
        <div className="pt-4 text-center space-y-1.5 border-t border-slate-800/80 mt-4">
          <p className="text-xs sm:text-sm text-slate-300 font-medium flex items-center justify-center gap-1">
            <span>👏</span>
            <span>ઉત્કૃષ્ટ પ્રદર્શન કરનાર તમામ વિદ્યાર્થીઓને ખૂબ ખૂબ અભિનંદન! 🎯</span>
          </p>

          <p className="text-[11px] sm:text-xs text-slate-400 flex items-center justify-center gap-1">
            <span>🌐</span>
            <span>સંપૂર્ણ HTML Table & આન્સર કી:</span>
            <span className="text-sky-400 underline font-medium cursor-pointer">
              અહીં ક્લિક કરો
            </span>
          </p>
        </div>
      </div>

      {/* Action Buttons to Copy or Share this table */}
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <button
          onClick={handleCopyTelegram}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-all"
        >
          {copiedTelegram ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copiedTelegram ? "Telegram ટેબલ કોપી થયું! ✓" : "Telegram ટેબલ કોપી કરો"}</span>
        </button>

        <button
          onClick={handleShareWhatsApp}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-all"
        >
          <Share2 className="w-4 h-4" />
          <span>WhatsApp પર મોકલો</span>
        </button>
      </div>
    </div>
  );
};
