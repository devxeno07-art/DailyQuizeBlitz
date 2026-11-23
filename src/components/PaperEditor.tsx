"use client";

import React, { useState, useEffect, useRef } from "react";
import { Paper, Question } from "@/types";
import { savePaper, saveTemporaryDraft, getTemporaryDraft } from "@/lib/storage";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  ChevronUp, 
  ChevronDown, 
  CheckCircle2, 
  Sparkles, 
  ClipboardPaste, 
  PlayCircle, 
  Share2, 
  Cloud,
  Search,
  BookOpen,
  Info,
  Check,
  HelpCircle,
  FileDown,
  ExternalLink,
  Award,
  Layers,
  Bot,
  Trophy
} from "lucide-react";
import { BulkImportModal } from "./BulkImportModal";

interface PaperEditorProps {
  paper: Paper;
  onBack: () => void;
  onTakeTest: (paper: Paper) => void;
  onExport: (paper: Paper) => void;
  onOpenTelegram?: (paper: Paper) => void;
  onOpenLeaderboard?: (paper: Paper) => void;
}

export const PaperEditor: React.FC<PaperEditorProps> = ({
  paper,
  onBack,
  onTakeTest,
  onExport,
  onOpenTelegram,
  onOpenLeaderboard,
}) => {
  const [currentPaper, setCurrentPaper] = useState<Paper>(paper);
  const [questions, setQuestions] = useState<Question[]>(paper.questions || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedTestCode, setCopiedTestCode] = useState(false);
  
  // Editor Form State
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [qText, setQText] = useState("");
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [optE, setOptE] = useState("");
  const [hasOptE, setHasOptE] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<number>(0);
  const [explanation, setExplanation] = useState("");

  // Sync / Auto-save State
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(!!paper.isDigitizedCompleted);

  const formRef = useRef<HTMLDivElement>(null);

  // Check for unsaved temporary draft on initial mount
  useEffect(() => {
    const draft = getTemporaryDraft(paper.id);
    if (draft && draft.length > (paper.questions?.length || 0)) {
      if (confirm(`તમારા માટે ${draft.length} પ્રશ્નોનો અગાઉનો વણસેવ કરેલો ડ્રાફ્ટ મળ્યો છે. શું તમે તેને લોડ કરવા માંગો છો?`)) {
        setQuestions(draft);
        persistChanges(draft, isCompleted);
      }
    }
  }, [paper.id]);

  // Save changes to database and draft cache
  const persistChanges = async (newQuestions: Question[], completedState?: boolean) => {
    setSaveStatus("saving");
    saveTemporaryDraft(paper.id, newQuestions);

    const updated: Paper = {
      ...currentPaper,
      questions: newQuestions,
      isDigitizedCompleted: completedState !== undefined ? completedState : isCompleted,
      updatedAt: new Date().toISOString(),
    };

    setCurrentPaper(updated);
    await savePaper(updated);

    setSaveStatus("saved");
    setLastSaved(new Date());
  };

  const toggleCompletedStatus = () => {
    const nextVal = !isCompleted;
    setIsCompleted(nextVal);
    persistChanges(questions, nextVal);
  };

  // Open Form for New Question
  const handleOpenNewQuestion = () => {
    setEditingIndex(null);
    setQText("");
    setOptA("");
    setOptB("");
    setOptC("");
    setOptD("");
    setOptE("લાગુ પડતું નથી / Not Attempted");
    setHasOptE(false);
    setCorrectAnswer(0);
    setExplanation("");
    setIsEditingQuestion(true);

    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Open Form for Editing Existing Question
  const handleEditQuestion = (index: number) => {
    const q = questions[index];
    setEditingIndex(index);
    setQText(q.questionText);
    setOptA(q.options[0] || "");
    setOptB(q.options[1] || "");
    setOptC(q.options[2] || "");
    setOptD(q.options[3] || "");
    setOptE(q.options[4] || "લાગુ પડતું નથી");
    setHasOptE(q.options.length > 4);
    setCorrectAnswer(q.correctAnswer ?? 0);
    setExplanation(q.explanation || "");
    setIsEditingQuestion(true);

    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Save Single Question
  const handleSaveQuestion = (addAnother = false) => {
    if (!qText.trim()) {
      alert("કૃપા કરીને પ્રશ્નની વિગત દાખલ કરો.");
      return;
    }
    if (!optA.trim() || !optB.trim()) {
      alert("ઓછામાં ઓછા વિકલ્પ A અને B દાખલ કરવા જરૂરી છે.");
      return;
    }

    const optionsList = [optA.trim(), optB.trim()];
    if (optC.trim()) optionsList.push(optC.trim());
    if (optD.trim()) optionsList.push(optD.trim());
    if (hasOptE && optE.trim()) optionsList.push(optE.trim());

    const updatedQuestions = [...questions];

    if (editingIndex !== null) {
      updatedQuestions[editingIndex] = {
        ...updatedQuestions[editingIndex],
        questionText: qText.trim(),
        options: optionsList,
        correctAnswer: Math.min(correctAnswer, optionsList.length - 1),
        explanation: explanation.trim(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      const newQ: Question = {
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        paperId: paper.id,
        questionNumber: questions.length + 1,
        questionText: qText.trim(),
        options: optionsList,
        correctAnswer: Math.min(correctAnswer, optionsList.length - 1),
        explanation: explanation.trim(),
        difficulty: "medium",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updatedQuestions.push(newQ);
    }

    const indexed = updatedQuestions.map((q, i) => ({ ...q, questionNumber: i + 1 }));
    setQuestions(indexed);
    persistChanges(indexed);

    if (addAnother) {
      handleOpenNewQuestion();
    } else {
      setIsEditingQuestion(false);
      setEditingIndex(null);
    }
  };

  // Duplicate Question
  const handleDuplicateQuestion = (index: number) => {
    const q = questions[index];
    const newQ: Question = {
      ...q,
      id: `q_${Date.now()}_dup`,
      questionText: `${q.questionText} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...questions];
    updated.splice(index + 1, 0, newQ);
    const indexed = updated.map((item, i) => ({ ...item, questionNumber: i + 1 }));
    setQuestions(indexed);
    persistChanges(indexed);
  };

  // Delete Question
  const handleDeleteQuestion = (index: number) => {
    if (confirm(`શું તમે પ્રશ્ન #${index + 1} ડિલીટ કરવા માંગો છો?`)) {
      const updated = questions.filter((_, i) => i !== index);
      const indexed = updated.map((item, i) => ({ ...item, questionNumber: i + 1 }));
      setQuestions(indexed);
      persistChanges(indexed);
    }
  };

  // Move Up / Move Down
  const handleMove = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === questions.length - 1) return;

    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    const indexed = updated.map((item, i) => ({ ...item, questionNumber: i + 1 }));
    setQuestions(indexed);
    persistChanges(indexed);
  };

  // Handle Bulk Import
  const handleBulkImport = (newBatch: Question[]) => {
    const combined = [...questions, ...newBatch];
    const indexed = combined.map((item, i) => ({ ...item, questionNumber: i + 1 }));
    setQuestions(indexed);
    persistChanges(indexed);
  };

  // Filtered Questions for search
  const filteredQuestions = questions.filter((q) =>
    q.questionText.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.options.some(opt => opt.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-4 pb-28">
      {/* Top Sticky Header */}
      <div className="sticky top-[57px] z-30 bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex-shrink-0"
            title="પાછા જાઓ (Back)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="truncate flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                {currentPaper.title}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex-shrink-0">
                {questions.length} MCQs
              </span>
              {/* Specific Persistent Test Code */}
              {currentPaper.testCode && (
                <div
                  onClick={() => {
                    navigator.clipboard.writeText(`/quiz ${currentPaper.testCode}`);
                    setCopiedTestCode(true);
                    setTimeout(() => setCopiedTestCode(false), 2000);
                  }}
                  className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-300 text-xs font-mono font-bold hover:bg-sky-100 transition-colors shadow-sm"
                  title="ટેલિગ્રામ કમાન્ડ કોપી કરવા ક્લિક કરો"
                >
                  <Bot className="w-3.5 h-3.5 text-sky-600" />
                  <span>કોડ: {currentPaper.testCode}</span>
                  {copiedTestCode ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400" />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span>{currentPaper.subject || currentPaper.category}</span>
              <span>•</span>
              <span className="flex items-center gap-1 font-medium">
                {saveStatus === "saving" ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    <span className="text-amber-700">સાચવી રહ્યું છે...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Auto-Saved ✓</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end flex-wrap">
          {/* Specific Test Telegram Runner Button */}
          <button
            onClick={() => onOpenTelegram?.({ ...currentPaper, questions })}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs shadow-sm transition-all"
            title="આ સ્પેસિફિક ટેસ્ટ ટેલિગ્રામ ગ્રૂપમાં રમાડો"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>ટેલિગ્રામ કોડ ({currentPaper.testCode})</span>
          </button>

          <button
            onClick={() => setBulkModalOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs border border-indigo-200 transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>બલ્ક પેસ્ટ (Paste)</span>
          </button>

          <button
            onClick={() => onTakeTest({ ...currentPaper, questions })}
            disabled={questions.length === 0}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs border border-emerald-200 transition-colors disabled:opacity-50"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>ટેસ્ટ આપો</span>
          </button>

          <button
            onClick={() => onOpenLeaderboard?.({ ...currentPaper, questions })}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs border border-amber-200 transition-colors"
            title="પરિણામ & લીડરબોર્ડ સ્કોર જુઓ"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-600" />
            <span>પરિણામ</span>
          </button>

          <button
            onClick={() => onExport({ ...currentPaper, questions })}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="Export & Print"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pinned PDF Source Helper Banner (if linked to Google Drive Old Paper) */}
      {currentPaper.sourcePdfUrl && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-3.5 border border-orange-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center flex-shrink-0">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                <span>ઓરિજિનલ PDF સોર્સ સાથે જોડાયેલ છે</span>
                <span className="text-[10px] bg-orange-200/70 text-orange-800 px-1.5 py-0.2 rounded font-mono">
                  Drive Link
                </span>
              </div>
              <p className="text-[11px] text-orange-800 mt-0.5">
                PDF ખોલીને એકસાથે પ્રશ્નો જોઈને અહીં ટાઈપ કે બલ્ક પેસ્ટ કરો.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <a
              href={currentPaper.sourcePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-orange-100/70 text-orange-900 border border-orange-300 font-bold text-xs flex items-center gap-1 shadow-sm"
            >
              <span>PDF ઓપન કરો</span>
              <ExternalLink className="w-3 h-3 text-orange-600" />
            </a>

            <button
              onClick={toggleCompletedStatus}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all ${
                isCompleted
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isCompleted ? "ડિજિટાઇઝ્ડ પૂર્ણ ✓" : "પૂર્ણ માર્ક કરો"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Editor Form (Inline / Accordion for smooth mobile typing) */}
      {isEditingQuestion && (
        <div
          ref={formRef}
          className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-brand-500 shadow-xl space-y-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-lg bg-brand-600 text-white font-bold text-xs flex items-center justify-center">
                {editingIndex !== null ? `#${editingIndex + 1}` : `#${questions.length + 1}`}
              </span>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                {editingIndex !== null ? "પ્રશ્ન સુધારો (Edit Question)" : "નવો પ્રશ્ન ઉમેરો (New Question)"}
              </h3>
            </div>
            <button
              onClick={() => setIsEditingQuestion(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 rounded-lg hover:bg-slate-100"
            >
              બંધ કરો
            </button>
          </div>

          {/* Question Textarea */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              પ્રશ્ન (Question Text) *
            </label>
            <textarea
              rows={3}
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="દા.ત. GSRTC નું મુખ્ય કાર્યાલય ક્યાં આવેલું છે?"
              required
              className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm text-slate-900 leading-relaxed resize-none"
            />
          </div>

          {/* Options Inputs with Correct Answer Pills */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                વિકલ્પો અને સાચો જવાબ (Options & Correct Answer) *
              </label>
              <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                સાચા વિકલ્પ પર ક્લિક કરો (Click green badge)
              </span>
            </div>

            {/* Option A */}
            <div className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
              correctAnswer === 0 ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 bg-white"
            }`}>
              <button
                type="button"
                onClick={() => setCorrectAnswer(0)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                  correctAnswer === 0 ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="Mark as Correct Answer"
              >
                A
              </button>
              <input
                type="text"
                value={optA}
                onChange={(e) => setOptA(e.target.value)}
                placeholder="વિકલ્પ A..."
                className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
              />
              {correctAnswer === 0 && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mr-1" />}
            </div>

            {/* Option B */}
            <div className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
              correctAnswer === 1 ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 bg-white"
            }`}>
              <button
                type="button"
                onClick={() => setCorrectAnswer(1)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                  correctAnswer === 1 ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="Mark as Correct Answer"
              >
                B
              </button>
              <input
                type="text"
                value={optB}
                onChange={(e) => setOptB(e.target.value)}
                placeholder="વિકલ્પ B..."
                className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
              />
              {correctAnswer === 1 && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mr-1" />}
            </div>

            {/* Option C */}
            <div className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
              correctAnswer === 2 ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 bg-white"
            }`}>
              <button
                type="button"
                onClick={() => setCorrectAnswer(2)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                  correctAnswer === 2 ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="Mark as Correct Answer"
              >
                C
              </button>
              <input
                type="text"
                value={optC}
                onChange={(e) => setOptC(e.target.value)}
                placeholder="વિકલ્પ C..."
                className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
              />
              {correctAnswer === 2 && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mr-1" />}
            </div>

            {/* Option D */}
            <div className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
              correctAnswer === 3 ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 bg-white"
            }`}>
              <button
                type="button"
                onClick={() => setCorrectAnswer(3)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                  correctAnswer === 3 ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="Mark as Correct Answer"
              >
                D
              </button>
              <input
                type="text"
                value={optD}
                onChange={(e) => setOptD(e.target.value)}
                placeholder="વિકલ્પ D..."
                className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
              />
              {correctAnswer === 3 && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mr-1" />}
            </div>

            {/* Optional Option E (Gujarat Exam Standard: Not Attempted) */}
            {hasOptE ? (
              <div className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
                correctAnswer === 4 ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 bg-white"
              }`}>
                <button
                  type="button"
                  onClick={() => setCorrectAnswer(4)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                    correctAnswer === 4 ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  title="Mark as Correct Answer"
                >
                  E
                </button>
                <input
                  type="text"
                  value={optE}
                  onChange={(e) => setOptE(e.target.value)}
                  placeholder="વિકલ્પ E (દા.ત. લાગુ પડતું નથી)..."
                  className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setHasOptE(false);
                    if (correctAnswer === 4) setCorrectAnswer(0);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-700 px-2"
                >
                  કાઢી નાખો
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHasOptE(true)}
                className="text-xs text-brand-600 font-bold hover:underline flex items-center gap-1 pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ E વિકલ્પ ઉમેરો (લાગુ પડતું નથી / Not Attempted)</span>
              </button>
            )}
          </div>

          {/* Explanation / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              સમજૂતી / ઉત્તર વિગત (Explanation - Optional)
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="શા માટે આ જવાબ સાચો છે તેની ટૂંકી વિગત..."
              className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs text-slate-900 resize-none"
            />
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditingQuestion(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100"
            >
              રદ કરો
            </button>
            <button
              type="button"
              onClick={() => handleSaveQuestion(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs"
            >
              સેવ કરો (Save)
            </button>
            <button
              type="button"
              onClick={() => handleSaveQuestion(true)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 flex items-center justify-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>સેવ કરો અને નવો પ્રશ્ન ઉમેરો</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Search & Add New Button */}
      {!isEditingQuestion && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="પેપરના પ્રશ્નોમાં શોધો..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
            />
          </div>

          <button
            onClick={handleOpenNewQuestion}
            className="flex items-center space-x-1 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 hover:bg-brand-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>નવો પ્રશ્ન ઉમેરો</span>
          </button>
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
            <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm sm:text-base">
              આ પેપરમાં હજુ કોઈ પ્રશ્ન ડિજિટાઇઝ થયો નથી
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              તમે જાતે પ્રશ્નો ટાઈપ કરી શકો છો અથવા PDF/WhatsApp માંથી એકસાથે પ્રશ્નો બલ્ક પેસ્ટ કરી શકો છો.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleOpenNewQuestion}
                className="px-4 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 hover:bg-brand-700 flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>પ્રશ્ન ટાઈપ કરો</span>
              </button>
              <button
                onClick={() => setBulkModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs hover:bg-indigo-100 flex items-center space-x-1"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>બલ્ક પેસ્ટ કરો</span>
              </button>
            </div>
          </div>
        ) : (
          filteredQuestions.map((q, index) => {
            const labels = ["A", "B", "C", "D", "E"];
            return (
              <div
                key={q.id || index}
                className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow space-y-3"
              >
                {/* Question Header & Order Actions */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      {q.questionNumber || index + 1}
                    </span>
                    <p className="text-sm font-bold text-slate-900 leading-snug">
                      {q.questionText}
                    </p>
                  </div>

                  {/* Ordering & Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMove(index, "up")}
                      disabled={index === 0}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                      title="Move Up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(index, "down")}
                      disabled={index === questions.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                      title="Move Down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicateQuestion(index)}
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEditQuestion(index)}
                      className="p-1 rounded text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(index)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Options List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                  {q.options.map((opt, optIdx) => {
                    const isCorrect = q.correctAnswer === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                          isCorrect
                            ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                            : "bg-slate-50/70 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={`w-5 h-5 rounded-md text-[11px] flex items-center justify-center font-bold flex-shrink-0 ${
                            isCorrect ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                          }`}>
                            {labels[optIdx]}
                          </span>
                          <span className="truncate">{opt}</span>
                        </div>
                        {isCorrect && (
                          <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5 flex-shrink-0">
                            <Check className="w-3 h-3" />
                            <span>સાચો</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {q.explanation && (
                  <div className="pl-8 pt-1 text-xs text-slate-500 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-800">સમજૂતી:</strong> {q.explanation}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={bulkModalOpen}
        paperId={paper.id}
        currentQuestionsCount={questions.length}
        onClose={() => setBulkModalOpen(false)}
        onImport={handleBulkImport}
      />
    </div>
  );
};
