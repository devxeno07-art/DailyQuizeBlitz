"use client";

import React, { useState } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { Paper } from "@/types";
import { PaperEditor } from "@/components/PaperEditor";
import { ExamModal } from "@/components/ExamModal";
import { ExportModal } from "@/components/ExportModal";

export default function AdminPortalPage() {
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      {selectedPaper ? (
        <div className="min-h-screen bg-slate-50">
          <PaperEditor
            paper={selectedPaper}
            onBack={() => setSelectedPaper(null)}
            onTakeTest={() => setExamModalOpen(true)}
            onExport={() => setExportModalOpen(true)}
          />
          <ExamModal
            isOpen={examModalOpen}
            paper={selectedPaper}
            onClose={() => setExamModalOpen(false)}
          />
          <ExportModal
            isOpen={exportModalOpen}
            paper={selectedPaper}
            onClose={() => setExportModalOpen(false)}
          />
        </div>
      ) : (
        <AdminPanel
          isOpen={true}
          standalone={true}
          onInspectPaper={(paper) => setSelectedPaper(paper)}
        />
      )}
    </div>
  );
}
