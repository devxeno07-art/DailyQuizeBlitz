"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Paper, Question } from "@/types";
import { savePaper } from "@/lib/storage";
import { X, BookOpen, Plus, Tag, HelpCircle, Clock, Sparkles } from "lucide-react";

interface CreatePaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (paper: Paper) => void;
}

const CATEGORIES = [
  "GSRTC સ્પેશિયલ",
  "GPSC / વર્ગ-૧,૨,૩",
  "પોલીસ કોન્સ્ટેબલ / PSI",
  "તલાટી / જુનિયર ક્લાર્ક",
  "સામાન્ય જ્ઞાન (GK)",
  "ટેટ / ટાટ (TET/TAT)",
  "અન્ય પરીક્ષા",
];

export const CreatePaperModal: React.FC<CreatePaperModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [targetQuestions, setTargetQuestions] = useState(50);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [description, setDescription] = useState("");
  const [includeSamples, setIncludeSamples] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const paperId = `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    let initialQuestions: Question[] = [];
    if (includeSamples) {
      initialQuestions = [
        {
          id: `q_${Date.now()}_1`,
          paperId: paperId,
          questionNumber: 1,
          questionText: "GSRTC નું પૂરું નામ શું છે?",
          options: [
            "Gujarat State Road Transport Corporation",
            "Gujarat Super Railway Transport Company",
            "Gujarat State Rapid Transit Corporation",
            "Gujarat Safety Road Traffic Council",
            "લાગુ પડતું નથી / Not Attempted"
          ],
          correctAnswer: 0,
          explanation: "GSRTC = Gujarat State Road Transport Corporation (ગુજરાત રાજ્ય માર્ગ વાહનવ્યવહાર નિગમ).",
          difficulty: "easy",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `q_${Date.now()}_2`,
          paperId: paperId,
          questionNumber: 2,
          questionText: "મોટર વ્હીકલ એક્ટ 1988 મુજબ ડ્રાઇવિંગ લાઇસન્સ મેળવવા માટે લઘુત્તમ ઉંમર કેટલી હોવી જોઈએ (લાઇટ મોટર વ્હીકલ માટે)?",
          options: [
            "16 વર્ષ",
            "18 વર્ષ",
            "20 વર્ષ",
            "21 વર્ષ"
          ],
          correctAnswer: 1,
          explanation: "LMV (Light Motor Vehicle) માટે લઘુત્તમ ઉંમર 18 વર્ષ હોવી જરૂરી છે.",
          difficulty: "medium",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `q_${Date.now()}_3`,
          paperId: paperId,
          questionNumber: 3,
          questionText: "ગુજરાતમાં GSRTC નિગમની સ્થાપના ક્યારે કરવામાં આવી હતી?",
          options: [
            "1 મે 1960",
            "15 ઓગસ્ટ 1947",
            "26 જાન્યુઆરી 1950",
            "1 નવેમ્બર 1956"
          ],
          correctAnswer: 0,
          explanation: "ગુજરાત રાજ્યની સ્થાપના 1 મે 1960 ના રોજ થઈ અને તે જ દિવસે GSRTC ની સ્થાપના થઈ હતી.",
          difficulty: "easy",
          createdAt: now,
          updatedAt: now,
        }
      ];
    }

    const newPaper: Paper = {
      id: paperId,
      userId: user.id,
      userName: user.name,
      title: title.trim(),
      subject: subject.trim(),
      category: category,
      description: description.trim(),
      targetQuestions: Number(targetQuestions) || 50,
      timeLimitMinutes: Number(timeLimitMinutes) || 60,
      isPublic: true,
      questions: initialQuestions,
      createdAt: now,
      updatedAt: now,
    };

    await savePaper(newPaper);
    setSaving(false);
    onCreated(newPaper);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5" />
            <h3 className="font-bold text-base">નવું પ્રશ્નપત્ર / પ્રોજેક્ટ બનાવો</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              પ્રશ્નપત્રનું નામ / શીર્ષક (Paper Title) *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="દા.ત. GSRTC ડ્રાઈવર મોક ટેસ્ટ - 1"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm font-semibold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                વિષય (Subject)
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="દા.ત. મોટર વ્હીકલ એક્ટ & GK"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                શ્રેણી / કેટેગરી (Category)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm text-slate-900 bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                લક્ષ્યાંક પ્રશ્નો (Target MCQs)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={targetQuestions}
                  onChange={(e) => setTargetQuestions(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm text-slate-900 font-mono"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">MCQs</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                સમય મર્યાદા (Time Limit)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm text-slate-900 font-mono"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">Min</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              નોંધ / વર્ણન (Description - Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="આ પેપર વિશે ટૂંકી નોંધ અથવા સૂચનાઓ..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs text-slate-900 resize-none"
            />
          </div>

          {/* Sample Questions Checkbox */}
          <div className="p-3 rounded-xl bg-brand-50/70 border border-brand-100 flex items-start space-x-3">
            <input
              type="checkbox"
              id="samples"
              checked={includeSamples}
              onChange={(e) => setIncludeSamples(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-brand-300"
            />
            <label htmlFor="samples" className="text-xs text-brand-900 font-medium cursor-pointer">
              <span className="font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                3 તૈયાર GSRTC પ્રશ્નો સાથે શરૂ કરો (Starter MCQs)
              </span>
              <span className="block text-[11px] text-brand-700 mt-0.5">
                તમે અંદર જઈને તેને એડિટ કરી શકો છો અથવા નવા પ્રશ્નો ઉમેરી/પેસ્ટ કરી શકો છો.
              </span>
            </label>
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs"
            >
              રદ કરો (Cancel)
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 flex items-center space-x-1.5 disabled:opacity-70"
            >
              <Plus className="w-4 h-4" />
              <span>{saving ? "બની રહ્યું છે..." : "પેપર બનાવો અને ખોલો"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
