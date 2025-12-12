import { useEffect, useMemo, useState } from "react";
import { fetchLeaderboard } from "../api";
import type { LeaderboardEntry, LeaderboardResponse } from "../types";

type Mode = "week" | "month";

function formatSeconds(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

function startOfWeekSunday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function ResultsDashboard() {
  const [mode, setMode] = useState<Mode>("week");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { start, end, label } = useMemo(() => {
    const today = new Date();
    if (mode === "week") {
      const start = startOfWeekSunday(today);
      start.setDate(start.getDate() + offset * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start, end, label: `${formatDate(start)} → ${formatDate(end)}` };
    }
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const start = startOfMonth(base);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start, end, label: `${formatDate(start)} → ${formatDate(end)}` };
  }, [mode, offset]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    fetchLeaderboard({
      startDate: formatDate(start),
      endDate: formatDate(end),
    })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [start, end]);

  const podium = data?.entries.slice(0, 3) || [];
  const rest = data?.entries.slice(3) || [];

  return (
    <section className="card">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Results Dashboard</h2>
          <p className="muted">{label}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Toggle mode={mode} onChange={setMode} />
          <span className="badge">{mode === "week" ? "Sun → Sat" : "Calendar month"}</span>
        </div>
      </header>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setOffset((n) => n - 1)}>Previous</button>
        <button onClick={() => setOffset(0)}>Current</button>
        <button onClick={() => setOffset((n) => n + 1)}>Next</button>
      </div>
      {loading && <div>Loading leaderboard…</div>}
      {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
      {!loading && !error && data && data.entries.length === 0 && (
        <div className="empty">No results for this window.</div>
      )}

      {!loading && !error && data && data.entries.length > 0 && (
        <>
          <Podium entries={podium} />
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Puzzles</th>
                <th>Avg Time</th>
                <th>Best</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry, idx) => (
                <Row key={entry.player_id} entry={entry} rank={idx + 4} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  if (!entries.length) return null;
  const labels = ["gold", "silver", "bronze"];
  return (
    <div className="podium">
      {entries.map((entry, idx) => (
        <div key={entry.player_id} className={`podium-card ${labels[idx] ?? ""}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className={`chip ${labels[idx] ?? ""}`}>#{idx + 1}</span>
            <span className="muted">{entry.puzzles_played} puzzles</span>
          </div>
          <h3 style={{ marginTop: 8 }}>
            {entry.name} <span className="muted">{entry.handle ? `@${entry.handle}` : ""}</span>
          </h3>
          <p style={{ margin: 0 }}>
            <strong>{entry.total_points}</strong> pts · Avg {formatSeconds(entry.average_seconds)} · Best{" "}
            {formatSeconds(entry.best_seconds)}
          </p>
        </div>
      ))}
    </div>
  );
}

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <tr>
      <td>{rank}</td>
      <td>
        <strong>{entry.name}</strong>{" "}
        <span className="muted">{entry.handle ? `@${entry.handle}` : ""}</span>
      </td>
      <td>{entry.total_points}</td>
      <td>{entry.puzzles_played}</td>
      <td>{formatSeconds(entry.average_seconds)}</td>
      <td>{formatSeconds(entry.best_seconds)}</td>
    </tr>
  );
}

function Toggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <button
        onClick={() => onChange("week")}
        style={{
          borderRadius: 0,
          background: mode === "week" ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#ffffff",
          color: mode === "week" ? "#ffffff" : "#0f172a",
        }}
      >
        Weekly
      </button>
      <button
        onClick={() => onChange("month")}
        style={{
          borderRadius: 0,
          background: mode === "month" ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#ffffff",
          color: mode === "month" ? "#ffffff" : "#0f172a",
        }}
      >
        Monthly
      </button>
    </div>
  );
}
