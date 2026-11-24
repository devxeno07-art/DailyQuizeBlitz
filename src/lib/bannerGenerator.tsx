import React from "react";
import { ImageResponse } from "next/og";
import { TelegramQuizSession, TelegramParticipant } from "@/types";

interface FormattedRanker {
  rank: number;
  name: string;
  handle: string;
  scoreText: string;
  timeText: string;
  accuracyText: string;
  initial: string;
  avatarUrl?: string;
}

const formatParticipantTime = (
  p: TelegramParticipant | undefined
): string => {
  if (!p || !p.joinedAt || !p.lastAnsweredAt) return "—";
  const start = new Date(p.joinedAt).getTime();
  const end = new Date(p.lastAnsweredAt).getTime();
  const diffSec = Math.max(1, Math.round((end - start) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s < 10 ? "0" + s : s}s`;
};

const getRankerData = (
  p: TelegramParticipant | undefined,
  rank: number,
  totalQuestions: number,
  avatarUrl?: string
): FormattedRanker => {
  if (!p) {
    return {
      rank,
      name: "—",
      handle: "—",
      scoreText: `0/${totalQuestions}`,
      timeText: "—",
      accuracyText: "0%",
      initial: "?",
    };
  }

  const name = (p.name || "વિદ્યાર્થી").trim();
  const initial = (name[0] || "U").toUpperCase();
  const handle = p.username ? `@${p.username}` : `User ${p.userId.slice(-4)}`;
  const scoreText = `${p.score}/${totalQuestions}`;
  const timeText = formatParticipantTime(p);
  const pct = totalQuestions > 0 ? Math.round((p.score / totalQuestions) * 100) : 0;
  const accuracyText = `${pct}%`;

  return {
    rank,
    name: name.length > 16 ? name.slice(0, 15) + "…" : name,
    handle,
    scoreText,
    timeText,
    accuracyText,
    initial,
    avatarUrl,
  };
};

/**
 * Generates an HD 1200 x 675 landscape PNG banner for Telegram showing the Top 3
 * rankers on a podium (Silver on left, Gold in center, Bronze on right).
 */
export const generateTop3Banner = async (
  session: TelegramQuizSession,
  botUsername = "databasehandlerbot",
  avatarUrls: Record<string, string> = {}
): Promise<Buffer | null> => {
  try {
    const participants: TelegramParticipant[] = Object.values(
      session.participants || {}
    )
      .filter((p) => p.answeredCount > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.wrong - b.wrong ||
          new Date(a.lastAnsweredAt).getTime() -
            new Date(b.lastAnsweredAt).getTime()
      );

    if (participants.length === 0) {
      return null;
    }

    const totalQuestions = session.quiz?.questions?.length || 0;
    const rawTitle = session.quiz?.title || "MOCK TEST";
    const title = rawTitle.toUpperCase();
    const subject = session.quiz?.subject;
    const dateStr = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const p1 = participants[0];
    const p2 = participants[1];
    const p3 = participants[2];

    const rank1 = getRankerData(p1, 1, totalQuestions, p1 ? avatarUrls[p1.userId] : undefined);
    const rank2 = getRankerData(p2, 2, totalQuestions, p2 ? avatarUrls[p2.userId] : undefined);
    const rank3 = getRankerData(p3, 3, totalQuestions, p3 ? avatarUrls[p3.userId] : undefined);

    const bannerElement = (
      <div
        style={{
          width: "1200px",
          height: "675px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "36px 48px",
          background:
            "radial-gradient(circle at 50% 20%, #172554 0%, #090e1a 60%, #030712 100%)",
          color: "#f3f4f6",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Ambient Glows */}
        <div
          style={{
            position: "absolute",
            width: "480px",
            height: "480px",
            background:
              "radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, rgba(0,0,0,0) 70%)",
            top: "20%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "360px",
            height: "360px",
            background:
              "radial-gradient(circle, rgba(148, 163, 184, 0.14) 0%, rgba(0,0,0,0) 70%)",
            top: "30%",
            left: "15%",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "360px",
            height: "360px",
            background:
              "radial-gradient(circle, rgba(234, 88, 12, 0.14) 0%, rgba(0,0,0,0) 70%)",
            top: "30%",
            right: "15%",
          }}
        />

        {/* TOP HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(51, 65, 85, 0.8)",
            paddingBottom: "16px",
            zIndex: 10,
          }}
        >
          {/* Trophy & Title */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "16px",
                boxShadow: "0 8px 20px rgba(245, 158, 11, 0.3)",
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="#030712">
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.71 2.72 3.11 3.43V19H8v2h8v-2h-2.5v-2.63c1.4-.71 2.48-1.93 3.11-3.43C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "bold",
                    color: "#f59e0b",
                    background: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    marginRight: "10px",
                  }}
                >
                  Official Results
                </span>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {dateStr}
                </span>
              </div>
              <span
                style={{
                  fontSize: title.length > 28 ? "20px" : "24px",
                  fontWeight: "900",
                  color: "#ffffff",
                  marginTop: "4px",
                }}
              >
                {title.length > 40 ? title.slice(0, 39) + "…" : title}
              </span>
              {subject ? (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#38bdf8",
                    marginTop: "2px",
                  }}
                >
                  {subject.length > 50 ? subject.slice(0, 49) + "…" : subject}
                </span>
              ) : null}
            </div>
          </div>

          {/* Quick Stats Chips */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid #1e293b",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                marginLeft: "12px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                }}
              >
                QUESTIONS
              </span>
              <span
                style={{ fontSize: "16px", color: "#f1f5f9", fontWeight: "bold" }}
              >
                {totalQuestions} Qs
              </span>
            </div>
            <div
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid #1e293b",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                marginLeft: "12px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                }}
              >
                TOTAL ATTEMPTS
              </span>
              <span
                style={{ fontSize: "16px", color: "#60a5fa", fontWeight: "bold" }}
              >
                {participants.length} Users
              </span>
            </div>
          </div>
        </div>

        {/* CENTER PODIUM (Rank 2 | Rank 1 | Rank 3) */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            paddingTop: "10px",
            zIndex: 10,
          }}
        >
          {/* ================= RANK 2 (SILVER - LEFT) ================= */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "280px",
              margin: "0 18px",
            }}
          >
            {/* Avatar & Rank badge */}
            <div
              style={{
                display: "flex",
                position: "relative",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "86px",
                  height: "86px",
                  borderRadius: "43px",
                  background: "#0f172a",
                  border: "4px solid #94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  fontSize: "30px",
                  fontWeight: "900",
                  color: "#e2e8f0",
                  boxShadow: "0 0 25px rgba(148, 163, 184, 0.4)",
                }}
              >
                {rank2.avatarUrl ? (
                  <img
                    src={rank2.avatarUrl}
                    alt={rank2.name}
                    width={86}
                    height={86}
                    style={{
                      width: "86px",
                      height: "86px",
                      borderRadius: "43px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  rank2.initial
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "-6px",
                  right: "6px",
                  width: "28px",
                  height: "28px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #cbd5e1, #94a3b8)",
                  color: "#030712",
                  fontSize: "14px",
                  fontWeight: "900",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #030712",
                }}
              >
                2
              </div>
            </div>
            <span
              style={{
                fontSize: "17px",
                fontWeight: "bold",
                color: "#f8fafc",
                marginTop: "4px",
              }}
            >
              {rank2.name}
            </span>
            <span
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                marginBottom: "12px",
              }}
            >
              {rank2.handle}
            </span>

            {/* Silver Pedestal */}
            <div
              style={{
                width: "100%",
                height: "160px",
                borderRadius: "16px 16px 0 0",
                background:
                  "linear-gradient(180deg, rgba(148, 163, 184, 0.22) 0%, rgba(15, 23, 42, 0.95) 100%)",
                borderTop: "3px solid #cbd5e1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                boxShadow: "0 -8px 20px rgba(148, 163, 184, 0.15)",
              }}
            >
              <span
                style={{
                  fontSize: "32px",
                  fontWeight: "900",
                  color: "rgba(148, 163, 184, 0.35)",
                }}
              >
                #2
              </span>
              <div
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.9)",
                  borderRadius: "12px",
                  padding: "10px",
                  display: "flex",
                  justifyContent: "space-around",
                  border: "1px solid #334155",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      color: "#94a3b8",
                      fontWeight: "bold",
                    }}
                  >
                    SCORE
                  </span>
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: "bold",
                      color: "#e2e8f0",
                    }}
                  >
                    {rank2.scoreText}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      color: "#94a3b8",
                      fontWeight: "bold",
                    }}
                  >
                    TIME
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "bold",
                      color: "#cbd5e1",
                    }}
                  >
                    {rank2.timeText}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ================= RANK 1 (GOLD - CENTER) ================= */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "320px",
              margin: "0 18px",
            }}
          >
            {/* Crown Icon */}
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="#fbbf24"
              style={{ marginBottom: "4px" }}
            >
              <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V17H19V19Z" />
            </svg>

            {/* Avatar & Rank badge */}
            <div
              style={{
                display: "flex",
                position: "relative",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "110px",
                  height: "110px",
                  borderRadius: "55px",
                  background: "#0f172a",
                  border: "5px solid #f59e0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  fontSize: "40px",
                  fontWeight: "900",
                  color: "#fbbf24",
                  boxShadow: "0 0 35px rgba(245, 158, 11, 0.6)",
                }}
              >
                {rank1.avatarUrl ? (
                  <img
                    src={rank1.avatarUrl}
                    alt={rank1.name}
                    width={110}
                    height={110}
                    style={{
                      width: "110px",
                      height: "110px",
                      borderRadius: "55px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  rank1.initial
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "-6px",
                  right: "8px",
                  width: "32px",
                  height: "32px",
                  borderRadius: "16px",
                  background:
                    "linear-gradient(135deg, #f59e0b, #fbbf24, #fef08a)",
                  color: "#030712",
                  fontSize: "16px",
                  fontWeight: "900",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #030712",
                }}
              >
                1
              </div>
            </div>
            <span
              style={{
                fontSize: "22px",
                fontWeight: "900",
                color: "#ffffff",
                marginTop: "4px",
              }}
            >
              {rank1.name}
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "#fcd34d",
                marginBottom: "12px",
              }}
            >
              {rank1.handle}
            </span>

            {/* Gold Pedestal */}
            <div
              style={{
                width: "100%",
                height: "215px",
                borderRadius: "16px 16px 0 0",
                background:
                  "linear-gradient(180deg, rgba(245, 158, 11, 0.28) 0%, rgba(15, 23, 42, 0.95) 100%)",
                borderTop: "3px solid #fbbf24",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                boxShadow: "0 -10px 30px rgba(245, 158, 11, 0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(245, 158, 11, 0.2)",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  padding: "4px 14px",
                  borderRadius: "20px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "900",
                    color: "#fbbf24",
                    letterSpacing: "1.5px",
                  }}
                >
                  ★ TOP RANKER ★
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.95)",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "flex",
                  justifyContent: "space-around",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#fbbf24",
                      fontWeight: "bold",
                    }}
                  >
                    SCORE
                  </span>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: "900",
                      color: "#fef08a",
                    }}
                  >
                    {rank1.scoreText}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#fbbf24",
                      fontWeight: "bold",
                    }}
                  >
                    TIME
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "bold",
                      color: "#ffffff",
                    }}
                  >
                    {rank1.timeText}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#4ade80",
                      fontWeight: "bold",
                    }}
                  >
                    ACCURACY
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "bold",
                      color: "#4ade80",
                    }}
                  >
                    {rank1.accuracyText}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ================= RANK 3 (BRONZE - RIGHT) ================= */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "280px",
              margin: "0 18px",
            }}
          >
            {/* Avatar & Rank badge */}
            <div
              style={{
                display: "flex",
                position: "relative",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: "86px",
                  height: "86px",
                  borderRadius: "43px",
                  background: "#0f172a",
                  border: "4px solid #ea580c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  fontSize: "30px",
                  fontWeight: "900",
                  color: "#fdba74",
                  boxShadow: "0 0 25px rgba(234, 88, 12, 0.4)",
                }}
              >
                {rank3.avatarUrl ? (
                  <img
                    src={rank3.avatarUrl}
                    alt={rank3.name}
                    width={86}
                    height={86}
                    style={{
                      width: "86px",
                      height: "86px",
                      borderRadius: "43px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  rank3.initial
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "-6px",
                  right: "6px",
                  width: "28px",
                  height: "28px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #c2410c, #ea580c)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "900",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #030712",
                }}
              >
                3
              </div>
            </div>
            <span
              style={{
                fontSize: "17px",
                fontWeight: "bold",
                color: "#f8fafc",
                marginTop: "4px",
              }}
            >
              {rank3.name}
            </span>
            <span
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                marginBottom: "12px",
              }}
            >
              {rank3.handle}
            </span>

            {/* Bronze Pedestal */}
            <div
              style={{
                width: "100%",
                height: "135px",
                borderRadius: "16px 16px 0 0",
                background:
                  "linear-gradient(180deg, rgba(234, 88, 12, 0.22) 0%, rgba(15, 23, 42, 0.95) 100%)",
                borderTop: "3px solid #f97316",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                boxShadow: "0 -8px 20px rgba(234, 88, 12, 0.15)",
              }}
            >
              <span
                style={{
                  fontSize: "32px",
                  fontWeight: "900",
                  color: "rgba(234, 88, 12, 0.35)",
                }}
              >
                #3
              </span>
              <div
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.9)",
                  borderRadius: "12px",
                  padding: "10px",
                  display: "flex",
                  justifyContent: "space-around",
                  border: "1px solid #334155",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      color: "#94a3b8",
                      fontWeight: "bold",
                    }}
                  >
                    SCORE
                  </span>
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: "bold",
                      color: "#e2e8f0",
                    }}
                  >
                    {rank3.scoreText}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      color: "#94a3b8",
                      fontWeight: "bold",
                    }}
                  >
                    TIME
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "bold",
                      color: "#cbd5e1",
                    }}
                  >
                    {rank3.timeText}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM FOOTER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(51, 65, 85, 0.8)",
            paddingTop: "14px",
            fontSize: "12px",
            color: "#94a3b8",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#38bdf8"
              style={{ marginRight: "8px" }}
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
            <span style={{ fontWeight: "600", color: "#cbd5e1" }}>
              Generated by @{botUsername}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: "6px" }}>Verified Result ID:</span>
            <span
              style={{
                fontFamily: "monospace",
                color: "#e2e8f0",
                fontWeight: "bold",
                background: "rgba(30, 41, 59, 0.8)",
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              #{session.code}
            </span>
          </div>
        </div>
      </div>
    );

    const imageResponse = new ImageResponse(bannerElement, {
      width: 1200,
      height: 675,
    });

    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn("[bannerGenerator] Failed to generate Top 3 banner:", err);
    return null;
  }
};
