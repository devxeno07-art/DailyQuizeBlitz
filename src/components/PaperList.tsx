"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Paper } from "@/types";
import { deletePaper } from "@/lib/storage";
import { 
  Plus, 
  Search, 
  BookOpen, 
  Clock, 
  Trash2, 
  Edit3, 
  PlayCircle, 
  Share2, 
  Sparkles, 
  Layers, 
  CheckCircle,
  FileCheck,
  AlertCircle,
  Bot
} from "lucide-react";

interface PaperListProps {
  onSelectPaper: (paper: Paper) => void;
  onOpenCreate: () => void;
  onTakeTest: (paper: Paper) => void;
  onExport: (paper: Paper) => void;
  onOpenTelegramQuiz?: (paper: Paper) => void;
}

export const PaperList: React.FC<PaperListProps> = ({
  onSelectPaper,
  onOpenCreate,
  onTakeTest,
  onExport,
  onOpenTelegramQuiz,
}) => {
  const { user, papers } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!user) return null;

  const filteredPapers = papers.filter((paper) => {
    const matchesSearch = 
      paper.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      paper.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      paper.category?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = 
      selectedCategory === "all" || paper.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const totalQuestions = papers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
  const categories = ["all", ...Array.from(new Set(papers.map(p => p.category).filter(Boolean)))];

  const handleDelete = async (paperId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("શું તમે ખરેખર આ પ્રશ્નપત્ર ડિલીટ કરવા માંગો છો? આ પ્રક્રિયા પાછી ખેંચી શકાશે નહીં.")) {
      setDeletingId(paperId);
      await deletePaper(paperId);
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("gu-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* User Stats Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 rounded-3xl p-5 text-white shadow-xl shadow-brand-500/15">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200 bg-white/10 px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                વ્યક્તિગત ડેશબોર્ડ (Your Dashboard)
              </span>
              <h2 className="text-xl sm:text-2xl font-black mt-1.5 tracking-tight">
                નમસ્તે, {user.name} 👋
              </h2>
              <p className="text-xs text-indigo-100 font-mono mt-0.5">
                મોબાઈલ: {user.phoneNumber}
              </p>
            </div>

            <button
              onClick={onOpenCreate}
              className="hidden sm:flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-white text-brand-700 font-bold text-xs shadow-md hover:bg-indigo-50 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>નવું પેપર બનાવો</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/15">
            <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm text-center">
              <div className="text-lg sm:text-2xl font-black">{papers.length}</div>
              <div className="text-[10px] sm:text-xs text-indigo-100 font-medium">કુલ પેપર્સ</div>
            </div>
            <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm text-center">
              <div className="text-lg sm:text-2xl font-black">{totalQuestions}</div>
              <div className="text-[10px] sm:text-xs text-indigo-100 font-medium">બનાવેલ MCQs</div>
            </div>
            <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm text-center">
              <div className="text-lg sm:text-2xl font-black">100%</div>
              <div className="text-[10px] sm:text-xs text-indigo-100 font-medium">Auto-Sync સક્રિય</div>
            </div>
          </div>
        </div>

        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="પેપર અથવા વિષય શોધો... (Search Papers)"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
            />
          </div>

          <button
            onClick={onOpenCreate}
            className="sm:hidden flex items-center space-x-1 px-3.5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>નવું પેપર</span>
          </button>
        </div>

        {categories.length > 2 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat === "all" ? "બધા (All)" : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Papers Grid */}
      {filteredPapers.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-base text-slate-800">
            {papers.length === 0 ? "હજુ સુધી કોઈ પેપર બનાવ્યું નથી" : "કોઈ મેળ ખાતું પેપર મળ્યું નથી"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            {papers.length === 0
              ? "તમારું પ્રથમ પ્રશ્નપત્ર બનાવો અને તેમાં પ્રશ્નો ટાઈપ કરો અથવા કોપી-પેસ્ટ કરો."
              : "બીજું કંઈક શોધો અથવા ફિલ્ટર બદલો."}
          </p>
          {papers.length === 0 && (
            <button
              onClick={onOpenCreate}
              className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 hover:bg-brand-700"
            >
              <Plus className="w-4 h-4" />
              <span>પ્રથમ પેપર બનાવો</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPapers.map((paper) => {
            const count = paper.questions?.length || 0;
            const target = paper.targetQuestions || 50;
            const percent = Math.min(100, Math.round((count / target) * 100));

            return (
              <div
                key={paper.id}
                onClick={() => onSelectPaper(paper)}
                className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {paper.category || "General"}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(paper.updatedAt)}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-base leading-snug group-hover:text-brand-600 transition-colors">
                    {paper.title}
                  </h4>
                  {paper.subject && (
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      વિષય: {paper.subject}
                    </p>
                  )}

                  <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-brand-600" />
                        પ્રશ્નો: {count} / {target}
                      </span>
                      <span className="font-bold text-brand-600">{percent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-brand-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1">
                    {/* Take Test */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTakeTest(paper);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs border border-emerald-200 transition-colors"
                      title="ટેસ્ટ મોડ શરૂ કરો"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ટેસ્ટ</span>
                    </button>

                    {/* Telegram Bot Code Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTelegramQuiz?.(paper);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold text-xs border border-sky-200 transition-colors"
                      title="ટેલિગ્રામ ગ્રૂપ ક્વિઝ કોડ બનાવો"
                    >
                      <Bot className="w-3.5 h-3.5 text-sky-600" />
                      <span>Telegram</span>
                    </button>

                    {/* Share / Export */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(paper);
                      }}
                      className="p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                      title="શેર / Export"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPaper(paper);
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold text-xs border border-brand-200 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>એડિટ</span>
                    </button>

                    <button
                      onClick={(e) => handleDelete(paper.id, e)}
                      disabled={deletingId === paper.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete Paper"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile Floating Action Button */}
      <button
        onClick={onOpenCreate}
        className="fixed bottom-6 right-6 z-30 sm:hidden w-14 h-14 rounded-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-float flex items-center justify-center transform active:scale-95 transition-all"
        aria-label="નવું પેપર બનાવો"
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
};
