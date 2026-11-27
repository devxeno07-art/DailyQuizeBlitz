"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Paper } from "@/types";
import { fetchFullPaper } from "@/lib/storage";
import { Header } from "@/components/Header";
import { LoginModal } from "@/components/LoginModal";
import { PaperList } from "@/components/PaperList";
import { PaperEditor } from "@/components/PaperEditor";
import { CreatePaperModal } from "@/components/CreatePaperModal";
import { ExamModal } from "@/components/ExamModal";
import { ExportModal } from "@/components/ExportModal";
import { PrintableView } from "@/components/PrintableView";
import { SourcePapersLibrary } from "@/components/SourcePapersLibrary";
import { TelegramBotModal } from "@/components/TelegramBotModal";
import { LeaderboardModal } from "@/components/LeaderboardModal";
import { MixTestModal } from "@/components/MixTestModal";
import { FileDown, BookOpen, Plus, Bot, Printer, Shuffle } from "lucide-react";

export default function Home() {
  const { user, papers, isMounted } = useAuth();

  const hasLibraryAccess = !!user?.hasLibraryAccess;

  // Navigation: "library" (Old PDF Papers from Drive - Admin granted only) | "my_papers" (My Digitized Papers)
  const [mainTab, setMainTab] = useState<"library" | "my_papers">("my_papers");

  // Keep tab synced with user's library permission
  useEffect(() => {
    if (hasLibraryAccess) {
      setMainTab("library");
    } else {
      setMainTab("my_papers");
    }
  }, [hasLibraryAccess]);

  // Active Paper State for Editor
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  // Modals State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);
  const [mixModalOpen, setMixModalOpen] = useState(false);
  const [activeModalPaper, setActiveModalPaper] = useState<Paper | null>(null);

  const handleSelectPaper = async (paper: Paper) => {
    const full = await fetchFullPaper(paper);
    setSelectedPaper(full);
  };

  const handleTakeTest = async (paper: Paper) => {
    const full = await fetchFullPaper(paper);
    setActiveModalPaper(full);
    setExamModalOpen(true);
  };

  const handleOpenExport = async (paper: Paper) => {
    const full = await fetchFullPaper(paper);
    setActiveModalPaper(full);
    setExportModalOpen(true);
  };

  const handleOpenLeaderboard = async (paper: Paper) => {
    const full = await fetchFullPaper(paper);
    setActiveModalPaper(full);
    setLeaderboardModalOpen(true);
  };

  const handleOpenTelegram = async (paper?: Paper) => {
    if (paper) {
      const full = await fetchFullPaper(paper);
      setActiveModalPaper(full);
    } else if (papers.length > 0) {
      const full = await fetchFullPaper(papers[0]);
      setActiveModalPaper(full);
    }
    setTelegramModalOpen(true);
  };

  // Prevent SSR Hydration Mismatch: render clean initial shell until client mounts
  if (!isMounted) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col">
        <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200 h-14"></header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* App Header (No Admin links or buttons) */}
      <Header
        onOpenTelegram={() => handleOpenTelegram()}
      />

      {/* Main View Area */}
      <div className="flex-1 no-print">
        {!user ? (
          <LoginModal isOpen={true} />
        ) : selectedPaper ? (
          <PaperEditor
            paper={selectedPaper}
            onBack={() => setSelectedPaper(null)}
            onTakeTest={handleTakeTest}
            onExport={handleOpenExport}
            onOpenTelegram={handleOpenTelegram}
            onOpenLeaderboard={handleOpenLeaderboard}
            onDeletePaper={() => setSelectedPaper(null)}
          />
        ) : (
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
            {/* Top Tab Switcher (cleanly aligned on both mobile & desktop) */}
            {(hasLibraryAccess || true) && (
              <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className={`grid ${hasLibraryAccess ? "grid-cols-2" : "grid-cols-1"} sm:flex items-center gap-1.5`}>
                  {hasLibraryAccess && (
                    <button
                      onClick={() => setMainTab("library")}
                      className={`h-10 flex items-center justify-center space-x-1.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                        mainTab === "library"
                          ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-sm shadow-orange-500/20"
                          : "text-slate-600 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <FileDown className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">લાઇબ્રેરી (Drive)</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        mainTab === "library" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"
                      }`}>
                        4
                      </span>
                    </button>
                  )}

                  <button
                    onClick={() => setMainTab("my_papers")}
                    className={`h-10 flex items-center justify-center space-x-1.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                      mainTab === "my_papers"
                        ? "bg-brand-600 text-white shadow-sm shadow-brand-500/20"
                        : "text-slate-600 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">મારા ડિજિટલ પેપર્સ</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      mainTab === "my_papers" ? "bg-white/20 text-white" : "bg-brand-100 text-brand-800"
                    }`}>
                      {papers.length}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-1.5">
                  <button
                    onClick={() => setMixModalOpen(true)}
                    className="h-10 flex items-center justify-center space-x-1 px-2.5 sm:px-3 rounded-xl bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 font-bold text-[11px] sm:text-xs transition-colors whitespace-nowrap"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    <span>મિક્સ ટેસ્ટ</span>
                  </button>

                  <Link
                    href="/pdf-studio"
                    className="h-10 flex items-center justify-center space-x-1 px-2.5 sm:px-3 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-bold text-[11px] sm:text-xs transition-colors whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>PDF Studio</span>
                  </Link>

                  <button
                    onClick={() => handleOpenTelegram()}
                    className="h-10 flex items-center justify-center space-x-1 px-2.5 sm:px-3 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold text-[11px] sm:text-xs transition-colors whitespace-nowrap"
                  >
                    <Bot className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                    <span>ક્વિઝ કોડ</span>
                  </button>

                  <button
                    onClick={() => setCreateModalOpen(true)}
                    className="h-10 flex items-center justify-center space-x-1 px-2.5 sm:px-3 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 font-bold text-[11px] sm:text-xs transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                    <span>નવું પેપર</span>
                  </button>
                </div>
              </div>
            )}

            {/* Active Tab View */}
            {mainTab === "library" && hasLibraryAccess ? (
              <SourcePapersLibrary
                onStartDigitizing={(paper) => setSelectedPaper(paper)}
                onOpenPaper={(paper) => setSelectedPaper(paper)}
              />
            ) : (
              <PaperList
                onSelectPaper={handleSelectPaper}
                onOpenCreate={() => setCreateModalOpen(true)}
                onTakeTest={handleTakeTest}
                onExport={handleOpenExport}
                onOpenTelegramQuiz={(paper) => handleOpenTelegram(paper)}
                onOpenLeaderboard={handleOpenLeaderboard}
              />
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreatePaperModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(newPaper) => setSelectedPaper(newPaper)}
      />

      <ExamModal
        paper={activeModalPaper || selectedPaper}
        isOpen={examModalOpen}
        onClose={() => setExamModalOpen(false)}
      />

      <ExportModal
        paper={activeModalPaper || selectedPaper}
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />

      <TelegramBotModal
        paper={activeModalPaper || selectedPaper}
        isOpen={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
      />

      <LeaderboardModal
        paper={activeModalPaper || selectedPaper}
        isOpen={leaderboardModalOpen}
        onClose={() => setLeaderboardModalOpen(false)}
        onTakeTest={handleTakeTest}
      />

      <MixTestModal
        isOpen={mixModalOpen}
        onClose={() => setMixModalOpen(false)}
        onStartOnlineTest={handleTakeTest}
        onOpenTelegramQuiz={(mixed) => handleOpenTelegram(mixed)}
      />

      {/* Print-Only Document */}
      <PrintableView paper={activeModalPaper || selectedPaper} />
    </main>
  );
}
