"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Paper, Question } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { fetchCommunityPapers } from "@/lib/storage";
import {
  X,
  Shuffle,
  Play,
  Bot,
  Check,
  BookOpen,
  Layers,
} from "lucide-react";

interface MixTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartOnlineTest: (mixedPaper: Paper) => void;
  onOpenTelegramQuiz: (mixedPaper: Paper) => void;
}

const getPaperSubject = (paper: Paper): string =>
  (paper.subject || paper.category || "સામાન્ય વિષય").trim();

const shuffleArray = <T,>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const MixTestModal: React.FC<MixTestModalProps> = ({
  isOpen,
  onClose,
  onStartOnlineTest,
  onOpenTelegramQuiz,
}) => {
  const { user, papers } = useAuth();
  const [communityPapers, setCommunityPapers] = useState<Paper[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(25);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    fetchCommunityPapers()
      .then((list) => {
        if (active) setCommunityPapers(list);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Combine user papers + community papers without duplicate test codes/ids
  const uniquePapers = useMemo(() => {
    const map = new Map<string, Paper>();
    communityPapers.forEach((cp) => {
      const key = (cp.testCode || cp.id).toUpperCase();
      map.set(key, cp);
    });
    papers.forEach((mp) => {
      const key = (mp.testCode || mp.id).toUpperCase();
      map.set(key, mp);
    });
    return Array.from(map.values()).filter(
      (p) => Array.isArray(p.questions) && p.questions.length > 0
    );
  }, [papers, communityPapers]);

  const subjectStats = useMemo(() => {
    const counts = new Map<string, { subject: string; questionCount: number; paperCount: number }>();
    uniquePapers.forEach((paper) => {
      const subj = getPaperSubject(paper);
      const existing = counts.get(subj) || { subject: subj, questionCount: 0, paperCount: 0 };
      existing.questionCount += paper.questions?.length || 0;
      existing.paperCount += 1;
      counts.set(subj, existing);
    });
    return Array.from(counts.values()).sort((a, b) => b.questionCount - a.questionCount);
  }, [uniquePapers]);

  const poolQuestions = useMemo(() => {
    const activeSet = new Set(selectedSubjects.map((s) => s.toLowerCase()));
    const relevant =
      selectedSubjects.length === 0
        ? uniquePapers
        : uniquePapers.filter((p) => activeSet.has(getPaperSubject(p).toLowerCase()));

    const seenText = new Set<string>();
    const deduped: Question[] = [];
    relevant.forEach((paper) => {
      (paper.questions || []).forEach((q) => {
        const key = String(q.questionText || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (!key || seenText.has(key)) return;
        seenText.add(key);
        deduped.push(q);
      });
    });
    return deduped;
  }, [uniquePapers, selectedSubjects]);

  if (!isOpen) return null;

  const effectiveCount = Math.max(1, Math.min(questionCount || 25, poolQuestions.length || 1));

  const buildVirtualMixPaper = (): Paper | null => {
    if (poolQuestions.length === 0) return null;
    const ordered = shuffleQuestions ? shuffleArray(poolQuestions) : [...poolQuestions];
    const picked = ordered.slice(0, effectiveCount).map((q, idx) => ({
      ...q,
      questionNumber: idx + 1,
    }));

    const subjLabel =
      selectedSubjects.length === 0
        ? "બધા વિષયો મિક્સ"
        : selectedSubjects.slice(0, 3).join(", ") +
          (selectedSubjects.length > 3 ? ` +${selectedSubjects.length - 3}` : "");

    const randomCode = `MIX-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    return {
      id: `mix_${Date.now()}`,
      testCode: randomCode,
      userId: user?.id || "guest",
      userName: user?.name || "વિદ્યાર્થી",
      title:
        selectedSubjects.length === 0
          ? `મેગા મિક્સ મોક ટેસ્ટ (${picked.length} MCQs)`
          : `કસ્ટમ મિક્સ ટેસ્ટ: ${subjLabel}`,
      subject: subjLabel,
      category: "મિક્સ મોક ટેસ્ટ",
      timeLimitMinutes: Math.max(5, Math.ceil((picked.length * 30) / 60)),
      questions: picked,
      createdAt: now,
      updatedAt: now,
    };
  };

  const toggleSubject = (subj: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((item) => item !== subj) : [...prev, subj]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-indigo-600 via-brand-600 to-purple-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Shuffle className="w-4 h-4 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base truncate">
                કસ્ટમ મિક્સ મોક ટેસ્ટ (Multi-Subject)
              </h3>
              <p className="text-[11px] text-indigo-100 truncate">
                તમને જોઈતા વિષયો પસંદ કરીને તરત જ મિક્સ ટેસ્ટ બનાવો
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            title="બંધ કરો"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/70">
          {/* Subject Multi-Select Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>૧. કયા વિષયોના પ્રશ્નો મિક્સ કરવા છે?</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selectedSubjects.length === 0
                    ? `કોઈ વિષય પસંદ ન હોય તો બધા જ વિષયો મિક્સ થશે (${poolQuestions.length} પ્રશ્નો)`
                    : `${selectedSubjects.length} વિષય પસંદ કર્યા • કુલ પૂલ: ${poolQuestions.length} અનન્ય MCQs`}
                </p>
              </div>

              {subjectStats.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedSubjects([])}
                    className={`h-8 px-2.5 rounded-xl text-[11px] font-bold border transition-colors ${
                      selectedSubjects.length === 0
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    બધા (All)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSubjects(subjectStats.map((s) => s.subject))}
                    className="h-8 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition-colors"
                  >
                    બધા પસંદ કરો
                  </button>
                </div>
              )}
            </div>

            {loading && subjectStats.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                વિષયો લોડ થઈ રહ્યા છે...
              </p>
            ) : subjectStats.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                હજુ કોઈ પ્રશ્નપત્ર ઉપલબ્ધ નથી. પહેલા નવું પેપર બનાવો અથવા કમ્યુનિટી પેપર લોડ કરો.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {subjectStats.map((item) => {
                  const isChecked = selectedSubjects.includes(item.subject);
                  return (
                    <button
                      type="button"
                      key={item.subject}
                      onClick={() => toggleSubject(item.subject)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                        isChecked
                          ? "bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-xs"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-white border-slate-300 text-transparent"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs truncate">{item.subject}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {item.questionCount} MCQs • {item.paperCount} પેપર
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Question Count & Order Controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>૨. કેટલા પ્રશ્નોની ટેસ્ટ બનાવવી છે?</span>
              </h4>
              <span className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                પસંદ: {poolQuestions.length === 0 ? 0 : effectiveCount} / {poolQuestions.length}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[15, 25, 30, 50, 75, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuestionCount(preset)}
                  className={`h-9 rounded-xl text-xs font-bold border transition-all ${
                    questionCount === preset
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {preset} MCQs
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-10">
                <span className="text-xs font-semibold text-slate-600 shrink-0">કસ્ટમ સંખ્યા:</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={questionCount || ""}
                  onChange={(e) => setQuestionCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="w-full bg-transparent text-xs font-mono font-bold text-slate-900 focus:outline-none text-right"
                />
              </div>

              <button
                type="button"
                onClick={() => setShuffleQuestions((prev) => !prev)}
                className={`h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  shuffleQuestions
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                <Shuffle className="w-3.5 h-3.5 shrink-0" />
                <span>{shuffleQuestions ? "🔀 રેન્ડમ મિક્સ (Shuffle ચાલુ)" : "🔢 ક્રમ અનુસાર પ્રશ્નો"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer CTAs */}
        <div className="px-4 sm:px-5 py-3 bg-white border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={poolQuestions.length === 0}
            onClick={() => {
              const mixed = buildVirtualMixPaper();
              if (!mixed) return;
              onClose();
              onStartOnlineTest(mixed);
            }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span>વેબ પર ટેસ્ટ આપો ({poolQuestions.length === 0 ? 0 : effectiveCount} Qs)</span>
          </button>

          <button
            type="button"
            disabled={poolQuestions.length === 0}
            onClick={() => {
              const mixed = buildVirtualMixPaper();
              if (!mixed) return;
              onClose();
              onOpenTelegramQuiz(mixed);
            }}
            className="h-10 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>ટેલિગ્રામ ક્વિઝ કોડ બનાવો</span>
          </button>
        </div>
      </div>
    </div>
  );
};
