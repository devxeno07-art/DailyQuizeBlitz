"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Paper } from "@/types";
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
import { FileDown, BookOpen, Plus, Bot, Printer } from "lucide-react";

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
  const [activeModalPaper, setActiveModalPaper] = useState<Paper | null>(null);

  const handleSelectPaper = (paper: Paper) => {
    setSelectedPaper(paper);
  };

  const handleTakeTest = (paper: Paper) => {
    setActiveModalPaper(paper);
    setExamModalOpen(true);
  };

  const handleOpenExport = (paper: Paper) => {
    setActiveModalPaper(paper);
    setExportModalOpen(true);
  };

  const handleOpenLeaderboard = (paper: Paper) => {
    setActiveModalPaper(paper);
    setLeaderboardModalOpen(true);
  };

  const handleOpenTelegram = (paper?: Paper) => {
    if (paper) {
      setActiveModalPaper(paper);
    } else if (papers.length > 0) {
      setActiveModalPaper(papers[0]);
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
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 space-y-4">
            {/* Top Tab Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 bg-white p-2 rounded-2xl shadow-sm gap-2">
              <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar">
                {/* Show Library Tab ONLY if user was specifically granted permission by Admin */}
                {hasLibraryAccess && (
                  <button
                    onClick={() => setMainTab("library")}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                      mainTab === "library"
                        ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <FileDown className="w-4 h-4" />
                    <span>ઓરિજિનલ પેપર્સ લાઇબ્રેરી (Drive)</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      mainTab === "library" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"
                    }`}>
                      4 પેપર્સ
                    </span>
                  </button>
                )}

                <button
                  onClick={() => setMainTab("my_papers")}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                    mainTab === "my_papers"
                      ? "bg-brand-600 text-white shadow-md shadow-brand-500/20"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>મારા ડિજિટલ પેપર્સ</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    mainTab === "my_papers" ? "bg-white/20 text-white" : "bg-brand-100 text-brand-800"
                  }`}>
                    {papers.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 justify-end">
                <Link
                  href="/pdf-studio"
                  className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-bold text-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-600" />
                  <span>PDF Studio</span>
                </Link>

                <button
                  onClick={() => handleOpenTelegram()}
                  className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold text-xs transition-colors"
                >
                  <Bot className="w-3.5 h-3.5 text-sky-600" />
                  <span>Telegram ક્વિઝ કોડ</span>
                </button>

                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="hidden sm:flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-brand-600" />
                  <span>કસ્ટમ પેપર</span>
                </button>
              </div>
            </div>

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

      {/* Print-Only Document */}
      <PrintableView paper={activeModalPaper || selectedPaper} />
    </main>
  );
}
