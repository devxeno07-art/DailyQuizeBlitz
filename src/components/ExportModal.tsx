"use client";

import React, { useState } from "react";
import { Paper } from "@/types";
import { formatPaperForWhatsApp, exportPaperAsJSON, exportPaperAsCSV } from "@/lib/export";
import { 
  X, 
  Printer, 
  Share2, 
  FileDown, 
  Check, 
  Copy, 
  MessageCircle, 
  FileSpreadsheet, 
  Sparkles,
  BookOpen
} from "lucide-react";

interface ExportModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ paper, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [includeAnswersInWhatsApp, setIncludeAnswersInWhatsApp] = useState(false);

  if (!isOpen || !paper) return null;

  const handleCopyWhatsApp = () => {
    const text = formatPaperForWhatsApp(paper, includeAnswersInWhatsApp);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDirectWhatsAppShare = () => {
    const text = formatPaperForWhatsApp(paper, includeAnswersInWhatsApp);
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Share2 className="w-5 h-5" />
            <h3 className="font-bold text-sm sm:text-base">પેપર Export & શેર કરો</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Paper Info Box */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-900 text-sm">{paper.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {paper.subject} • {paper.questions?.length || 0} પ્રશ્નો
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {paper.category}
            </span>
          </div>

          {/* Option 1: WhatsApp Sharing */}
          <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs sm:text-sm">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp / Telegram શેરિંગ</span>
              </div>
            </div>

            <label className="flex items-center space-x-2 text-xs text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAnswersInWhatsApp}
                onChange={(e) => setIncludeAnswersInWhatsApp(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 border-emerald-300"
              />
              <span>દરેક પ્રશ્ન નીચે સાચો જવાબ અને સમજૂતી દર્શાવો</span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={handleCopyWhatsApp}
                className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 font-bold text-xs text-emerald-800 shadow-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "કોપી થઈ ગયું! ✓" : "ટેક્સ્ટ કોપી કરો"}</span>
              </button>

              <button
                onClick={handleDirectWhatsAppShare}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp ખોલો</span>
              </button>
            </div>
          </div>

          {/* Option 2: Print Exam Paper */}
          <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-900 font-bold text-xs sm:text-sm">
              <Printer className="w-4 h-4 text-indigo-600" />
              <span>A4 સાઇઝ પ્રિન્ટ / PDF ડાઉનલોડ</span>
            </div>
            <p className="text-xs text-slate-600">
              પરીક્ષા હોલ માટે સત્તાવાર પ્રશ્નપત્ર ફોર્મેટમાં પ્રિન્ટ કરો (તમામ બટનો આપોઆપ છુપાઈ જશે).
            </p>
            <button
              onClick={handlePrint}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>પ્રશ્નપત્ર પ્રિન્ટ કરો (Print to PDF)</span>
            </button>
          </div>

          {/* Option 3: File Downloads (CSV / JSON) */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => exportPaperAsCSV(paper)}
              className="p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center gap-2 text-xs font-bold shadow-sm transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel (CSV) ફાઇલ</span>
            </button>

            <button
              onClick={() => exportPaperAsJSON(paper)}
              className="p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center gap-2 text-xs font-bold shadow-sm transition-colors"
            >
              <FileDown className="w-4 h-4 text-brand-600" />
              <span>JSON બેકઅપ ફાઇલ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
