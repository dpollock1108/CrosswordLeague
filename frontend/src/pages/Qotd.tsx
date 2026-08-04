import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { answerQotd, fetchQotdStats, fetchQotdToday, listLeagues, startQotd } from "../api";
import QotdBoard, { formatSeconds } from "../components/QotdBoard";
import type { LeaguePublic, QotdAnswerResult, QotdScope, QotdStats, QotdToday } from "../types";

/** Server timestamps are naive UTC; mark them as such before parsing. */
function parseUtc(iso: string): number {
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

const CHOICE_LABELS = ["A", "B", "C", "D"];

export default function Qotd() {
  const { token, user } = useAuth();
  const [today, setToday] = useState<QotdToday | null>(null);
  const [stats, setStats] = useState<QotdStats | null>(null);
  const [leagues, setLeagues] = useState<LeaguePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<QotdAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [boardKey, setBoardKey] = useState(0);

  const [scope, setScope] = useState<QotdScope>("friends");
  const [leagueId, setLeagueId] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [t, s, l] = await Promise.all([
        fetchQotdToday(token),
        fetchQotdStats(token),
        listLeagues(token).catch(() => [] as LeaguePublic[]),
      ]);
      setToday(t);
      setStats(s);
      setLeagues(l.filter((league) => league.membership_status !== "pending"));
      // Resume a question that was revealed but never answered — the server's
      // clock has been running the whole time.
      if (t.attempt && !t.attempt.answered_at) {
        setRevealed(true);
        setElapsed(Math.max(0, Math.floor((Date.now() - parseUtc(t.attempt.started_at)) / 1000)));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load today's question");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const answered = Boolean(today?.attempt?.answered_at) || Boolean(result);

  // Cosmetic ticker — the scored time is measured server-side.
  useEffect(() => {
    if (!revealed || answered) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [revealed, answered]);

  const handleReveal = async () => {
    if (!token || !today?.question) return;
    setBusy(true);
    try {
      await startQotd(token, today.question.id);
      setElapsed(0);
      setRevealed(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setBusy(false);
    }
  };

  const handleAnswer = async (index: number) => {
    if (!token || !today?.question || answered || busy) return;
    setSelected(index);
    setBusy(true);
    try {
      const res = await answerQotd(token, today.question.id, index);
      setResult(res);
      setElapsed(res.seconds);
      setBoardKey((k) => k + 1);
      fetchQotdStats(token).then(setStats).catch(() => undefined);
      setError(null);
    } catch (e) {
      setSelected(null);
      setError(e instanceof Error ? e.message : "Failed to submit your answer");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <p className="muted">Sign in to play the question of the day.</p>;
  if (loading) return <p className="muted">Loading…</p>;

  const question = today?.question;
  // After a reload, the stored attempt carries the result the state doesn't.
  const answerIndex = result?.answer_index ?? today?.answer_index ?? null;
  const chosenIndex = result?.selected_index ?? today?.attempt?.selected_index ?? selected;
  const isCorrect = result?.is_correct ?? today?.attempt?.is_correct ?? null;
  const shownSeconds = result?.seconds ?? today?.attempt?.seconds ?? elapsed;
  const points = result?.points ?? today?.attempt?.points ?? 0;
  const streak = result?.streak ?? today?.streak ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>Question of the Day</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          One general-knowledge question a day. One shot, timed from the moment you reveal it.
        </p>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
          {error}
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="badge">🔥 {stats.current_streak} day streak</span>
          <span className="badge">
            {stats.accuracy != null ? `${stats.accuracy}% correct` : "No answers yet"}
          </span>
          <span className="badge">
            {stats.best_seconds != null ? `Best ${formatSeconds(stats.best_seconds)}` : "No time yet"}
          </span>
          <span className="badge">{stats.total_points} lifetime points</span>
        </div>
      )}

      <div className="card">
        {!question ? (
          <div>
            <h3 style={{ marginBottom: 6 }}>No question today</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              The question bank is empty. <Link to="/qotd/submit">Submit one</Link> — it gets
              fact-checked automatically and can go live on an upcoming day.
            </p>
          </div>
        ) : !revealed && !answered ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <h3 style={{ marginBottom: 0 }}>Today's question is ready</h3>
            <p className="muted" style={{ margin: 0 }}>
              Your clock starts the moment you reveal it, so get comfortable first.
              {question.category ? ` Category: ${question.category}.` : ""}
            </p>
            <button onClick={handleReveal} disabled={busy}>
              Reveal today's question
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {question.question_date}
                {question.category ? ` · ${question.category}` : ""}
                {question.difficulty ? ` · ${question.difficulty}` : ""}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 20 }}>
                {formatSeconds(shownSeconds)}
              </span>
            </div>

            <h3 style={{ fontSize: 22, lineHeight: 1.35 }}>{question.prompt}</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {question.choices.map((choice, i) => {
                const isAnswer = answered && answerIndex === i;
                const isWrongPick = answered && chosenIndex === i && answerIndex !== i;
                const background = isAnswer ? "#f0fdf4" : isWrongPick ? "#fef2f2" : "white";
                const borderColor = isAnswer ? "#16a34a" : isWrongPick ? "#dc2626" : "#d1d5db";
                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={answered || busy}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: 10,
                      border: `2px solid ${borderColor}`,
                      background,
                      color: "#0f172a",
                      fontWeight: 500,
                      fontSize: 16,
                      opacity: answered && !isAnswer && !isWrongPick ? 0.55 : 1,
                      cursor: answered ? "default" : "pointer",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: "#eef2ff",
                        color: "#3730a3",
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {CHOICE_LABELS[i] ?? i + 1}
                    </span>
                    {choice}
                    {isAnswer && <span style={{ marginLeft: "auto", color: "#166534" }}>✓</span>}
                    {isWrongPick && <span style={{ marginLeft: "auto", color: "#991b1b" }}>✕</span>}
                  </button>
                );
              })}
            </div>

            {answered && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: isCorrect ? "#f0fdf4" : "#fef2f2",
                  color: isCorrect ? "#166534" : "#991b1b",
                }}
              >
                <strong style={{ fontSize: 16 }}>
                  {isCorrect ? "Correct!" : "Not this time."}
                </strong>{" "}
                {formatSeconds(shownSeconds)} · {points} point{points === 1 ? "" : "s"}
                {streak > 0 ? ` · ${streak} day streak 🔥` : ""}
                {(result?.explanation ?? today?.explanation) && (
                  <p style={{ margin: "8px 0 0", color: "#0f172a", fontWeight: 400 }}>
                    {result?.explanation ?? today?.explanation}
                  </p>
                )}
                {question.submitted_by_handle && (
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                    Submitted by @{question.submitted_by_handle}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <h3>Standings</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => {
                setScope("friends");
                setLeagueId(null);
              }}
              style={{
                background: scope === "friends" ? undefined : "#e5e7eb",
                color: scope === "friends" ? undefined : "#374151",
                padding: "6px 12px",
                fontSize: 13,
              }}
            >
              Friends
            </button>
            {leagues.length > 0 && (
              <select
                value={scope === "league" ? String(leagueId ?? "") : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    setScope("friends");
                    setLeagueId(null);
                  } else {
                    setScope("league");
                    setLeagueId(Number(value));
                  }
                }}
                style={{ padding: "6px 10px", fontSize: 13 }}
              >
                <option value="">A league…</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <QotdBoard scope={scope} leagueId={leagueId} refreshKey={boardKey} />
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Every question here is written by a player. <Link to="/qotd/submit">Submit one</Link> or{" "}
        <Link to="/friends">add friends</Link> to fill out your board.
      </p>
    </div>
  );
}
