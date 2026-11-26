"use client";

import React, { useState } from "react";
import { Copy, Check, Share2, Trophy, Users, Clock, BookOpen, Bot, Medal, Sparkles } from "lucide-react";

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
  testCode?: string;
  entries: LeaderboardEntry[];
  webUrl?: string;
}

export const LeaderboardCard: React.FC<LeaderboardCardProps> = ({
  testTitle,
  subject,
  totalQuestions,
  timePerQuestion = 30,
  testCode,
  entries,
  webUrl = "#",
}) => {
  const [copiedTelegram, setCopiedTelegram] = useState(false);
  const [copiedCodePill, setCopiedCodePill] = useState(false);

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 border border-amber-300 font-black text-xs shadow-xs">
          🥇
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-black text-xs shadow-xs">
          🥈
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-700 border border-orange-300 font-black text-xs shadow-xs">
          🥉
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-50 text-slate-600 border border-slate-200 font-bold text-xs">
        {rank}
      </span>
    );
  };

  const getGradeClasses = (grade: string) => {
    if (grade.startsWith("A")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (grade.startsWith("B")) return "bg-sky-50 text-sky-700 border-sky-200";
    if (grade.startsWith("C")) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-rose-50 text-rose-700 border-rose-200";
  };

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

  const handleCopyCode = () => {
    if (!testCode) return;
    navigator.clipboard.writeText(`/quiz ${testCode}`);
    setCopiedCodePill(true);
    setTimeout(() => setCopiedCodePill(false), 2000);
  };

  const topThree = entries.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Unified Light Modern Card matching the rest of the web app */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 text-white p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 shadow-inner">
                <Trophy className="w-5 h-5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-100 bg-white/15 px-2 py-0.5 rounded-full">
                  <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                  <span>લાઈવ સ્કોરબોર્ડ &amp; લીડરબોર્ડ</span>
                </span>
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white mt-1 truncate">
                  {testTitle || "મેગા મોક ટેસ્ટ પરિણામ"}
                </h3>
                <p className="text-xs text-indigo-100/90 flex items-center gap-1 truncate mt-0.5">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{subject}</span>
                </p>
              </div>
            </div>

            {testCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="h-8 px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-mono text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors self-start shrink-0"
                title="ટેલિગ્રામ કમાન્ડ કોપી કરો"
              >
                <Bot className="w-3.5 h-3.5 text-sky-200" />
                <span>/quiz {testCode}</span>
                {copiedCodePill ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-indigo-100" />
                )}
              </button>
            )}
          </div>

          {/* Summary Stat Chips */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/15 border border-white/20 rounded-xl px-2.5 py-2 text-center">
              <div className="text-[10px] text-indigo-100 font-semibold flex items-center justify-center gap-1">
                <BookOpen className="w-3 h-3" />
                <span>પ્રશ્નો</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold font-mono mt-0.5">
                {totalQuestions}
              </div>
            </div>

            <div className="bg-white/15 border border-white/20 rounded-xl px-2.5 py-2 text-center">
              <div className="text-[10px] text-indigo-100 font-semibold flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                <span>સમય</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold font-mono mt-0.5">
                {timePerQuestion}s
              </div>
            </div>

            <div className="bg-white/15 border border-white/20 rounded-xl px-2.5 py-2 text-center">
              <div className="text-[10px] text-indigo-100 font-semibold flex items-center justify-center gap-1">
                <Users className="w-3 h-3" />
                <span>વિદ્યાર્થીઓ</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold font-mono mt-0.5">
                {entries.length}
              </div>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-3.5 sm:p-5 space-y-4">
          {/* Top 3 Podium Cards */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {topThree.map((entry) => {
                const podiumStyle =
                  entry.rank === 1
                    ? "bg-gradient-to-br from-amber-50 to-yellow-50/70 border-amber-300"
                    : entry.rank === 2
                    ? "bg-gradient-to-br from-slate-50 to-slate-100/70 border-slate-300"
                    : "bg-gradient-to-br from-orange-50 to-amber-50/50 border-orange-200";
                return (
                  <div
                    key={entry.rank}
                    className={`rounded-2xl border p-3 flex sm:flex-col items-center sm:items-start justify-between gap-2 transition-all ${podiumStyle} ${
                      entry.isCurrentUser ? "ring-2 ring-brand-500/40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 w-full">
                      {getRankBadge(entry.rank)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {entry.name}
                          </span>
                          {entry.isCurrentUser && (
                            <span className="text-[9px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
                              તમે
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {entry.score}/{entry.total} સાચા • {entry.wrong} ખોટા
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:w-full sm:justify-between sm:pt-1 sm:border-t sm:border-black/5 shrink-0">
                      <span className="font-mono font-extrabold text-xs sm:text-sm text-indigo-700">
                        {entry.percentage.toFixed(1)}%
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[11px] font-black ${getGradeClasses(
                          entry.grade
                        )}`}
                      >
                        {entry.grade}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Scoreboard Table */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Medal className="w-4 h-4 text-indigo-600" />
                <span>સ્કોરબોર્ડ ટેબલ (Top {entries.length})</span>
              </span>
              {entries.length > 0 && (
                <span className="text-[11px] font-semibold text-slate-500">
                  કુલ {entries.length} પરિણામો
                </span>
              )}
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider bg-slate-50/60">
                    <th className="py-2.5 px-2.5 sm:px-3.5 text-center w-12">ક્રમ</th>
                    <th className="py-2.5 px-2.5 sm:px-3.5">વિદ્યાર્થી</th>
                    <th className="py-2.5 px-2.5 sm:px-3.5 text-center">સ્કોર</th>
                    <th className="py-2.5 px-2.5 sm:px-3.5 text-center">ખોટા</th>
                    <th className="py-2.5 px-2.5 sm:px-3.5 text-center">%</th>
                    <th className="py-2.5 px-2.5 sm:px-3.5 text-center w-14">ગ્રેડ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 px-4 text-center text-slate-500 text-xs">
                        <div className="text-2xl mb-1.5">🏆</div>
                        <div className="font-bold text-slate-700">
                          હજુ સુધી કોઈ વિદ્યાર્થીએ આ ટેસ્ટ આપ્યો નથી.
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          ટેસ્ટ આપ્યા પછી પરિણામ અહીં અને ટેલિગ્રામ લીડરબોર્ડમાં તરત દેખાશે.
                        </div>
                      </td>
                    </tr>
                  )}

                  {entries.map((entry) => (
                    <tr
                      key={`${entry.rank}-${entry.name}`}
                      className={`transition-colors ${
                        entry.isCurrentUser
                          ? "bg-indigo-50/70 font-bold"
                          : entry.rank <= 3
                          ? "bg-amber-50/25 hover:bg-slate-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-2.5 px-2.5 sm:px-3.5 text-center whitespace-nowrap">
                        {getRankBadge(entry.rank)}
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3.5 max-w-[140px] sm:max-w-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 truncate">
                            {entry.name}
                          </span>
                          {entry.isCurrentUser && (
                            <span className="text-[10px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
                              તમે
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                        {entry.score}/{entry.total}
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3.5 text-center font-mono font-semibold text-rose-600 whitespace-nowrap">
                        {entry.wrong}
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3.5 text-center font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {entry.percentage.toFixed(1)}%
                      </td>

                      <td className="py-2.5 px-2.5 sm:px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-lg border text-xs font-black ${getGradeClasses(
                            entry.grade
                          )}`}
                        >
                          {entry.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Telegram Command Tip */}
          {testCode && (
            <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="font-medium text-center sm:text-left">
                👉 આ ટેસ્ટ ટેલિગ્રામ ગ્રૂપમાં રમાડવા માટે કમાન્ડ મોકલો:
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="h-8 px-3 rounded-xl bg-white hover:bg-sky-100 text-sky-800 border border-sky-300 font-mono font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
              >
                <span>/quiz {testCode}</span>
                {copiedCodePill ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-sky-600" />
                )}
              </button>
            </div>
          )}

          {/* Encouragement Line */}
          <p className="text-center text-xs text-slate-500 font-medium pt-0.5">
            👏 ઉત્કૃષ્ટ પ્રદર્શન કરનાર તમામ વિદ્યાર્થીઓને ખૂબ ખૂબ અભિનંદન! 🎯
          </p>
        </div>
      </div>

      {/* Equal-Height Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopyTelegram}
          className="h-10 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition-all"
        >
          {copiedTelegram ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Copy className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">
            {copiedTelegram ? "Telegram ટેબલ કોપી થયું! ✓" : "Telegram ટેબલ કોપી કરો"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShareWhatsApp}
          className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all"
        >
          <Share2 className="w-4 h-4 shrink-0" />
          <span className="truncate">WhatsApp પર મોકલો</span>
        </button>
      </div>
    </div>
  );
};
