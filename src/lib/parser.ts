import { Question } from "@/types";

export interface ParsedMCQ {
  questionText: string;
  options: string[];
  correctAnswer: number; // 0 for A, 1 for B, 2 for C, 3 for D, 4 for E
  explanation?: string;
  hasOptionE?: boolean;
}

/**
 * Intelligent Smart Parser for pasted MCQ text.
 * Handles Gujarati, Hindi, English, A) / B) / C) options, Ans: D, and Exp: formats.
 */
export const parseBulkMCQs = (rawText: string, paperId: string = "", startingIndex: number = 1): Question[] => {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  const results: Question[] = [];
  
  // Patterns for detecting question starts (e.g., "1.", "2.", "૧.", "૨.", "Q1.", "Q1)", "પ્રશ્ન 1.", "(1)")
  const questionStartRegex = /^(?:Q(?:uestion|\.)?\s*[\d૦-૯]+|પ્રશ્ન\s*[\d૦-૯]+|\(?[\d૦-૯]+\)[\.\:\-]?|[\d૦-૯]+[\.\:\-\)])\s*(.*)/i;

  // Patterns for options: A), B), C), D), (A), [A], A., A -, a), etc. or Gujarati ક, ખ, ગ, ઘ, 1), 2)
  const optionRegex = /^(?:\(?([A-Ea-e]|[ક-ઙ])\)?[\.\:\-\)\s]|([A-Ea-e]|[ક-ઙ])\)|(?:\(?([1-5])\)|\([1-5]\)))\s*(.*)/;

  // Patterns for answer lines: Ans: D, Answer: A, સાચો જવાબ: C, જવાબ: D, Correct Answer: B
  const answerRegex = /^(?:(?:Ans(?:wer)?|Correct(?:\s*Answer)?|સાચો\s*જવાબ|જવાબ|उत्तर)\s*[\:\-\=]?\s*\(?([A-Ea-e1-5]|[ક-ઙ])\)?)/i;

  // Pattern for explanation lines: Exp: ..., Explanation: ..., સમજૂતી: ..., વિગત: ...
  const explanationRegex = /^(?:(?:Exp(?:lanation)?|સમજૂતી|વિગત|વિશેષ|Note|Explanation\/Reason)\s*[\:\-\=]\s*)(.*)/i;

  let currentQuestion: Partial<ParsedMCQ> | null = null;
  let currentOptions: string[] = [];
  let isCollectingExplanation = false;

  const letterToIndex = (char: string): number => {
    const c = char.trim().toUpperCase();
    if (c === "A" || c === "1" || c === "ક") return 0;
    if (c === "B" || c === "2" || c === "ખ") return 1;
    if (c === "C" || c === "3" || c === "ગ") return 2;
    if (c === "D" || c === "4" || c === "ઘ") return 3;
    if (c === "E" || c === "5" || c === "ઙ") return 4;
    return 0;
  };

  const commitCurrentQuestion = () => {
    if (currentQuestion && currentQuestion.questionText) {
      let finalOptions = [...currentOptions];
      if (finalOptions.length === 0) {
        finalOptions = ["Option A", "Option B", "Option C", "Option D"];
      } else if (finalOptions.length < 4) {
        while (finalOptions.length < 4) {
          finalOptions.push(`Option ${String.fromCharCode(65 + finalOptions.length)}`);
        }
      }

      const qNum = startingIndex + results.length;
      results.push({
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${qNum}`,
        paperId: paperId,
        questionNumber: qNum,
        questionText: currentQuestion.questionText.trim(),
        options: finalOptions,
        correctAnswer: currentQuestion.correctAnswer ?? 0,
        explanation: currentQuestion.explanation?.trim() || "",
        difficulty: "medium",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    currentQuestion = null;
    currentOptions = [];
    isCollectingExplanation = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Check if line is an answer definition (e.g. Ans: D)
    const ansMatch = line.match(answerRegex);
    if (ansMatch) {
      if (currentQuestion) {
        currentQuestion.correctAnswer = letterToIndex(ansMatch[1]);
      }
      isCollectingExplanation = false;
      continue;
    }

    // 2. Check if line is an explanation (e.g. Exp: ... or સમજૂતી: ...)
    const expMatch = line.match(explanationRegex);
    if (expMatch) {
      if (currentQuestion) {
        currentQuestion.explanation = (currentQuestion.explanation ? currentQuestion.explanation + " " : "") + expMatch[1];
      }
      isCollectingExplanation = true;
      continue;
    }

    // 3. Check if line begins a new question (e.g. 1. કચ્છના અખાતમાં... or ૨. ૨૦૦૧ના...)
    // Checked before optionRegex so question numbers like "2." aren't confused with options
    const qMatch = line.match(questionStartRegex);
    if (qMatch && (!line.match(/^\([1-5]\)/) || !currentQuestion)) {
      commitCurrentQuestion();

      currentQuestion = {
        questionText: qMatch[1]?.trim() || line,
        options: [],
        correctAnswer: 0,
        explanation: "",
      };
      isCollectingExplanation = false;
      continue;
    }

    // 4. Check if line is a new option (e.g. A) શિયાળ બેટ)
    const optMatch = line.match(optionRegex);
    if (optMatch && currentQuestion) {
      const optText = optMatch[4]?.trim() || line.replace(/^(?:\(?[A-Ea-e1-5ક-ઙ]\)?[\.\:\-\)\s]|(?:\([1-5]\)))\s*/, "").trim();
      currentOptions.push(optText);
      isCollectingExplanation = false;
      continue;
    }

    // 5. If we are currently inside an explanation continuation
    if (isCollectingExplanation && currentQuestion) {
      currentQuestion.explanation = (currentQuestion.explanation ? currentQuestion.explanation + " " : "") + line;
      continue;
    }

    // 6. If we have a current question but haven't started options, it could be multi-line question text
    if (currentQuestion && currentOptions.length === 0) {
      currentQuestion.questionText = (currentQuestion.questionText ? currentQuestion.questionText + " " : "") + line;
      continue;
    }

    // 7. If options already started, it might be continuation of the previous option
    if (currentQuestion && currentOptions.length > 0) {
      currentOptions[currentOptions.length - 1] += " " + line;
      continue;
    }

    // Fallback: If no question was active, initialize one
    if (!currentQuestion) {
      currentQuestion = {
        questionText: line,
        options: [],
        correctAnswer: 0,
        explanation: "",
      };
    }
  }

  // Commit last question
  commitCurrentQuestion();

  return results;
};
