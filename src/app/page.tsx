"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Paper } from "@/types";
import { Header } from "@/components/Header";
import { LoginModal } from "@/components/LoginModal";
import { PaperList } from "@/components/PaperList";
import { PaperEditor } from "@/components/PaperEditor";
import { CreatePaperModal } from "@/components/CreatePaperModal";
import { ExamModal } from "@/components/ExamModal";
import { ExportModal } from "@/components/ExportModal";
import { AdminPanel } from "@/components/AdminPanel";
import { PrintableView } from "@/components/PrintableView";
import { SourcePapersLibrary } from "@/components/SourcePapersLibrary";
import { TelegramBotModal } from "@/components/TelegramBotModal";
import { FileDown, BookOpen, Plus, Sparkles, Bot } from "lucide-react";

export default function Home() {
  const { user, papers, isLoading } = useAuth();

  // Navigation: "library" (Old PDF Papers from Drive) | "my_papers" (My Digitized Papers)
  const [mainTab, setMainTab] = useState<"library" | "my_papers">("library");

  // Active Paper State for Editor
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  // Modals State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
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

  const handleOpenTelegram = (paper?: Paper) => {
    if (paper) {
      setActiveModalPaper(paper);
    } else if (papers.length > 0) {
      setActiveModalPaper(papers[0]);
    }
    setTelegramModalOpen(true);
  };

  const handleInspectPaperFromAdmin = (paper: Paper) => {
    setSelectedPaper(paper);
    setAdminOpen(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">MCQ Master લોડ થઈ રહ્યું છે...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* App Header */}
      <Header
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenSettings={() => setAdminOpen(true)}
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
          />
        ) : (
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 space-y-4">
            {/* Top Tab Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 bg-white p-2 rounded-2xl shadow-sm gap-2">
              <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar">
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
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    mainTab === "library" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"
                  }`}>
                    4 પેપર્સ
                  </span>
                </button>

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
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    mainTab === "my_papers" ? "bg-white/20 text-white" : "bg-brand-100 text-brand-800"
                  }`}>
                    {papers.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 justify-end">
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
            {mainTab === "library" ? (
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

      <AdminPanel
        isOpen={adminOpen}
        onClose={() => setAdminOpen(false)}
        onInspectPaper={handleInspectPaperFromAdmin}
      />

      {/* Print-Only Document */}
      <PrintableView paper={activeModalPaper || selectedPaper} />
    </main>
  );
}
