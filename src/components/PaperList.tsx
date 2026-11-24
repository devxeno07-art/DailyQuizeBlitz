"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Paper, Question } from "@/types";
import { deletePaper, savePaper, generateTestCode, fetchCommunityPapers } from "@/lib/storage";
import { SAMPLE_GSRTC_PAPER } from "@/data/samplePaper";
import { 
  Plus, 
  Search, 
  BookOpen, 
  Clock, 
  Trash2, 
  Edit3, 
  PlayCircle, 
  Share2, 
  Sparkles, 
  Layers, 
  CheckCircle,
  FileCheck,
  AlertCircle,
  Bot,
  Copy,
  Trophy,
  Upload,
  FileJson,
  CopyPlus,
  Loader2,
  Users,
  Lock,
  Globe,
  RefreshCw,
  Eye,
  Printer
} from "lucide-react";

interface PaperListProps {
  onSelectPaper: (paper: Paper) => void;
  onOpenCreate: () => void;
  onTakeTest: (paper: Paper) => void;
  onExport: (paper: Paper) => void;
  onOpenTelegramQuiz?: (paper: Paper) => void;
  onOpenLeaderboard?: (paper: Paper) => void;
}

export const PaperList: React.FC<PaperListProps> = ({
  onSelectPaper,
  onOpenCreate,
  onTakeTest,
  onExport,
  onOpenTelegramQuiz,
  onOpenLeaderboard,
}) => {
  const { user, papers } = useAuth();
  const [paperScope, setPaperScope] = useState<"my" | "community" | "all">("my");
  const [communityPapers, setCommunityPapers] = useState<Paper[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCommunity = useCallback(async () => {
    setLoadingCommunity(true);
    try {
      const list = await fetchCommunityPapers();
      setCommunityPapers(list);
    } catch (e) {
      console.warn("Could not load community papers", e);
    } finally {
      setLoadingCommunity(false);
    }
  }, []);

  useEffect(() => {
    loadCommunity();

    const handleUpdate = () => {
      loadCommunity();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("mcq_papers_updated", handleUpdate);
      return () => {
        window.removeEventListener("mcq_papers_updated", handleUpdate);
      };
    }
  }, [loadCommunity]);

  if (!user) return null;

  const handleCopyCode = (paper: Paper, e: React.MouseEvent) => {
    e.stopPropagation();
    const code = paper.testCode || "GSRTC-1001";
    navigator.clipboard.writeText(`/quiz ${code}`);
    setCopiedCodeId(paper.id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Separate personal papers vs community papers created by other users
  const myPapers = papers;
  const communityOnlyPapers = communityPapers.filter(
    (cp) =>
      !myPapers.some(
        (mp) =>
          mp.id === cp.id ||
          (mp.testCode && cp.testCode && mp.testCode.toUpperCase() === cp.testCode.toUpperCase())
      )
  );

  let activePapers: Paper[] = [];
  if (paperScope === "my") {
    activePapers = myPapers;
  } else if (paperScope === "community") {
    activePapers = communityOnlyPapers;
  } else {
    activePapers = [...myPapers, ...communityOnlyPapers];
  }

  const filteredPapers = activePapers.filter((paper) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      paper.title.toLowerCase().includes(term) ||
      (paper.subject && paper.subject.toLowerCase().includes(term)) ||
      (paper.category && paper.category.toLowerCase().includes(term)) ||
      (paper.userName && paper.userName.toLowerCase().includes(term)) ||
      (paper.testCode && paper.testCode.toLowerCase().includes(term));

    const matchesCategory =
      selectedCategory === "all" || paper.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const totalQuestions = myPapers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
  const categories = [
    "all",
    ...Array.from(new Set(activePapers.map((p) => p.category).filter(Boolean))),
  ];

  const handleDelete = async (paper: Paper, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      confirm(
        `શું તમે ખરેખર "${paper.title}" પ્રશ્નપત્ર ડિલીટ કરવા માંગો છો? આ પ્રક્રિયા પાછી ખેંચી શકાશે નહીં.`
      )
    ) {
      setDeletingId(paper.id);
      try {
        await deletePaper(paper.id, paper.testCode);
        setCommunityPapers((prev) =>
          prev.filter(
            (p) =>
              p.id !== paper.id &&
              (!paper.testCode ||
                p.testCode?.toUpperCase() !== paper.testCode.toUpperCase())
          )
        );
      } catch (err: any) {
        alert(err?.message || "પેપર ડિલીટ કરવામાં ક્ષતિ થઈ.");
      } finally {
        setDeletingId(null);
      }
    }
  };

  // Clone any paper into a fresh owned copy (new ids + new test code)
  const buildPaperForUser = (source: Partial<Paper>, titleSuffix = ""): Paper => {
    const sourceQuestions = Array.isArray(source.questions) ? source.questions : [];
    const now = new Date().toISOString();
    const newId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const questions: Question[] = sourceQuestions.slice(0, 500).map((q: any, idx: number) => {
      const options = Array.isArray(q?.options)
        ? q.options.map((o: any) => String(o ?? "")).slice(0, 10)
        : [];
      const correctAnswer = Math.min(
        Math.max(0, Number(q?.correctAnswer) || 0),
        Math.max(0, options.length - 1)
      );

      return {
        id: `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        paperId: newId,
        questionNumber: idx + 1,
        questionText: String(q?.questionText || "").trim(),
        options,
        correctAnswer,
        explanation: q?.explanation ? String(q.explanation) : "",
        difficulty: ["easy", "medium", "hard"].includes(q?.difficulty) ? q.difficulty : undefined,
        tags: Array.isArray(q?.tags) ? q.tags.map((t: any) => String(t)) : undefined,
        createdAt: now,
        updatedAt: now,
      };
    });

    return {
      id: newId,
      userId: user.id,
      userName: user.name,
      title: `${String(source.title || "ઈમ્પોર્ટેડ પેપર")}${titleSuffix}`.slice(0, 200),
      subject: String(source.subject || "").slice(0, 200),
      category: String(source.category || "GSRTC").slice(0, 80),
      description: source.description ? String(source.description).slice(0, 1000) : undefined,
      targetQuestions: Math.max(1, Number(source.targetQuestions) || questions.length || 50),
      timeLimitMinutes: Math.max(1, Number(source.timeLimitMinutes) || 60),
      isPublic: Boolean(source.isPublic),
      testCode: generateTestCode(source.category || "GSRTC"),
      sourcePaperId: source.sourcePaperId,
      sourcePdfUrl: source.sourcePdfUrl,
      isDigitizedCompleted: source.isDigitizedCompleted,
      questions,
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleImportFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setImporting(true);
    setImportMsg(null);
    let imported = 0;
    const errors: string[] = [];

    for (const file of files.slice(0, 10)) {
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];

        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const sourceQuestions = Array.isArray(item?.questions) ? item.questions : [];
          const validQuestions = sourceQuestions.filter(
            (q: any) =>
              q &&
              typeof q.questionText === "string" &&
              q.questionText.trim().length > 0 &&
              Array.isArray(q.options) &&
              q.options.filter((o: any) => String(o ?? "").trim().length > 0).length >= 2
          );

          if (validQuestions.length === 0) {
            errors.push(`${file.name}: કોઈ માન્ય પ્રશ્ન મળ્યો નથી`);
            continue;
          }

          const paper = buildPaperForUser(
            { ...item, questions: validQuestions },
            list.length > 1 ? ` (${i + 1})` : ""
          );
          await savePaper(paper);
          imported++;
        }
      } catch (err: any) {
        errors.push(`${file.name}: ${err?.message || "અમાન્ય JSON"}`);
      }
    }

    setImporting(false);
    if (imported > 0) {
      setImportMsg({
        ok: true,
        text:
          `${imported} પેપર સફળતાપૂર્વક ઈમ્પોર્ટ થયું.` +
          (errors.length ? ` (${errors.length} એન્ટ્રીમાં ભૂલ હતી)` : ""),
      });
    } else {
      setImportMsg({
        ok: false,
        text: errors.join(" • ") || "કૃપા કરીને માન્ય MCQ Master JSON ફાઈલ પસંદ કરો.",
      });
    }
  };

  const handleDuplicatePaper = async (paper: Paper, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await savePaper(buildPaperForUser(paper, " (કોપી)"));
    } catch (err: any) {
      alert(err?.message || "પેપરની કોપી બનાવી શકાઈ નહીં.");
    }
  };

  const handleLoadSample = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const paper = buildPaperForUser(
        SAMPLE_GSRTC_PAPER as unknown as Partial<Paper>
      );
      await savePaper(paper);
      setImportMsg({
        ok: true,
        text: "નમૂનો મોક ટેસ્ટ પેપર ઉમેરાયું! હવે ટેસ્ટ આપો અથવા ટેલિગ્રામ કોડ બનાવો.",
      });
    } catch (err: any) {
      setImportMsg({
        ok: false,
        text: err?.message || "નમૂનો પેપર લોડ કરી શકાયું નહીં.",
      });
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("gu-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* User Stats Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 rounded-3xl p-5 text-white shadow-xl shadow-brand-500/15">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200 bg-white/10 px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                વ્યક્તિગત ડેશબોર્ડ (Your Dashboard)
              </span>
              <h2 className="text-xl sm:text-2xl font-black mt-1.5 tracking-tight">
                નમસ્તે, {user.name} 👋
              </h2>
              <p className="text-xs text-indigo-100 font-mono mt-0.5">
                મોબાઈલ: {user.phoneNumber}
              </p>
            </div>

            <button
              onClick={onOpenCreate}
              className="hidden sm:flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-white text-brand-700 font-bold text-xs shadow-md hover:bg-indigo-50 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>નવું પેપર બનાવો</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/15">
            <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm text-center">
              <div className="text-lg sm:text-2xl font-black">{papers.length}</div>
              <div className="text-[10px] sm:text-xs text-indigo-100 font-medium">કુલ પેપર્સ</div>
            </div>
            <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm text-center">
              <div className="text-lg sm:text-2xl font-black">{totalQuestions}</div>
              <div className="text-[10px] sm:text-xs text-indigo-100 font-medium">બનાવેલ MCQs</div>
            </div>
            <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-sm text-center">
              <div className="text-lg sm:text-2xl font-black">100%</div>
              <div className="text-[10px] sm:text-xs text-indigo-100 font-medium">Auto-Sync સક્રિય</div>
            </div>
          </div>
        </div>

        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Scope Selector: My Papers vs Community Tests */}
      <div className="flex items-center justify-between border-b border-slate-200/90 pb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
          <button
            onClick={() => setPaperScope("my")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              paperScope === "my"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>મારા પેપર્સ</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                paperScope === "my"
                  ? "bg-brand-50 text-brand-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {myPapers.length}
            </span>
          </button>

          <button
            onClick={() => setPaperScope("community")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              paperScope === "community"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-indigo-600" />
            <span>કમ્યુનિટી ટેસ્ટ્સ</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                paperScope === "community"
                  ? "bg-indigo-50 text-indigo-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {communityOnlyPapers.length}
            </span>
          </button>

          <button
            onClick={() => setPaperScope("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              paperScope === "all"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <span>બધા</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                paperScope === "all"
                  ? "bg-slate-200 text-slate-900"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {myPapers.length + communityOnlyPapers.length}
            </span>
          </button>
        </div>

        <button
          onClick={loadCommunity}
          disabled={loadingCommunity}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors flex-shrink-0"
          title="કમ્યુનિટી પેપર્સ રિફ્રેશ કરો"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              loadingCommunity ? "animate-spin text-brand-600" : ""
            }`}
          />
        </button>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="પેપર અથવા વિષય શોધો... (Search Papers)"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
            />
          </div>

          <button
            onClick={onOpenCreate}
            className="sm:hidden flex items-center space-x-1 px-3.5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>નવું પેપર</span>
          </button>
        </div>

        {/* Import / sample quick actions (shown in My Papers view) */}
        {paperScope !== "community" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
              title="અગાઉ એક્સપોર્ટ કરેલી JSON ફાઈલ ઈમ્પોર્ટ કરો"
            >
              {importing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-brand-600" />
              )}
              <span>JSON ઈમ્પોર્ટ</span>
            </button>

            <button
              onClick={handleLoadSample}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-emerald-800 hover:from-emerald-100 hover:to-teal-100 font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
              title="25 GSRTC પ્રશ્નોનો તૈયાર નમૂનો ઉમેરો"
            >
              <FileJson className="w-3.5 h-3.5 text-emerald-600" />
              <span>GSRTC નમૂનો લોડ કરો</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={handleImportFiles}
            />
          </div>
        )}

        {importMsg && (
          <div
            className={`p-2.5 rounded-xl text-xs font-semibold border flex items-start gap-2 animate-fadeIn ${
              importMsg.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {importMsg.ok ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            )}
            <span>{importMsg.text}</span>
          </div>
        )}

        {categories.length > 2 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat === "all" ? "બધા (All)" : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Papers Grid */}
      {filteredPapers.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-base text-slate-800">
            {paperScope === "community"
              ? "હજુ સુધી અન્ય શિક્ષક દ્વારા કોઈ જાહેર ટેસ્ટ બનાવવામાં આવ્યો નથી"
              : myPapers.length === 0
              ? "હજુ સુધી કોઈ પેપર બનાવ્યું નથી"
              : "કોઈ મેળ ખાતું પેપર મળ્યું નથી"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            {paperScope === "community"
              ? "તમે નવું પેપર બનાવીને ટેલિગ્રામ કોડ જનરેટ કરી શકો છો, જેથી અન્ય વિદ્યાર્થીઓ પણ તેનો ટેસ્ટ આપી શકે."
              : myPapers.length === 0
              ? "તમારું પ્રથમ પ્રશ્નપત્ર બનાવો અને તેમાં પ્રશ્નો ટાઈપ કરો અથવા કોપી-પેસ્ટ કરો."
              : "બીજું કંઈક શોધો અથવા ફિલ્ટર બદલો."}
          </p>
          {paperScope !== "community" && myPapers.length === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={onOpenCreate}
                className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 hover:bg-brand-700"
              >
                <Plus className="w-4 h-4" />
                <span>પ્રથમ પેપર બનાવો</span>
              </button>
              <button
                onClick={handleLoadSample}
                disabled={importing}
                className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs hover:bg-emerald-100 disabled:opacity-50"
              >
                <FileJson className="w-4 h-4" />
                <span>GSRTC નમૂનો લોડ કરો</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPapers.map((paper) => {
            const count = paper.questions?.length || 0;
            const target = paper.targetQuestions || 50;
            const percent = Math.min(100, Math.round((count / target) * 100));

            const isOwner = Boolean(
              user &&
                (paper.userId === user.id ||
                  (paper.creatorPhone &&
                    user.phoneNumber &&
                    paper.creatorPhone === user.phoneNumber) ||
                  (!paper.userId &&
                    !paper.creatorPhone &&
                    myPapers.some((p) => p.id === paper.id)))
            );

            return (
              <div
                key={paper.id}
                onClick={() => onSelectPaper(paper)}
                className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {paper.category || "General"}
                      </span>

                      {paper.testCode && (
                        <span
                          onClick={(e) => handleCopyCode(paper, e)}
                          className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-300 hover:bg-sky-100 flex items-center gap-1 shadow-sm cursor-pointer"
                          title="કમાન્ડ કોપી કરવા ક્લિક કરો (/quiz CODE)"
                        >
                          <Bot className="w-3 h-3 text-sky-600" />
                          <span>કોડ: {paper.testCode}</span>
                          {copiedCodeId === paper.id ? (
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-400" />
                          )}
                        </span>
                      )}

                      {!isOwner && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          <span>વાંચન મોડ (Read-Only)</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatDate(paper.updatedAt)}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-base leading-snug group-hover:text-brand-600 transition-colors line-clamp-2">
                    {paper.title}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
                    {paper.subject && <span>વિષય: {paper.subject}</span>}
                    {paper.userName && (
                      <>
                        <span>•</span>
                        <span className="text-slate-600 font-semibold truncate">
                          બનાવનાર: {paper.userName}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-brand-600" />
                        પ્રશ્નો: {count} {isOwner ? `/ ${target}` : "MCQs"}
                      </span>
                      {isOwner && (
                        <span className="font-bold text-brand-600">{percent}%</span>
                      )}
                    </div>
                    {isOwner && (
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-brand-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1">
                    {/* Take Test (Available for all) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTakeTest(paper);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs border border-emerald-200 transition-colors"
                      title="ટેસ્ટ મોડ શરૂ કરો"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ટેસ્ટ આપો</span>
                    </button>

                    {/* View Leaderboard Results */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLeaderboard?.(paper);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs border border-amber-200 transition-colors"
                      title="પરિણામ & લીડરબોર્ડ સ્કોર જુઓ"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-600" />
                      <span>પરિણામ</span>
                    </button>

                    {/* Telegram Bot Code Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTelegramQuiz?.(paper);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-800 hover:bg-sky-100 font-bold text-xs border border-sky-300 transition-colors"
                      title="ટેલિગ્રામ ગ્રૂપ ક્વિઝ કોડ બનાવો / જુઓ"
                    >
                      <Bot className="w-3.5 h-3.5 text-sky-600" />
                      <span>{paper.testCode || "Telegram કોડ"}</span>
                    </button>

                    {/* Share / Export */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(paper);
                      }}
                      className="p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                      title="શેર / Export"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>

                    {/* PDF Studio (Direct Auto-Load) */}
                    <a
                      href={`/pdf-studio?paperId=${paper.id}&quizCode=${paper.testCode || ""}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-xs border border-emerald-300 transition-colors"
                      title="PDF Studio માં પ્રશ્નો લોડ કરો અને પ્રિન્ટ કરો"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-600" />
                      <span>PDF</span>
                    </a>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* View / Edit Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPaper(paper);
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold text-xs border border-brand-200 transition-colors"
                    >
                      {isOwner ? (
                        <>
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>એડિટ</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>જોવો</span>
                        </>
                      )}
                    </button>

                    {/* Duplicate / Clone to library */}
                    <button
                      onClick={(e) => handleDuplicatePaper(paper, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      title={
                        isOwner
                          ? "આ પેપરની કોપી બનાવો (Duplicate)"
                          : "તમારી લાઇબ્રેરીમાં નકલ કરો (Clone to My Library)"
                      }
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Paper (Owner Only!) */}
                    {isOwner && (
                      <button
                        onClick={(e) => handleDelete(paper, e)}
                        disabled={deletingId === paper.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                        title="Delete Paper"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile Floating Action Button */}
      <button
        onClick={onOpenCreate}
        className="fixed bottom-6 right-6 z-30 sm:hidden w-14 h-14 rounded-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-float flex items-center justify-center transform active:scale-95 transition-all"
        aria-label="નવું પેપર બનાવો"
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
};
