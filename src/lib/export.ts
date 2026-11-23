import { Paper, Question } from "@/types";

export const formatPaperForWhatsApp = (paper: Paper, includeAnswers = false): string => {
  let output = `📝 *${paper.title}*\n`;
  if (paper.subject) output += `📚 વિષય: ${paper.subject}\n`;
  if (paper.category) output += `🏷️ શ્રેણી: ${paper.category}\n`;
  output += `👤 નિર્માતા: ${paper.userName}\n`;
  output += `🔢 કુલ પ્રશ્નો: ${paper.questions?.length || 0}\n`;
  output += `------------------------------------\n\n`;

  paper.questions.forEach((q, index) => {
    output += `*Q${index + 1}.* ${q.questionText}\n`;
    const labels = ["A", "B", "C", "D", "E"];
    q.options.forEach((opt, optIndex) => {
      output += `(${labels[optIndex]}) ${opt}\n`;
    });

    if (includeAnswers) {
      output += `✅ *સાચો જવાબ:* (${labels[q.correctAnswer]})\n`;
      if (q.explanation) {
        output += `💡 *સમજૂતી:* ${q.explanation}\n`;
      }
    }
    output += `\n`;
  });

  if (!includeAnswers && paper.questions.length > 0) {
    output += `\n🔑 *ઉત્તરાવલી (Answer Key):*\n`;
    const labels = ["A", "B", "C", "D", "E"];
    const keys = paper.questions.map((q, idx) => `Q${idx + 1}: ${labels[q.correctAnswer]}`);
    output += keys.join(" | ");
    output += `\n`;
  }

  output += `\n✨ Created via MCQ Master App`;
  return output;
};

export const exportPaperAsJSON = (paper: Paper): void => {
  const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(paper, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", jsonStr);
  downloadAnchor.setAttribute("download", `${paper.title.replace(/\s+/g, "_")}_MCQ.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
};

export const exportPaperAsCSV = (paper: Paper): void => {
  const labels = ["A", "B", "C", "D", "E"];
  let csv = "Question Number,Question Text,Option A,Option B,Option C,Option D,Option E,Correct Answer,Explanation\n";
  
  paper.questions.forEach((q, i) => {
    const clean = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
    const row = [
      i + 1,
      clean(q.questionText),
      clean(q.options[0] || ''),
      clean(q.options[1] || ''),
      clean(q.options[2] || ''),
      clean(q.options[3] || ''),
      clean(q.options[4] || ''),
      labels[q.correctAnswer] || 'A',
      clean(q.explanation || '')
    ];
    csv += row.join(",") + "\n";
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", url);
  downloadAnchor.setAttribute("download", `${paper.title.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
};
