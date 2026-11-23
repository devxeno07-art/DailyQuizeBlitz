"use client";

import React from "react";
import { Paper } from "@/types";

interface PrintableViewProps {
  paper: Paper | null;
}

export const PrintableView: React.FC<PrintableViewProps> = ({ paper }) => {
  if (!paper) return null;

  const labels = ["A", "B", "C", "D", "E"];
  const questions = paper.questions || [];

  return (
    <div className="hidden print:block p-8 bg-white text-black font-sans">
      {/* Official Exam Header */}
      <div className="border-b-2 border-black pb-4 text-center space-y-1">
        <h1 className="text-2xl font-bold uppercase tracking-wide">{paper.title}</h1>
        {paper.subject && <h2 className="text-base font-semibold">વિષય: {paper.subject}</h2>}
        <div className="flex justify-between items-center text-xs pt-2 font-medium">
          <span>શ્રેણી: {paper.category}</span>
          <span>કુલ પ્રશ્નો: {questions.length}</span>
          <span>કુલ ગુણ: {questions.length}</span>
          <span>સમય: {paper.timeLimitMinutes || 60} મિનિટ</span>
        </div>
      </div>

      {/* Candidate Fill-in Boxes */}
      <div className="border border-black p-2 my-4 grid grid-cols-2 text-xs gap-2">
        <div>ઉમેદવારનું નામ: _________________________________________</div>
        <div>રોલ નંબર / બેઠક નંબર: ________________________</div>
        <div>પરીક્ષા કેન્દ્ર: _________________________________________</div>
        <div>સુપરવાઈઝરની સહી: ________________________</div>
      </div>

      {/* Instructions */}
      <div className="text-[11px] mb-6 p-2 bg-slate-50 border border-slate-300">
        <strong>સૂચનાઓ:</strong> (1) તમામ પ્રશ્નો ફરજિયાત છે. (2) દરેક પ્રશ્નનો 1 ગુણ રહેશે. (3) સાચા વિકલ્પ સામે OMR શીટ અથવા આપેલ વિકલ્પમાં ઘાટું કરવું.
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={idx} className="avoid-break space-y-1.5 pb-2 border-b border-dotted border-slate-300">
            <div className="font-bold text-sm">
              <span>{idx + 1}. </span>
              <span>{q.questionText}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pl-4">
              {q.options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-1.5">
                  <span className="font-bold">({labels[optIdx]})</span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Answer Key on New Page for Teacher/Evaluator */}
      <div className="page-break pt-8">
        <div className="border-b-2 border-black pb-2 text-center mb-4">
          <h2 className="text-xl font-bold uppercase">{paper.title} - સત્તાવાર ઉત્તરાવલી (Answer Key)</h2>
          <p className="text-xs text-slate-600">નિર્માતા: {paper.userName} ({paper.userId})</p>
        </div>

        <div className="grid grid-cols-5 gap-2 text-xs">
          {questions.map((q, idx) => (
            <div key={idx} className="p-1.5 border border-slate-400 rounded text-center">
              <span className="font-bold mr-1">Q{idx + 1}:</span>
              <span className="font-black text-indigo-900 bg-slate-100 px-1 rounded">
                ({labels[q.correctAnswer]})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
