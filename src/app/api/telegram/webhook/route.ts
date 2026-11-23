import { NextRequest, NextResponse } from "next/server";
import { getTelegramQuizByCode, getTelegramBotConfig } from "@/lib/storage";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "online",
    message: "Telegram Quiz Webhook Endpoint is ready.",
    usage: "Send POST updates from Telegram Bot API webhook."
  });
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const botConfig = getTelegramBotConfig();
    const token = botConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.warn("Telegram Webhook received update, but no TELEGRAM_BOT_TOKEN is set.");
      return NextResponse.json({ ok: true, note: "No bot token configured yet" });
    }

    const message = update.message || update.channel_post;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Helper to send text messages
    const sendTelegramMessage = async (msgText: string, replyMarkup?: any) => {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: msgText,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        }),
      });
    };

    // Helper to send native Quiz poll
    const sendQuizPoll = async (q: any, timerSeconds: number) => {
      // Telegram poll options must be strings and at most 10 options, each <= 100 chars
      const formattedOptions = (q.options || []).slice(0, 10).map((opt: string) => opt.slice(0, 100));
      const correctOptionId = Math.min(q.correctAnswer ?? 0, formattedOptions.length - 1);

      await fetch(`https://api.telegram.org/bot${token}/sendPoll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: q.questionText.slice(0, 300),
          options: formattedOptions,
          type: "quiz",
          correct_option_id: correctOptionId,
          explanation: (q.explanation || "").slice(0, 200),
          explanation_parse_mode: "HTML",
          open_period: Math.max(10, Math.min(600, timerSeconds || 30)),
          is_anonymous: false,
        }),
      });
    };

    // Parse commands: /quiz CODE, /test CODE, /start test_CODE, or just CODE
    let quizCode = "";
    if (text.startsWith("/quiz") || text.startsWith("/test")) {
      quizCode = text.split(/\s+/)[1] || "";
    } else if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      if (parts[1]) {
        quizCode = parts[1].replace(/^test_/, "");
      }
    } else if (/^[A-Za-z0-9\-_]{4,15}$/.test(text)) {
      quizCode = text;
    }

    if (!quizCode) {
      // Send Help & Instruction Message
      await sendTelegramMessage(
        `🤖 <b>MCQ Master Quiz Bot</b>\n\n` +
        `કોઈપણ ગ્રૂપમાં મોક ટેસ્ટ શરૂ કરવા માટે નીચે મુજબ આદેશ આપો:\n` +
        `👉 <code>/quiz &lt;TEST_CODE&gt;</code>\n\n` +
        `ઉદાહરણ:\n<code>/quiz GSRTC-101</code>\n\n` +
        `તમારો પોતાનો ટેસ્ટ કોડ બનાવવા માટે વેબસાઇટની મુલાકાત લો.`
      );
      return NextResponse.json({ ok: true });
    }

    // Look up the Quiz
    const quiz = await getTelegramQuizByCode(quizCode);
    if (!quiz) {
      await sendTelegramMessage(
        `❌ <b>ટેસ્ટ કોડ '${quizCode}' મળ્યો નથી!</b>\n` +
        `કૃપા કરીને સાચો કોડ દાખલ કરો અથવા વેબસાઇટ પરથી નવો કોડ બનાવો.`
      );
      return NextResponse.json({ ok: true });
    }

    // Send Intro Card to Group
    await sendTelegramMessage(
      `🎯 <b>મોક ટેસ્ટ શરૂ થઈ રહી છે!</b>\n\n` +
      `📝 <b>શીર્ષક:</b> ${quiz.title}\n` +
      `📚 <b>વિષય:</b> ${quiz.subject}\n` +
      `🔢 <b>કુલ પ્રશ્નો:</b> ${quiz.questions.length}\n` +
      `⏱ <b>સમય:</b> ${quiz.timePerQuestion || 30} સેકન્ડ/પ્રશ્ન\n` +
      `👤 <b>નિર્માતા:</b> ${quiz.createdBy}\n\n` +
      `<i>તૈયાર રહો! તમામ સભ્યો પોલ દ્વારા જવાબ આપી શકે છે...</i>`
    );

    // Send first question or all questions with interval
    const timeSec = quiz.timePerQuestion || 30;
    for (let i = 0; i < Math.min(quiz.questions.length, 10); i++) {
      const q = quiz.questions[i];
      await sendQuizPoll(q, timeSec);
      // Brief sleep between sending polls so they don't hit Telegram rate limits
      await new Promise((r) => setTimeout(r, 1200));
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Telegram Webhook Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
