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

export default function Home() {
  const { user, isLoading } = useAuth();

  // Navigation & Active Paper State
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  // Modals State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [activeModalPaper, setActiveModalPaper] = useState<Paper | null>(null);

  // Handle Paper Selection for Editing
  const handleSelectPaper = (paper: Paper) => {
    setSelectedPaper(paper);
  };

  // Handle Taking Test
  const handleTakeTest = (paper: Paper) => {
    setActiveModalPaper(paper);
    setExamModalOpen(true);
  };

  // Handle Export / Share
  const handleOpenExport = (paper: Paper) => {
    setActiveModalPaper(paper);
    setExportModalOpen(true);
  };

  // Handle Admin Inspecting a Paper
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
          <PaperList
            onSelectPaper={handleSelectPaper}
            onOpenCreate={() => setCreateModalOpen(true)}
            onTakeTest={handleTakeTest}
            onExport={handleOpenExport}
          />
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
