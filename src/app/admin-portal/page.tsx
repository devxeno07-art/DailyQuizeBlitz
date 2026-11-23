"use client";

import React, { useState } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { Paper } from "@/types";
import { PaperEditor } from "@/components/PaperEditor";
import { ExamModal } from "@/components/ExamModal";
import { ExportModal } from "@/components/ExportModal";
import { LeaderboardModal } from "@/components/LeaderboardModal";

export default function AdminPortalPage() {
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      {selectedPaper ? (
        <div className="min-h-screen bg-slate-50">
          <PaperEditor
            paper={selectedPaper}
            onBack={() => setSelectedPaper(null)}
            onTakeTest={() => setExamModalOpen(true)}
            onExport={() => setExportModalOpen(true)}
            onOpenLeaderboard={() => setLeaderboardModalOpen(true)}
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
          <LeaderboardModal
            isOpen={leaderboardModalOpen}
            paper={selectedPaper}
            onClose={() => setLeaderboardModalOpen(false)}
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
