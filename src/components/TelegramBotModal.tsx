"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Paper, TelegramQuiz, TelegramBotConfig } from "@/types";
import { saveTelegramQuiz, getTelegramBotConfig } from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { 
  Send, 
  X, 
  Copy, 
  Check, 
  Sparkles, 
  Bot, 
  Share2, 
  Settings, 
  Clock, 
  MessageSquare, 
  Layers, 
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  BookOpen,
  Printer,
  Shuffle,
  ListOrdered
} from "lucide-react";

interface TelegramBotModalProps {
  paper?: Paper | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TelegramBotModal: React.FC<TelegramBotModalProps> = ({
  paper,
  isOpen,
  onClose,
}) => {
  const { user, papers } = useAuth();
  
  // Quiz Configuration State
  const [selectedPaperId, setSelectedPaperId] = useState<string>(paper?.id || "");
  const [testTitle, setTestTitle] = useState<string>(paper?.title || "સ્પર્ધાત્મક પરીક્ષા મોક ટેસ્ટ");
  const [testSubject, setTestSubject] = useState<string>(paper?.subject || "સામાન્ય જ્ઞાન & કરંટ અફેર્સ");
  const [timePerQuestion, setTimePerQuestion] = useState<number>(30);
  const [questionCount, setQuestionCount] = useState<number | "all">("all");
  const [selectionMode, setSelectionMode] = useState<"original" | "random">("original");
  const [customCountInput, setCustomCountInput] = useState<string>("");

  // Generated Result State
  const [generatedQuiz, setGeneratedQuiz] = useState<TelegramQuiz | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedQuizBotFormat, setCopiedQuizBotFormat] = useState(false);

  // Read Bot Settings configured by Admin. The public server endpoint exposes
  // the bot username but never the token/secret.
  const [botConfig, setBotConfig] = useState<TelegramBotConfig>(() =>
    getTelegramBotConfig()
  );

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch("/api/telegram/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (!active || !cfg?.botUsername) return;
        setBotConfig((prev) => ({
          ...prev,
          ...cfg,
          botToken: "",
          webhookSecret: "",
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen || !user) return null;

  // Active target paper
  const activePaper = (selectedPaperId ? papers.find(p => p.id === selectedPaperId) : paper) || papers[0];

  const handlePaperChange = (paperId: string) => {
    setSelectedPaperId(paperId);
    const chosen = papers.find(p => p.id === paperId);
    if (chosen) {
      setTestTitle(chosen.title);
      setTestSubject(chosen.subject || chosen.category);
      setQuestionCount("all");
      setCustomCountInput("");
    }
  };

  const handleGenerateCode = async () => {
    if (!activePaper || !activePaper.questions || activePaper.questions.length === 0) {
      alert("પસંદ કરેલા પેપરમાં ઓછામાં ઓછો ૧ પ્રશ્ન હોવો જરૂરી છે.");
      return;
    }

    let finalQuestions = [...activePaper.questions];

    // If random mode is chosen, shuffle questions
    if (selectionMode === "random") {
      finalQuestions = finalQuestions
        .map((q) => ({ q, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ q }) => q);
    }

    // If a limited number of questions is chosen, slice
    if (questionCount !== "all") {
      const limit = Math.min(finalQuestions.length, Math.max(1, Number(questionCount) || finalQuestions.length));
      finalQuestions = finalQuestions.slice(0, limit);
    }

    // Generate readable, memorable test code (e.g. GPSC-4921, EXAM-4921 or TEST-8391)
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    let prefix = "TEST";
    if (activePaper.category) {
      const clean = activePaper.category.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
      if (clean.length >= 3) {
        prefix = clean;
      }
    }
    const quizCode = `${prefix}-${randomDigits}`;

    const newQuiz: TelegramQuiz = {
      code: quizCode,
      paperId: activePaper.id,
      title: testTitle.trim() || activePaper.title,
      subject: testSubject.trim() || activePaper.subject,
      timePerQuestion: Number(timePerQuestion) || 30,
      questions: finalQuestions,
      createdBy: user.name,
      creatorPhone: user.phoneNumber,
      createdAt: new Date().toISOString(),
    };

    await saveTelegramQuiz(newQuiz);
    setGeneratedQuiz(newQuiz);
  };

  const handleCopyCode = () => {
    if (!generatedQuiz) return;
    navigator.clipboard.writeText(generatedQuiz.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getGroupShareMessage = () => {
    if (!generatedQuiz) return "";
    const botName = botConfig.botUsername || "MockQuizBot";
    return (
      `📢 *નવી લાઈવ મોક ટેસ્ટ શરૂ કરવા માટે તૈયાર!* 🎯\n\n` +
      `📝 *શીર્ષક:* ${generatedQuiz.title}\n` +
      `📚 *વિષય:* ${generatedQuiz.subject}\n` +
      `🔢 *કુલ પ્રશ્નો:* ${generatedQuiz.questions.length} પ્રશ્નો\n` +
      `⏱ *સમય:* ${generatedQuiz.timePerQuestion} સેકન્ડ/પ્રશ્ન\n` +
      `👤 *નિર્માતા:* ${generatedQuiz.createdBy}\n\n` +
      `👉 *આ ગ્રૂપમાં ટેસ્ટ રમવા માટે નીચે આપેલ કમાન્ડ મોકલો:*\n` +
      `/quiz ${generatedQuiz.code}\n\n` +
      `🤖 અથવા બોટને ગ્રૂપમાં સીધો શરૂ કરવા માટે અહીં ક્લિક કરો:\n` +
      `https://t.me/${botName}?startgroup=${generatedQuiz.code}`
    );
  };

  const handleCopyGroupMessage = () => {
    const text = getGroupShareMessage();
    navigator.clipboard.writeText(text);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleDirectShareToTelegram = () => {
    const text = getGroupShareMessage();
    const encoded = encodeURIComponent(text);
    window.open(`https://t.me/share/url?url=&text=${encoded}`, "_blank");
  };

  // Export in native Telegram official @QuizBot syntax
  const getQuizBotSyntax = () => {
    const questionsToExport = generatedQuiz?.questions || activePaper?.questions || [];
    if (!activePaper || questionsToExport.length === 0) return "";
    let out = `/newquiz\n${generatedQuiz?.title || activePaper.title}\n${generatedQuiz?.subject || activePaper.subject || "General Knowledge"}\n\n`;
    questionsToExport.forEach((q, idx) => {
      out += `Q${idx + 1}: ${q.questionText}\n`;
      q.options.forEach((opt, optIdx) => {
        const isAns = q.correctAnswer === optIdx ? " [CORRECT]" : "";
        out += `- ${opt}${isAns}\n`;
      });
      if (q.explanation) out += `Explanation: ${q.explanation}\n`;
      out += `\n`;
    });
    return out;
  };

  const handleCopyQuizBotFormat = () => {
    const text = getQuizBotSyntax();
    navigator.clipboard.writeText(text);
    setCopiedQuizBotFormat(true);
    setTimeout(() => setCopiedQuizBotFormat(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                ટેલિગ્રામ ગ્રૂપ મોક ટેસ્ટ બોટ (Telegram Bot)
              </h3>
              <p className="text-[11px] text-sky-100">
                ગ્રૂપમાં લાઈવ ક્વિઝ રમાડવા માટે ટેસ્ટ કોડ જનરેટ કરો
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Form Step: Configure Title, Subject, Time */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>ટેસ્ટ સેટઅપ (Configure Telegram Test)</span>
            </h4>

            {/* Select Paper */}
            {papers.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  પેપર સિલેક્ટ કરો (Select Paper) *
                </label>
                <select
                  value={selectedPaperId}
                  onChange={(e) => handlePaperChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white"
                >
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.questions?.length || 0} MCQs)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Test Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ટેસ્ટનું નામ (Test Name) *
                </label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="દા.ત. GPSC / પોલીસ કોન્સ્ટેબલ મોક ટેસ્ટ - 1"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  વિષય (Subject) *
                </label>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  placeholder="દા.ત. મોટર વ્હીકલ એક્ટ & GK"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Custom Timer per Question */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span>દરેક પ્રશ્ન માટે સમય (Custom Timer per Question) *</span>
                </label>
                <span className="text-[11px] font-bold font-mono text-sky-700 bg-sky-100/70 border border-sky-200 px-2 py-0.5 rounded-md">
                  ⏱ {timePerQuestion || 30} સેકન્ડ / પ્રશ્ન
                </span>
              </div>

              {/* Direct Custom Input + Shortcut Buttons */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={timePerQuestion || ""}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTimePerQuestion(val);
                    }}
                    placeholder="દા.ત. 15, 20, 25, 40..."
                    className="w-full pl-3 pr-16 py-2 rounded-xl border-2 border-sky-300 focus:border-sky-500 font-mono font-bold text-sm text-slate-900 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 select-none">
                    સેકન્ડ
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-medium whitespace-nowrap">શોર્ટકટ:</div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-6 gap-1.5">
                {[10, 15, 20, 25, 30, 45].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTimePerQuestion(sec)}
                    className={`py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      timePerQuestion === sec
                        ? "bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/20"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>💡 લઘુત્તમ 10 થી મહત્તમ 600 સેકન્ડ સુધી કોઈપણ સમય જાતે ટાઈપ કરી શકો છો.</span>
                {activePaper?.questions?.length ? (
                  <span className="font-medium text-slate-500">
                    કુલ સમય: ~{Math.ceil(((timePerQuestion || 30) * (questionCount === "all" ? activePaper.questions.length : Math.min(Number(questionCount) || activePaper.questions.length, activePaper.questions.length))) / 60)} મિનિટ
                  </span>
                ) : null}
              </div>
            </div>

            {/* Question Order & Random Pick Mode */}
            <div className="space-y-1.5 pt-1 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Shuffle className="w-3.5 h-3.5 text-sky-600" />
                  <span>પ્રશ્ન પસંદગી ક્રમ (Question Order)</span>
                </label>
                <span className="text-[11px] text-slate-500 font-medium">
                  {selectionMode === "random" ? "🎲 રેન્ડમ પસંદ (Random Pick)" : "📑 જેવા છે તેવા (Original)"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionMode("original")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                    selectionMode === "original"
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/20"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>જેવા છે તેવા (મૂળ ક્રમ)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectionMode("random")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                    selectionMode === "random"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-500/20"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>રેન્ડમ પસંદ (Random Pick)</span>
                </button>
              </div>
            </div>

            {/* Question Count Selector */}
            <div className="space-y-2 pt-1 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                  <span>ટેસ્ટમાં કેટલા પ્રશ્નો રાખવા? (Question Count)</span>
                </label>
                <span className="text-[11px] font-bold font-mono text-sky-700 bg-sky-100/70 border border-sky-200 px-2 py-0.5 rounded-md">
                  {questionCount === "all"
                    ? `બધા (${activePaper?.questions?.length || 0}) પ્રશ્નો`
                    : `${questionCount} પ્રશ્નો (કુલ ${activePaper?.questions?.length || 0} માંથી)`}
                </span>
              </div>

              {/* Quick Select Chips + Custom Input */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setQuestionCount("all");
                    setCustomCountInput("");
                  }}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                    questionCount === "all"
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/20"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  બધા (All - {activePaper?.questions?.length || 0})
                </button>

                {[10, 20, 25, 30, 50].map((num) => {
                  if ((activePaper?.questions?.length || 0) < num) return null;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setQuestionCount(num);
                        setCustomCountInput(String(num));
                      }}
                      className={`py-1.5 px-2.5 rounded-xl text-xs font-bold border transition-all ${
                        questionCount === num
                          ? "bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/20"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {num} Qs
                    </button>
                  );
                })}

                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-[11px] text-slate-400 font-medium">કસ્ટમ:</span>
                  <input
                    type="number"
                    min={1}
                    max={activePaper?.questions?.length || 100}
                    value={customCountInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomCountInput(val);
                      const parsed = parseInt(val, 10);
                      if (!isNaN(parsed) && parsed > 0) {
                        const capped = Math.min(parsed, activePaper?.questions?.length || 100);
                        setQuestionCount(capped);
                      } else if (val === "") {
                        setQuestionCount("all");
                      }
                    }}
                    placeholder="દા.ત. 15"
                    className="w-16 px-2 py-1 text-xs font-bold font-mono text-center rounded-lg border border-slate-300 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateCode}
              disabled={!activePaper || !activePaper.questions || activePaper.questions.length === 0}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white font-bold text-xs shadow-md shadow-sky-500/20 flex items-center justify-center space-x-1.5 disabled:opacity-50 transition-all transform active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>ટેલિગ્રામ ટેસ્ટ કોડ બનાવો (Generate Test Code)</span>
            </button>
          </div>

          {/* Generated Quiz Code Result Card */}
          {generatedQuiz && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border-2 border-sky-400 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded-full">
                  🎉 ટેસ્ટ કોડ સફળતાપૂર્વક જનરેટ થયો!
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {generatedQuiz.questions.length} પ્રશ્નો
                </span>
              </div>

              {/* Big Test Code Box */}
              <div className="bg-white p-3.5 rounded-2xl border border-sky-200 text-center space-y-1 shadow-sm">
                <span className="text-[11px] text-slate-500 uppercase font-semibold">
                  તમારો ટેલિગ્રામ ટેસ્ટ કોડ (Test Code)
                </span>
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-sky-700">
                    {generatedQuiz.code}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-700 transition-colors"
                    title="કોડ કોપી કરો"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 font-medium pt-1">
                  આ કોડ ટેલિગ્રામ ગ્રૂપમાં મોકલો: <code>/quiz {generatedQuiz.code}</code>
                </p>
              </div>

              {/* Leaderboard Table Live Preview Button */}
              <div className="bg-slate-900 rounded-2xl p-3 text-white border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-amber-300">
                    🏆 લીડરબોર્ડ પરિણામ ટેબલ (Leaderboard Table)
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                    /results {generatedQuiz.code}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  ટેસ્ટના અંતે ટેલિગ્રામ ગ્રૂપમાં રેન્ક, સ્કોર, ખોટા જવાબો, ટકાવારી અને ગ્રેડ સાથેનું સુંદર સ્કોરબોર્ડ ટેબલ આપોઆપ મોકલાશે!
                </p>
              </div>

              {/* Group Sharing Actions */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyGroupMessage}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-white hover:bg-sky-100 border border-sky-300 font-bold text-xs text-sky-800 shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedMessage ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedMessage ? "મેસેજ કોપી થયો! ✓" : "ગ્રૂપ મેસેજ કોપી કરો"}</span>
                  </button>

                  <button
                    onClick={handleDirectShareToTelegram}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md shadow-sky-500/20 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>Telegram પર મોકલો</span>
                  </button>
                </div>

                {/* Direct Add Bot to Group Link */}
                <a
                  href={`https://t.me/${botConfig.botUsername || "MockQuizBot"}?startgroup=${generatedQuiz.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 hover:from-blue-700 hover:to-indigo-700 transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  <span>બોટને તમારા ટેલિગ્રામ ગ્રૂપમાં એડ કરો</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {/* Direct Link to PDF Studio */}
                <Link
                  href={`/pdf-studio?quizCode=${generatedQuiz.code}`}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 hover:from-emerald-700 hover:to-teal-700 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>આ ટેસ્ટના પ્રશ્નો PDF Studio માં ખોલો (A4 પ્રિન્ટ)</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </Link>
              </div>

              {/* QuizBot Official Syntax alternative */}
              <div className="pt-2 border-t border-sky-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 text-[11px]">
                  અથવા Telegram @QuizBot ફોર્મેટમાં લો:
                </span>
                <button
                  onClick={handleCopyQuizBotFormat}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                >
                  {copiedQuizBotFormat ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedQuizBotFormat ? "કોપી થયું!" : "@QuizBot ફોર્મેટ કોપી"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick 3-Step Instruction Guide */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
              <span>ટેલિગ્રામ ગ્રૂપમાં કેવી રીતે ચલાવવું? (Instructions)</span>
            </span>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600 text-[11px] leading-relaxed">
              <li>તમારું પેપર સિલેક્ટ કરી <strong>'ટેલિગ્રામ ટેસ્ટ કોડ બનાવો'</strong> બટન દબાવો.</li>
              <li>મળેલ કોડ તમારા ટેલિગ્રામ સ્ટડી ગ્રૂપમાં <code>/quiz &lt;CODE&gt;</code> લખીને મોકલો.</li>
              <li>બોટ આપોઆપ ગ્રૂપમાં પ્રશ્નોના પોલ (MCQ Polls) મોકલવાનું શરૂ કરી દેશે અને સભ્યો લાઈવ સ્કોર સાથે ક્વિઝ રમી શકશે!</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
