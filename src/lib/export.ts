import { Paper, Question, TelegramQuiz } from "@/types";

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

export interface ScoreboardParticipant {
  rank: number;
  name: string;
  score: number;
  total: number;
  wrong: number;
  percentage: number;
  grade: string;
}

export const formatLeaderboardForTelegram = (
  subject: string,
  totalQuestions: number,
  timePerQuestion: number = 30,
  participants: ScoreboardParticipant[],
  webUrl: string = "https://mcq-master.vercel.app"
): string => {
  let msg = `🏆 *મેગા મોક ટેસ્ટ પરિણામ અને લીડરબોર્ડ*\n\n`;
  msg += `📚 *વિષય:* 📖 ${subject} (${totalQuestions} MCQs)\n`;
  msg += `📊 *કુલ પ્રશ્નો:* ${totalQuestions} | ⏱ *સમય:* ${timePerQuestion} સે./પ્રશ્ન | 👥 *વિદ્યાર્થીઓ:* ${participants.length}\n\n`;
  msg += `📋 *મોક ટેસ્ટ સ્કોરબોર્ડ ટેબલ (Top ${participants.length} / ${participants.length})*\n\n`;
  msg += `\`ક્રમ  વિદ્યાર્થી       સ્કોર    ખોટા     %    ગ્રેડ\`\n`;
  msg += `\`-------------------------------------------------\`\n`;

  participants.forEach((p) => {
    const medal = p.rank === 1 ? "🥇1" : p.rank === 2 ? "🥈2" : p.rank === 3 ? "🥉3" : `${p.rank} `;
    const rankStr = medal.padEnd(4);
    const cleanName = (p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name).padEnd(14);
    const scoreStr = `${p.score}/${p.total}`.padEnd(8);
    const wrongStr = p.wrong.toString().padEnd(6);
    const pctStr = `${p.percentage.toFixed(1)}%`.padEnd(7);
    const gradeStr = p.grade;
    msg += `\`${rankStr} ${cleanName} ${scoreStr} ${wrongStr} ${pctStr} ${gradeStr}\`\n`;
  });

  msg += `\n👏 *ઉત્કૃષ્ટ પ્રદર્શન કરનાર તમામ વિદ્યાર્થીઓને ખૂબ ખૂબ અભિનંદન!* 🎯\n`;
  msg += `🌐 *સંપૂર્ણ HTML Table & આન્સર કી:* [અહીં ક્લિક કરો](${webUrl})\n`;
  return msg;
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
