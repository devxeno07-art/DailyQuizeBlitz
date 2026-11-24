"use client";

import React, { useState, useEffect, useMemo, Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Paper, Question, TelegramQuiz } from "@/types";
import { getTelegramQuizByCode } from "@/lib/storage";
import { 
  ArrowLeft, 
  Printer, 
  RefreshCw, 
  Trash2, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  Download,
  Search,
  Bot,
  Layers
} from "lucide-react";

interface ParsedMCQ {
  num: string;
  qText: string;
  options: Array<{ letter: string; text: string }>;
  ans: string;
  exp: string;
}

const WatermarkSVG = ({ handle, className }: { handle: string; className: string }) => {
  const cleanHandle = handle.trim() || "@databasehandlerbot";
  return (
    <svg className={className} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="qb-wm-pattern" width="260" height="210" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <text
            x="15"
            y="95"
            fill="#1e3a8a"
            fillOpacity="0.08"
            fontFamily="system-ui, sans-serif"
            fontSize="22"
            fontWeight="800"
            letterSpacing="1"
          >
            {cleanHandle}
          </text>
          <text
            x="50"
            y="120"
            fill="#1e3a8a"
            fillOpacity="0.05"
            fontFamily="system-ui, sans-serif"
            fontSize="11"
            fontWeight="700"
            letterSpacing="2.5"
          >
            OFFICIAL STUDY MATERIAL
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#qb-wm-pattern)" />
    </svg>
  );
};

function formatQuestionsToRawText(questions: Question[]): string {
  const labels = ["A", "B", "C", "D", "E", "F"];
  return (questions || [])
    .map((q, idx) => {
      // Strip any existing index prefix like "1. ", "[59/60] ", "૧. " to prevent double-numbering
      const cleanedText = (q.questionText || "")
        .replace(/^(?:\[?\d+\/\d+\]?\s*|(?:\d+|[૦-૯]+)[\.\-\)]\s*)/, "")
        .trim();
      let block = `${idx + 1}. ${cleanedText}\n`;
      (q.options || []).forEach((opt: string, optIdx: number) => {
        block += `${labels[optIdx] || optIdx + 1}) ${opt}\n`;
      });
      if (q.correctAnswer !== undefined && q.correctAnswer >= 0) {
        block += `Ans: ${labels[q.correctAnswer] || "A"}\n`;
      }
      if (q.explanation && q.explanation.trim()) {
        block += `Exp: ${q.explanation.trim()}\n`;
      }
      return block.trim();
    })
    .join("\n\n");
}

function PdfStudioContent() {
  const { papers } = useAuth();
  const searchParams = useSearchParams();
  const paperId = searchParams.get("paperId");
  const quizCodeParam = searchParams.get("quizCode");

  const [theme, setTheme] = useState<"blue" | "royal" | "emerald" | "crimson">("blue");
  const [columns, setColumns] = useState<"1" | "2">("1");
  const [fontSize, setFontSize] = useState("13px");
  const [mode, setMode] = useState<"study" | "exam_key" | "exam_only">("study");

  const [title, setTitle] = useState("ગુજરાત જિલ્લા વિશેષ – વડોદરા");
  const [subtitle, setSubtitle] = useState("સંપૂર્ણ ઇતિહાસ, ભૂગોળ, વહીવટ, સંસ્કૃતિ, પ્રવાસન અને સામાન્ય જ્ઞાન");
  const [fileName, setFileName] = useState("Gujarat_District_Vadodara");
  const [watermarkHandle, setWatermarkHandle] = useState("@databasehandlerbot");

  // Quick loader states
  const [quizCodeInput, setQuizCodeInput] = useState<string>(quizCodeParam || "");
  const [isLoadingQuiz, setIsLoadingQuiz] = useState<boolean>(false);
  const [loadStatusMsg, setLoadStatusMsg] = useState<string>("");

  const [rawText, setRawText] = useState(
`1. પ્રાચીન તામ્રપત્રો અને અભિલેખોમાં વડોદરાનો ઉલ્લેખ કયા નામે જોવા મળે છે?
A) અણહિલપુર
B) વટપદ્રક
C) ચંપાવતી
D) કર્ણાવતી
Ans: B
Exp: પ્રાચીન તામ્રપત્રોમાં વડના વૃક્ષોની વિપુલતાને કારણે વડોદરાનો ઉલ્લેખ વટપદ્રક તરીકે કરવામાં આવ્યો છે.

2. વડોદરામાં લક્ષ્મી વિલાસ પેલેસનું નિર્માણ કયા પ્રજાવત્સલ મહારાજા દ્વારા કરવામાં આવ્યું હતું?
A) સયાજીરાવ ગાયકવાડ ત્રીજા
B) ખંડેરાવ ગાયકવાડ
C) દામાજીરાવ ગાયકવાડ
D) પ્રતાપસિંહરાવ ગાયકવાડ
Ans: A
Exp: મહારાજા સયાજીરાવ ગાયકવાડ ત્રીજાએ ૧૮૯૦ માં આ ભવ્ય પેલેસનું નિર્માણ કરાવ્યું હતું, જેનું મુખ્ય વાસ્તુકાર મેજર ચાર્લ્સ મન્ટ હતા.`
  );

  const autoLoadedRef = useRef(false);

  const loadTelegramQuizByCode = async (code: string) => {
    const trimmed = (code || "").trim();
    if (!trimmed) return;
    setIsLoadingQuiz(true);
    setLoadStatusMsg("");
    try {
      let qz: TelegramQuiz | null = null;
      try {
        const res = await fetch(`/api/telegram/quiz/${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.quiz) {
            qz = data.quiz;
          }
        }
      } catch (netErr) {
        // Network error, try local storage fallback
      }

      if (!qz) {
        qz = await getTelegramQuizByCode(trimmed);
      }

      if (qz) {
        setTitle(qz.title || "Telegram Mock Test");
        setSubtitle(
          qz.subject
            ? `વિષય: ${qz.subject} • ટેલિગ્રામ કોડ: ${qz.code}`
            : `ટેલિગ્રામ ટેસ્ટ: ${qz.code}`
        );
        const cleanFile = (qz.title || qz.code)
          .trim()
          .replace(/[<>:"/\\|?*]+/g, "")
          .replace(/\s+/g, "_");
        setFileName(cleanFile);
        if (qz.questions && qz.questions.length > 0) {
          setRawText(formatQuestionsToRawText(qz.questions));
          setLoadStatusMsg(`✓ ટેસ્ટ [${qz.code}] ના ${qz.questions.length} પ્રશ્નો સફળતાપૂર્વક લોડ થયા!`);
        } else {
          setLoadStatusMsg(`! ટેસ્ટ [${qz.code}] મળ્યો પરંતુ તેમાં પ્રશ્નો નથી.`);
        }
      } else {
        setLoadStatusMsg(`❌ કોડ [${trimmed}] વાળો ટેસ્ટ મળ્યો નથી.`);
      }
    } catch (err) {
      console.error(err);
      setLoadStatusMsg(`❌ ટેસ્ટ લોડ કરવામાં ભૂલ આવી.`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const loadPaperById = (pId: string) => {
    if (!pId || !papers) return;
    const found = papers.find((p) => p.id === pId);
    if (!found) return;
    setTitle(found.title || "સ્પર્ધાત્મક પરીક્ષા પ્રશ્નપત્ર");
    setSubtitle(found.subject ? `વિષય: ${found.subject} • મોક ટેસ્ટ` : "");
    const cleanFile = (found.title || "paper")
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "")
      .replace(/\s+/g, "_");
    setFileName(cleanFile);
    if (found.questions && found.questions.length > 0) {
      setRawText(formatQuestionsToRawText(found.questions));
      setLoadStatusMsg(`✓ પેપર "${found.title}" ના ${found.questions.length} પ્રશ્નો સફળતાપૂર્વક લોડ થયા!`);
    } else {
      setLoadStatusMsg(`! પસંદ કરેલા પેપરમાં પ્રશ્નો નથી.`);
    }
  };

  // Auto-populate from selected paper or telegram quiz on initial mount (guarded from re-fetching on AuthContext updates)
  useEffect(() => {
    if (autoLoadedRef.current) return;

    if (quizCodeParam) {
      autoLoadedRef.current = true;
      setQuizCodeInput(quizCodeParam);
      loadTelegramQuizByCode(quizCodeParam);
    } else if (paperId && papers && papers.length > 0) {
      autoLoadedRef.current = true;
      loadPaperById(paperId);
    }
  }, [quizCodeParam, paperId, papers]);

  // Parse raw text into structured MCQ items
  const parsedItems = useMemo((): ParsedMCQ[] => {
    const normalized = rawText.replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];

    const blocks = normalized
      .split(/(?=(?:^|\n)\s*\d+\.\s+)/)
      .map((b) => b.trim())
      .filter(Boolean);

    const parsed: ParsedMCQ[] = [];

    blocks.forEach((block, index) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) return;

      let num = String(index + 1);
      let qText = "";
      const options: Array<{ letter: string; text: string }> = [];
      let ans = "";
      let exp = "";
      let currentField = "q";

      lines.forEach((line, i) => {
        if (i === 0) {
          const match = line.match(/^(\d+)\.\s*(.*)$/);
          if (match) {
            num = match[1];
            qText = match[2];
          } else {
            qText = line;
          }
          return;
        }

        const optMatch = line.match(/^([A-F])\)\s*(.*)$/i);
        const ansMatch = line.match(/^Ans\s*[:\-]\s*([A-F])/i);
        const expMatch = line.match(/^Exp\s*[:\-]\s*(.*)$/i);

        if (optMatch) {
          options.push({
            letter: optMatch[1].toUpperCase(),
            text: optMatch[2],
          });
          currentField = "opt";
        } else if (ansMatch) {
          ans = ansMatch[1].toUpperCase();
          currentField = "ans";
        } else if (expMatch) {
          exp = expMatch[1];
          currentField = "exp";
        } else {
          if (currentField === "q") qText += " " + line;
          else if (currentField === "exp") exp += " " + line;
          else if (currentField === "opt" && options.length) {
            options[options.length - 1].text += " " + line;
          }
        }
      });

      if (qText) {
        parsed.push({ num, qText, options, ans, exp });
      }
    });

    return parsed;
  }, [rawText]);

  // Statistics
  const stats = useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    parsedItems.forEach((it) => {
      if (it.ans && counts[it.ans] !== undefined) {
        counts[it.ans]++;
      }
    });
    return {
      total: parsedItems.length,
      dist: `A:${counts.A} | B:${counts.B} | C:${counts.C} | D:${counts.D}`,
    };
  }, [parsedItems]);

  const sanitizedFileName = useMemo(() => {
    let clean = (fileName || title).trim().replace(/\.pdf$/i, "");
    clean = clean.replace(/[<>:"/\\|?*]+/g, "");
    clean = clean.replace(/\s+/g, "_");
    return clean || "QuizBlitz_MCQ_Paper";
  }, [fileName, title]);

  const handlePrint = () => {
    const oldTitle = document.title;
    document.title = sanitizedFileName;
    window.print();
    setTimeout(() => {
      document.title = oldTitle;
    }, 1000);
  };

  return (
    <div className={`min-h-screen bg-slate-200 text-slate-900 theme-${theme}`}>
      {/* Dynamic Theme and Print Styles */}
      <style jsx global>{`
        .theme-blue {
          --brand-primary: #1d4ed8;
          --brand-secondary: #4f46e5;
          --brand-soft: #eff6ff;
          --brand-border: #bfdbfe;
        }
        .theme-royal {
          --brand-primary: #4338ca;
          --brand-secondary: #7c3aed;
          --brand-soft: #eef2ff;
          --brand-border: #c7d2fe;
        }
        .theme-emerald {
          --brand-primary: #047857;
          --brand-secondary: #0d9488;
          --brand-soft: #ecfdf5;
          --brand-border: #a7f3d0;
        }
        .theme-crimson {
          --brand-primary: #b91c1c;
          --brand-secondary: #ea580c;
          --brand-soft: #fef2f2;
          --brand-border: #fecaca;
        }

        @page {
          size: A4 portrait;
          margin: 13mm 11mm 15mm 11mm;
        }

        @media print {
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .pdf-watermark-fixed {
            display: block !important;
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
          }
          .paper-print-sheet {
            max-width: none !important;
            width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          .mcq-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Repeating Fixed Watermark Layer (Active during Print) */}
      <WatermarkSVG
        handle={watermarkHandle}
        className="pdf-watermark-fixed hidden pointer-events-none"
      />

      {/* ================= STUDIO CONTROL PANEL (NO-PRINT) ================= */}
      <div className="no-print max-w-5xl mx-auto pt-6 px-4">
        <div className="bg-white rounded-2xl border border-slate-300 shadow-xl overflow-hidden mb-6">
          {/* Topbar */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 text-slate-950 font-black">
                <FileText className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight">
                  Branded MCQ to PDF Studio
                </h1>
                <p className="text-xs text-blue-200">
                  હાઇ-ક્વોલિટી A4 વોટરમાર્ક પ્રશ્નપત્ર જનરેટર
                </p>
              </div>
            </div>

            {/* Stat Pills */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold">
                પ્રશ્નો: {stats.total}
              </span>
              <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold">
                {stats.dist}
              </span>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
            {/* Quick Test / Paper Loader Bar */}
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-blue-600" />
                  <span>ટેલિગ્રામ ટેસ્ટ કોડથી લોડ કરો:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={quizCodeInput}
                    onChange={(e) => setQuizCodeInput(e.target.value)}
                    placeholder="દા.ત. GSRTC-1234"
                    className="w-32 sm:w-36 px-2.5 py-1.5 rounded-lg border border-blue-300 font-mono font-bold text-xs uppercase bg-white text-slate-800 focus:outline-none focus:border-blue-600"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadTelegramQuizByCode(quizCodeInput);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => loadTelegramQuizByCode(quizCodeInput)}
                    disabled={isLoadingQuiz || !quizCodeInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold flex items-center gap-1 transition-colors shadow-sm"
                  >
                    {isLoadingQuiz ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>{isLoadingQuiz ? "..." : "લોડ"}</span>
                  </button>
                </div>
              </div>

              {papers && papers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>પેપર લિસ્ટમાંથી પસંદ કરો:</span>
                  </span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) loadPaperById(e.target.value);
                    }}
                    defaultValue=""
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none"
                  >
                    <option value="" disabled>-- પેપર સિલેક્ટ કરો --</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.questions?.length || 0} પ્રશ્નો)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {loadStatusMsg && (
                <div className="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white/90 border border-blue-200 text-blue-900 animate-fadeIn flex items-center justify-between">
                  <span>{loadStatusMsg}</span>
                  <button
                    onClick={() => setLoadStatusMsg("")}
                    className="text-slate-400 hover:text-slate-600 font-bold ml-2"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Row 1: Basic Paper Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">પેપર શીર્ષક (Title)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-600 outline-none font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">પેટા શીર્ષક / વિષય (Subtitle)</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-600 outline-none text-slate-800"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  PDF ફાઈલનું નામ (File Name)
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-600 outline-none text-slate-800"
                />
                <span className="text-[11px] text-blue-600 font-mono font-bold mt-1 block">
                  File: {sanitizedFileName}.pdf
                </span>
              </div>
            </div>

            {/* Row 2: Layout & Formatting controls */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">વોટરમાર્ક / હેન્ડલ</label>
                <input
                  type="text"
                  value={watermarkHandle}
                  onChange={(e) => setWatermarkHandle(e.target.value)}
                  placeholder="@databasehandlerbot"
                  className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white outline-none text-slate-800"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">મોડ (Mode)</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "study" | "exam_key" | "exam_only")}
                  className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white outline-none font-medium"
                >
                  <option value="study">અભ્યાસ મોડ (જવાબ + Exp)</option>
                  <option value="exam_key">પરીક્ષા મોડ (અંતે Answer Key)</option>
                  <option value="exam_only">પ્રેક્ટિસ મોડ (જવાબ વગર)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">થીમ કલર</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "blue" | "royal" | "emerald" | "crimson")}
                  className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white outline-none font-medium"
                >
                  <option value="blue">Electric Blue</option>
                  <option value="royal">Royal Indigo</option>
                  <option value="emerald">Emerald Green</option>
                  <option value="crimson">Crimson Red</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">કોલમ લેઆઉટ</label>
                <select
                  value={columns}
                  onChange={(e) => setColumns(e.target.value as "1" | "2")}
                  className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white outline-none font-medium"
                >
                  <option value="1">1 કોલમ (ક્લીન રીડિંગ)</option>
                  <option value="2">2 કોલમ (કોમ્પેક્ટ પ્રિન્ટ)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">ફોન્ટ સાઇઝ</label>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white outline-none font-medium"
                >
                  <option value="11.5px">નાના ફોન્ટ (11.5px)</option>
                  <option value="13px">મધ્યમ (13px - શ્રેષ્ઠ)</option>
                  <option value="14.5px">મોટા ફોન્ટ (14.5px)</option>
                </select>
              </div>
            </div>

            {/* Row 3: Raw Input Textarea */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                અહીં MCQ ટેક્સ્ટ પેસ્ટ કરો (1. પ્રશ્ન, A) વિકલ્પ, B) વિકલ્પ, Ans: B, Exp: સમજૂતી):
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={7}
                className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:bg-white focus:border-blue-600 outline-none leading-relaxed"
                placeholder="1. પ્રશ્ન...&#10;A) વિકલ્પ&#10;B) વિકલ્પ&#10;Ans: B&#10;Exp: સમજૂતી..."
              />
            </div>

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Save Branded PDF (Print)</span>
                </button>
                <button
                  onClick={() => setRawText("")}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-slate-500" />
                  <span>સાફ કરો</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>પ્રિન્ટમાં <b>Background graphics ON</b> રાખો જેથી કલર અને વોટરમાર્ક પરફેક્ટ આવે.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= PRINTABLE BRANDED A4 SHEET ================= */}
      <div className="max-w-[210mm] min-h-[297mm] mx-auto mb-12 bg-white rounded-xl shadow-2xl p-6 sm:p-12 relative overflow-hidden paper-print-sheet text-slate-900" style={{ fontSize }}>
        {/* Screen Preview Watermark Pattern */}
        <WatermarkSVG
          handle={watermarkHandle}
          className="absolute inset-0 pointer-events-none z-0 no-print"
        />

        <div className="relative z-10">
          {/* Branded Header Banner */}
          <div
            className="rounded-xl p-5 mb-5 text-white shadow-md relative overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, #0f172a 0%, var(--brand-primary) 65%, var(--brand-secondary) 100%)",
            }}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/20">
              <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base tracking-wide">
                <span className="w-6 h-6 rounded-md bg-gradient-to-tr from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center font-bold text-xs">
                  ⚡
                </span>
                <span>MCQ Master / QuizBlitz Study Material</span>
              </div>
              <span className="px-3 py-0.5 rounded-full bg-white/20 border border-white/30 text-xs font-bold font-mono">
                ✈ {watermarkHandle || "@databasehandlerbot"}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black leading-tight text-white m-0">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-200 mt-1 mb-0 font-medium">
                {subtitle}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 bg-slate-950/30 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-semibold">
              <span>કુલ પ્રશ્નો: {parsedItems.length}</span>
              <span>
                મોડ:{" "}
                {mode === "study"
                  ? "અભ્યાસ મોડ (સમજૂતી સાથે)"
                  : mode === "exam_key"
                  ? "પરીક્ષા મોડ (Answer Key સાથે)"
                  : "પ્રેક્ટિસ મોડ"}
              </span>
              <span>GSRTC • GPSC • GSSSB • Police • Clerk</span>
            </div>
          </div>

          {/* Questions Container */}
          {parsedItems.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 text-slate-500">
              ઉપરના બોક્સમાં તમારા MCQ પેસ્ટ કરો — તરત જ પ્રીમિયમ A4 PDF તૈયાર થઈ જશે.
            </div>
          ) : (
            <div
              className={`space-y-3 ${
                columns === "2" ? "sm:columns-2 sm:gap-4 sm:space-y-0" : ""
              }`}
            >
              {parsedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="mcq-break-avoid p-3 rounded-lg border border-slate-200 bg-white/90 shadow-sm mb-3"
                >
                  {/* Question Header */}
                  <div className="flex items-start gap-2 mb-2">
                    <span
                      className="px-2 py-0.5 rounded text-white font-extrabold text-xs flex-shrink-0 mt-0.5"
                      style={{ background: "var(--brand-primary)" }}
                    >
                      Q{item.num}
                    </span>
                    <div className="font-bold text-slate-900 leading-snug">
                      {item.qText}
                    </div>
                  </div>

                  {/* Options Grid */}
                  {item.options.length > 0 && (
                    <div
                      className={`grid gap-1.5 ml-7 mb-2 ${
                        columns === "2" || item.options.some((o) => o.text.length > 35)
                          ? "grid-cols-1"
                          : "grid-cols-1 sm:grid-cols-2"
                      }`}
                    >
                      {item.options.map((opt, optIdx) => {
                        const isCorrect = mode === "study" && item.ans === opt.letter;
                        return (
                          <div
                            key={optIdx}
                            className={`flex items-baseline gap-2 px-2 py-1 rounded text-xs sm:text-[13px] border ${
                              isCorrect
                                ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                                : "border-transparent text-slate-800"
                            }`}
                          >
                            <span
                              className="font-bold flex-shrink-0"
                              style={{
                                color: isCorrect ? "#065f46" : "var(--brand-primary)",
                              }}
                            >
                              {opt.letter})
                            </span>
                            <span>{opt.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Solution Box (Study Mode) */}
                  {mode === "study" && (item.ans || item.exp) && (
                    <div
                      className="ml-7 mt-2 p-2 rounded-r-lg border-l-4 text-xs sm:text-[12.5px] leading-relaxed"
                      style={{
                        background: "var(--brand-soft)",
                        borderLeftColor: "var(--brand-primary)",
                      }}
                    >
                      {item.ans && (
                        <span className="inline-block bg-emerald-700 text-white font-bold px-2 py-0.5 rounded text-[11px] mr-2">
                          જવાબ: {item.ans}
                        </span>
                      )}
                      {item.exp && (
                        <span className="text-slate-800">
                          <strong>સમજૂતી:</strong> {item.exp}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Answer Key Grid (Exam Key Mode) */}
          {mode === "exam_key" && parsedItems.length > 0 && (
            <div className="mcq-break-avoid mt-8 pt-4 border-t-2 border-dashed border-slate-300">
              <div
                className="flex items-center justify-between p-2.5 rounded-lg border font-bold text-sm mb-3"
                style={{
                  background: "var(--brand-soft)",
                  borderColor: "var(--brand-border)",
                  color: "var(--brand-primary)",
                }}
              >
                <span>ઉત્તરવહી (Official Answer Key)</span>
                <span className="text-xs">⚡ {watermarkHandle || "@databasehandlerbot"}</span>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {parsedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="border border-slate-300 rounded p-1.5 text-center bg-white font-mono text-xs"
                  >
                    <span className="text-slate-500 mr-1">Q{item.num}:</span>
                    <strong
                      className="text-sm font-black"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      {item.ans || "-"}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branded Footer Banner */}
          <div className="mcq-break-avoid mt-8 p-3.5 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <strong className="text-amber-400 block text-xs sm:text-sm">
                ⚡ Powered by MCQ Master &amp; QuizBlitz AI
              </strong>
              <span className="text-slate-300 text-[11px]">
                રોજિંદા ફ્રી MCQ ક્વિઝ, સ્પર્ધાત્મક પરીક્ષાની તૈયારી માટે Telegram પર જોડાઓ
              </span>
            </div>
            <div
              className="px-3 py-1.5 rounded-lg font-bold text-xs"
              style={{ background: "var(--brand-primary)" }}
            >
              {watermarkHandle || "@databasehandlerbot"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PdfStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-200 flex items-center justify-center p-6 text-slate-600 font-bold text-sm">
          PDF Studio લોડ થઈ રહ્યું છે...
        </div>
      }
    >
      <PdfStudioContent />
    </Suspense>
  );
}
