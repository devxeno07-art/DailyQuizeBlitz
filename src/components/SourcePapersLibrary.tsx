"use client";

import React, { useState, useEffect } from "react";
import { SourcePaper, Paper } from "@/types";
import { getLocalSourcePapers, getLocalPapers, savePaper } from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { 
  FileDown, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Layers, 
  BookOpen, 
  ArrowRight,
  ShieldAlert,
  FileCheck2,
  Share2
} from "lucide-react";

interface SourcePapersLibraryProps {
  onStartDigitizing: (paper: Paper) => void;
  onOpenPaper: (paper: Paper) => void;
}

export const SourcePapersLibrary: React.FC<SourcePapersLibraryProps> = ({
  onStartDigitizing,
  onOpenPaper,
}) => {
  const { user } = useAuth();
  const [sourcePapers, setSourcePapers] = useState<SourcePaper[]>([]);
  const [allPapers, setAllPapers] = useState<Paper[]>([]);

  useEffect(() => {
    setSourcePapers(getLocalSourcePapers());
    setAllPapers(getLocalPapers());
  }, []);

  if (!user) return null;

  // Handle User clicking "Start Digitizing" for a source paper
  const handleStartDigitizing = async (sp: SourcePaper) => {
    // Check if user already has an in-progress paper for this source
    const existing = allPapers.find(
      (p) => p.userId === user.id && p.sourcePaperId === sp.id
    );

    if (existing) {
      onOpenPaper(existing);
      return;
    }

    // Create a new paper linked to this source PDF
    const now = new Date().toISOString();
    const newPaper: Paper = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      userName: user.name,
      title: sp.title,
      subject: sp.examName || "GSRTC સ્પેશિયલ ઓલ્ડ પેપર",
      category: sp.category || "GSRTC સ્પેશિયલ",
      description: `ઓરિજિનલ PDF માંથી ડિજિટાઇઝેશન: ${sp.pdfUrl}`,
      targetQuestions: sp.targetQuestions || 100,
      timeLimitMinutes: 120,
      isPublic: true,
      sourcePaperId: sp.id,
      sourcePdfUrl: sp.pdfUrl,
      isDigitizedCompleted: false,
      questions: [],
      createdAt: now,
      updatedAt: now,
    };

    await savePaper(newPaper);
    onStartDigitizing(newPaper);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Informative Mission Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-orange-500/15">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm inline-block">
              🎯 મિશન: ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન
            </span>
            <h3 className="text-lg sm:text-xl font-black tracking-tight">
              ઓરિજિનલ પેપર્સ ડાઉનલોડ કરો અને ડિજિટલ રૂપમાં સેવ કરો
            </h3>
            <p className="text-xs text-amber-50 max-w-xl leading-relaxed">
              અહીંથી ઓરિજિનલ PDF પેપર્સ ખોલો કે ડાઉનલોડ કરો. ત્યારબાદ <strong>'ડિજિટલ રૂપમાં લખો'</strong> બટન દબાવીને પ્રશ્નો ટાઈપ અથવા બલ્ક પેસ્ટ કરો. આ પેપર્સ કાયમ માટે ડેટાબેઝમાં સાચવાશે.
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Source Papers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sourcePapers.map((sp, idx) => {
          // Find who is digitizing this paper
          const linkedPapers = allPapers.filter((p) => p.sourcePaperId === sp.id);
          const userPaper = linkedPapers.find((p) => p.userId === user.id);
          const totalQuestionsDigitized = linkedPapers.reduce(
            (max, p) => Math.max(max, p.questions?.length || p.questionCount || 0),
            0
          );
          const percent = Math.min(100, Math.round((totalQuestionsDigitized / sp.targetQuestions) * 100));

          return (
            <div
              key={sp.id}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                {/* Header Tag */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    PDF સોર્સ પેપર #{idx + 1}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    લક્ષ્યાંક: {sp.targetQuestions} પ્રશ્નો
                  </span>
                </div>

                {/* Title */}
                <h4 className="font-bold text-slate-900 text-base leading-snug">
                  {sp.title}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {sp.description || sp.examName}
                </p>

                {/* Progress bar */}
                <div className="mt-3.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-orange-600" />
                      ડિજિટલ પ્રગતિ: {totalQuestionsDigitized} / {sp.targetQuestions} MCQs
                    </span>
                    <span className="font-bold text-orange-600">{percent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-orange-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                </div>

                {/* User Status Badge */}
                {userPaper && (
                  <div className="mt-2 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>તમે આ પેપરમાં {userPaper.questions?.length || userPaper.questionCount || 0} પ્રશ્નો ડિજિટાઇઝ કર્યા છે.</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                {/* Download / View Google Drive PDF */}
                <a
                  href={sp.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Google Drive માં PDF ખોલો"
                >
                  <FileDown className="w-4 h-4 text-indigo-600" />
                  <span>ઓરિજિનલ PDF જુઓ</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>

                {/* Start or Continue Digitizing */}
                <button
                  onClick={() => handleStartDigitizing(sp)}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-500/20 flex items-center gap-1.5 transition-all transform active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                  <span>{userPaper ? "લખવાનું ચાલુ રાખો" : "ડિજિટલ રૂપમાં લખો"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
