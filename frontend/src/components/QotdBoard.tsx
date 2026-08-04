import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchQotdBoard, fetchQotdLeaderboard } from "../api";
import type { QotdBoard as Board, QotdLeaderboard, QotdScope } from "../types";

export function formatSeconds(seconds?: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** Today's results plus the weekly table for a friend list or a league. */
export default function QotdBoard({
  scope,
  leagueId,
  refreshKey = 0,
}: {
  scope: QotdScope;
  leagueId?: number | null;
  /** Bump to reload after the viewer answers. */
  refreshKey?: number;
}) {
  const { token } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [week, setWeek] = useState<QotdLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [b, w] = await Promise.all([
        fetchQotdBoard(token, scope, leagueId),
        fetchQotdLeaderboard(token, scope, leagueId),
      ]);
      setBoard(b);
      setWeek(w);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the board");
    } finally {
      setLoading(false);
    }
  }, [token, scope, leagueId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading && !board) return <p className="muted">Loading…</p>;
  if (error) {
    return (
      <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
        {error}
      </div>
    );
  }

  const label = scope === "friends" ? "friends" : "league";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ marginBottom: 8 }}>Today</h3>
        {board && !board.revealed ? (
          <p className="muted">
            Answer today's question to see how your {label} did — no peeking at the answers.
          </p>
        ) : !board || board.entries.length === 0 ? (
          <p className="muted">
            {scope === "friends"
              ? "Add some friends to see their results here."
              : "No league members have played yet."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Result</th>
                <th>Time</th>
                <th style={{ textAlign: "right" }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((e) => (
                <tr key={e.user_id} style={e.is_you ? { background: "rgba(37,99,235,0.06)" } : undefined}>
                  <td style={{ fontWeight: e.is_you ? 700 : 500 }}>
                    {e.handle ? `@${e.handle}` : e.display_name}
                    {e.is_you && <span className="muted" style={{ marginLeft: 6 }}>you</span>}
                  </td>
                  <td>
                    {e.status === "answered" ? (
                      <span style={{ color: e.is_correct ? "#166534" : "#991b1b", fontWeight: 600 }}>
                        {e.is_correct ? "Correct" : "Missed it"}
                      </span>
                    ) : (
                      <span className="muted">{e.status === "playing" ? "Playing…" : "Not started"}</span>
                    )}
                  </td>
                  <td>{formatSeconds(e.seconds)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{e.points ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h3 style={{ marginBottom: 4 }}>This week</h3>
        {week && (
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            {week.start_date} → {week.end_date}
          </p>
        )}
        {!week || week.entries.length === 0 ? (
          <p className="muted">Nothing scored yet this week.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th style={{ textAlign: "right" }}>Pts</th>
                <th style={{ textAlign: "right" }}>Correct</th>
                <th style={{ textAlign: "right" }}>Avg</th>
                <th style={{ textAlign: "right" }}>Streak</th>
              </tr>
            </thead>
            <tbody>
              {week.entries.map((e, i) => (
                <tr key={e.user_id} style={e.is_you ? { background: "rgba(37,99,235,0.06)" } : undefined}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: e.is_you ? 700 : 500 }}>
                    {e.handle ? `@${e.handle}` : e.display_name}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{e.total_points}</td>
                  <td style={{ textAlign: "right" }}>
                    {e.correct}/{e.played}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {e.average_seconds != null ? `${e.average_seconds}s` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {e.current_streak > 0 ? `${e.current_streak}🔥` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
