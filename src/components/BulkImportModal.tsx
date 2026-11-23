"use client";

import React, { useState, useEffect } from "react";
import { parseBulkMCQs } from "@/lib/parser";
import { Question } from "@/types";
import { 
  ClipboardPaste, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  HelpCircle,
  Plus
} from "lucide-react";

interface BulkImportModalProps {
  isOpen: boolean;
  paperId: string;
  currentQuestionsCount: number;
  onClose: () => void;
  onImport: (newQuestions: Question[]) => void;
}

const SAMPLE_TEXT = `1. ગુજરાતમાં સૌથી મોટો બસ સ્ટેન્ડ કયા શહેરમાં આવેલો છે?
A. અમદાવાદ (ગીતા મંદિર)
B. વડોદરા (સેન્ટ્રલ)
C. સુરત
D. રાજકોટ
Answer: A
સમજૂતી: ગીતા મંદિર બસ પોર્ટ એશિયાના આધુનિક બસ સ્ટેશનોમાં ગણાય છે.

2. ટ્રાફિક સિગ્નલમાં લાલ લાઈટ શું દર્શાવે છે?
(A) વાહન ધીમું કરો
(B) વાહન થોભો (Stop)
(C) આગળ વધો
(D) વળાંક લો
Ans: B

3. GSRTC બસમાં વિદ્યાર્થી પાસ માટે કયા દસ્તાવેજની જરૂર પડે છે?
1) બોનાફાઇડ સર્ટીફિકેટ
2) આધાર કાર્ડ
3) પાસપોર્ટ સાઇઝ ફોટો
4) ઉપરોક્ત તમામ
Ans: 4

4. GSRTC નું વડું મથક ક્યાં આવેલું છે?
[A] ગાંધીનગર
[B] અમદાવાદ (રાણીપ)
[C] વડોદરા
[D] સુરત
Answer: B
સમજૂતી: GSRTC નું સેન્ટ્રલ ઓફિસ રાણીપ, અમદાવાદ ખાતે આવેલું છે.`;

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  paperId,
  currentQuestionsCount,
  onClose,
  onImport,
}) => {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<Question[]>([]);
  const [previewTab, setPreviewTab] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (rawText.trim()) {
      const results = parseBulkMCQs(rawText, paperId, currentQuestionsCount + 1);
      setParsed(results);
    } else {
      setParsed([]);
    }
  }, [rawText, paperId, currentQuestionsCount]);

  if (!isOpen) return null;

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRawText(text);
    } catch (err) {
      alert("Clipboard permission not granted. Please paste manually into the box.");
    }
  };

  const handleApplySample = () => {
    setRawText(SAMPLE_TEXT);
  };

  const handleConfirmImport = () => {
    if (parsed.length === 0) return;
    onImport(parsed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardPaste className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                સ્માર્ટ બલ્ક પેસ્ટ (Smart Bulk MCQ Import)
              </h3>
              <p className="text-[11px] text-indigo-100">
                WhatsApp, Telegram, Word કે PDF માંથી એકસાથે ઘણા પ્રશ્નો પેસ્ટ કરો
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePasteFromClipboard}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 flex items-center gap-1 shadow-sm"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-brand-600" />
              <span>ક્લિપબોર્ડ પેસ્ટ (Paste)</span>
            </button>
            <button
              onClick={handleApplySample}
              className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 font-semibold text-indigo-700 flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>સેમ્પલ ઉદાહરણ લો</span>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setPreviewTab("edit")}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                previewTab === "edit"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-200/70 text-slate-700 hover:bg-slate-200"
              }`}
            >
              ટેક્સ્ટ બોક્સ
            </button>
            <button
              onClick={() => setPreviewTab("preview")}
              className={`px-3 py-1 rounded-lg font-bold transition-colors flex items-center gap-1 ${
                previewTab === "preview"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-200/70 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span>લાઇવ પ્રિવ્યૂ</span>
              {parsed.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center">
                  {parsed.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {previewTab === "edit" ? (
            <div className="space-y-2 h-full flex flex-col">
              <div className="text-[11px] text-slate-500 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-start gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>ફોર્મેટ ટિપ:</strong> પ્રશ્ન નંબર (1. અથવા Q1.), ત્યારબાદ વિકલ્પો A, B, C, D (અથવા ક, ખ, ગ, ઘ), અને છેલ્લે <code>Answer: B</code> અથવા <code>Ans: A</code> લખો.
                </span>
              </div>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="અહીં તમારા પ્રશ્નો પેસ્ટ કરો..."
                rows={12}
                className="w-full flex-1 min-h-[220px] p-3 rounded-xl border border-slate-300 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50/50 resize-none leading-relaxed"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {parsed.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  કોઈ પ્રશ્નો ઓળખાયા નથી. કૃપા કરીને ટેક્સ્ટ બોક્સમાં યોગ્ય ફોર્મેટમાં પ્રશ્નો નાખો.
                </div>
              ) : (
                parsed.map((q, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div className="font-bold text-slate-900 flex items-start gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span>{q.questionText}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                      {q.options.map((opt, optIdx) => {
                        const isCorrect = q.correctAnswer === optIdx;
                        const label = String.fromCharCode(65 + optIdx);
                        return (
                          <div
                            key={optIdx}
                            className={`p-1.5 rounded-lg border flex items-center gap-1.5 ${
                              isCorrect
                                ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                                : "bg-white border-slate-200 text-slate-700"
                            }`}
                          >
                            <span className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${
                              isCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                            }`}>
                              {label}
                            </span>
                            <span className="truncate">{opt}</span>
                            {isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-auto flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="pl-6 text-[11px] text-slate-500 italic">
                        💡 સમજૂતી: {q.explanation}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs">
            {parsed.length > 0 ? (
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {parsed.length} પ્રશ્નો સફળતાપૂર્વક ઓળખાયા
              </span>
            ) : (
              <span className="text-slate-400">0 પ્રશ્નો</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs"
            >
              રદ કરો
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={parsed.length === 0}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{parsed.length} પ્રશ્નો ઉમેરો (Import)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
