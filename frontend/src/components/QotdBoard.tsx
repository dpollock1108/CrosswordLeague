import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchQotdBoard, fetchQotdLeaderboard } from "../api";
import type { QotdBoard as Board, QotdLeaderboard, QotdScope, QotdTrack } from "../types";

export function formatSeconds(seconds?: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/**
 * Today's results plus the weekly table for a friend list or a league.
 *
 * Today's board is necessarily per-track — each track runs its own question.
 * The weekly table defaults to every track combined, with optional per-track
 * filtering when `tracks` is supplied.
 */
export default function QotdBoard({
  scope,
  leagueId,
  track,
  tracks,
  refreshKey = 0,
}: {
  scope: QotdScope;
  leagueId?: number | null;
  /** Track for today's board. Omit for the backend default. */
  track?: string | null;
  /** Supply to offer per-track filtering on the weekly table. */
  tracks?: QotdTrack[];
  /** Bump to reload after the viewer answers. */
  refreshKey?: number;
}) {
  const { token } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [week, setWeek] = useState<QotdLeaderboard | null>(null);
  const [weekTrack, setWeekTrack] = useState<string | null>(null); // null = all tracks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [b, w] = await Promise.all([
        fetchQotdBoard(token, scope, leagueId, track ?? undefined),
        fetchQotdLeaderboard(token, scope, leagueId, undefined, weekTrack),
      ]);
      setBoard(b);
      setWeek(w);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the board");
    } finally {
      setLoading(false);
    }
  }, [token, scope, leagueId, track, weekTrack]);

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
  const trackName = tracks?.find((t) => t.slug === board?.track)?.name;
  const chip = (active: boolean) =>
    ({
      padding: "4px 12px",
      fontSize: 12,
      background: active ? undefined : "#e5e7eb",
      color: active ? undefined : "#374151",
    }) as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ marginBottom: 8 }}>Today{trackName ? ` · ${trackName}` : ""}</h3>
        {board && !board.revealed ? (
          <p className="muted">
            Answer today's {trackName ? `${trackName.toLowerCase()} ` : ""}question to see how your{" "}
            {label} did — no peeking at the answers.
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ marginBottom: 4 }}>This week</h3>
          {tracks && tracks.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => setWeekTrack(null)} style={chip(weekTrack === null)}>
                All tracks
              </button>
              {tracks.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => setWeekTrack(t.slug)}
                  style={chip(weekTrack === t.slug)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {week && (
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            {week.start_date} → {week.end_date}
            {week.track ? "" : tracks && tracks.length > 1 ? " · every track combined" : ""}
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
