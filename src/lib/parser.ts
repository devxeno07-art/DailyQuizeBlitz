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
 * Handles Gujarati, Hindi, English, various numbering, and answer labels.
 */
export const parseBulkMCQs = (rawText: string, paperId: string = "", startingIndex: number = 1): Question[] => {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  const results: Question[] = [];
  
  // Patterns for detecting question starts
  // Examples: "1.", "1)", "Q1.", "Q.1", "Q1)", "પ્રશ્ન 1.", "પ્રશ્ન ૧", "Question 1:", "(1)"
  const questionStartRegex = /^(?:Q(?:uestion|\.)?\s*\d+|પ્રશ્ન\s*[\d૧-૯]+|\(?[\d૧-૯]+\)[\.\:\-]?|\d+[\.\:\-])\s*(.*)/i;

  // Patterns for options: A., A), (A), [A], a., etc. or Gujarati ક, ખ, ગ, ઘ or 1), 2), 3), 4)
  const optionRegex = /^(?:\(?([A-Ea-e1-5]|[ક-ઙ])\)?[\.\:\-\]]|\b([A-Ea-e])\b[\.\:\-\]])\s*(.*)/;

  // Patterns for answer lines: Ans: B, Answer: A, સાચો જવાબ: C, જવાબ: D, Correct Answer: B
  const answerRegex = /^(?:(?:Ans(?:wer)?|Correct(?:\s*Answer)?|સાચો\s*જવાબ|જવાબ|उत्तर)\s*[\:\-\=]?\s*\(?([A-Ea-e1-5]|[ક-ઙ])\)?)/i;

  // Pattern for explanation lines: Explanation: ..., સમજૂતી: ..., વિગત: ...
  const explanationRegex = /^(?:(?:Explanation|સમજૂતી|વિગત|વિશેષ|Note|Explanation\/Reason)\s*[\:\-\=]\s*)(.*)/i;

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
      // Ensure at least 2 options exist, or default to 4 options
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

    // Check if line is an answer definition
    const ansMatch = line.match(answerRegex);
    if (ansMatch) {
      if (currentQuestion) {
        currentQuestion.correctAnswer = letterToIndex(ansMatch[1]);
      }
      isCollectingExplanation = false;
      continue;
    }

    // Check if line is an explanation
    const expMatch = line.match(explanationRegex);
    if (expMatch) {
      if (currentQuestion) {
        currentQuestion.explanation = (currentQuestion.explanation ? currentQuestion.explanation + " " : "") + expMatch[1];
      }
      isCollectingExplanation = true;
      continue;
    }

    // Check if line is a new option (e.g., A) or (B) or 1.)
    const optMatch = line.match(optionRegex);
    if (optMatch && currentQuestion) {
      const optText = optMatch[3]?.trim() || line;
      currentOptions.push(optText);
      isCollectingExplanation = false;
      continue;
    }

    // Check if line begins a new question
    const qMatch = line.match(questionStartRegex);
    if (qMatch) {
      // Save previous question
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

    // If we are currently inside an explanation
    if (isCollectingExplanation && currentQuestion) {
      currentQuestion.explanation = (currentQuestion.explanation ? currentQuestion.explanation + " " : "") + line;
      continue;
    }

    // If we have a current question but haven't started options, it could be multi-line question text
    if (currentQuestion && currentOptions.length === 0) {
      currentQuestion.questionText = (currentQuestion.questionText ? currentQuestion.questionText + " " : "") + line;
      continue;
    }

    // If options already started, it might be a continuation of the previous option
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
