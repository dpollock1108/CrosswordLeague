import { useEffect, useMemo, useState } from "react";
import { fetchLeaderboard, fetchWallOfShame } from "../api";
import type { LeaderboardEntry, LeaderboardResponse, WallOfShameResponse } from "../types";

type Mode = "week" | "month";
type ViewMode = "leaderboard" | "wall";
type PuzzleFilter = "all" | "mini" | "medium";

// Maps the UI filter to backend puzzle_type values. "Mini" includes legacy
// NYT minis alongside hosted 5x5s; "all" sends no filter.
const PUZZLE_TYPE_GROUPS: Record<PuzzleFilter, string[] | undefined> = {
  all: undefined,
  mini: ["nyt_mini", "mini_5x5"],
  medium: ["medium_10x10"],
};

function formatSeconds(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatSecondsRounded(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "—";
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
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
  const [view, setView] = useState<ViewMode>("leaderboard");
  const [puzzleFilter, setPuzzleFilter] = useState<PuzzleFilter>("all");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [wall, setWall] = useState<WallOfShameResponse | null>(null);
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
    setWall(null);
    Promise.all([
      fetchLeaderboard({
        startDate: formatDate(start),
        endDate: formatDate(end),
        puzzleTypes: PUZZLE_TYPE_GROUPS[puzzleFilter],
      }),
      fetchWallOfShame({
        scope: mode,
        startDate: formatDate(start),
        endDate: formatDate(end),
      }),
    ])
      .then(([leaderboard, wallData]) => {
        setData(leaderboard);
        setWall(wallData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [start, end, puzzleFilter, mode]);

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
          <ViewToggle view={view} onChange={setView} />
        </div>
      </header>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setOffset((n) => n - 1)}>Previous</button>
        <button onClick={() => setOffset(0)}>Current</button>
        <button onClick={() => setOffset((n) => n + 1)}>Next</button>
        {view === "leaderboard" && (
          <div style={{ marginLeft: "auto" }}>
            <PuzzleTypeToggle filter={puzzleFilter} onChange={setPuzzleFilter} />
          </div>
        )}
      </div>
      {loading && <div>Loading leaderboard…</div>}
      {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
      {!loading && !error && view === "leaderboard" && data && data.entries.length === 0 && (
        <div className="empty">No results for this window.</div>
      )}

      {!loading && !error && view === "leaderboard" && data && data.entries.length > 0 && (
        <>
          <Podium entries={podium} />
          <table>
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

      {!loading && !error && view === "wall" && wall && <WallOfShameCard wall={wall} loading={loading} />}
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
            <strong>{entry.total_points}</strong> pts · Avg {formatSecondsRounded(entry.average_seconds)} · Best{" "}
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
      <td>{formatSecondsRounded(entry.average_seconds)}</td>
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

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <button
        onClick={() => onChange("leaderboard")}
        style={{
          borderRadius: 0,
          background: view === "leaderboard" ? "linear-gradient(135deg, #0f172a, #1f2937)" : "#ffffff",
          color: view === "leaderboard" ? "#ffffff" : "#0f172a",
        }}
      >
        Leaderboard
      </button>
      <button
        onClick={() => onChange("wall")}
        style={{
          borderRadius: 0,
          background: view === "wall" ? "linear-gradient(135deg, #b91c1c, #f87171)" : "#ffffff",
          color: view === "wall" ? "#ffffff" : "#0f172a",
        }}
      >
        Wall of Shame
      </button>
    </div>
  );
}

function PuzzleTypeToggle({
  filter,
  onChange,
}: {
  filter: PuzzleFilter;
  onChange: (filter: PuzzleFilter) => void;
}) {
  const options: { value: PuzzleFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mini", label: "Mini" },
    { value: "medium", label: "Medium" },
  ];
  return (
    <div style={{ display: "inline-flex", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            borderRadius: 0,
            background: filter === opt.value ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#ffffff",
            color: filter === opt.value ? "#ffffff" : "#0f172a",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function WallOfShameCard({ wall, loading }: { wall: WallOfShameResponse | null; loading: boolean }) {
  const topOffenderId = wall?.entries[0]?.player_id;
  return (
    <div className="card wall-card" style={{ marginTop: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>🚨 Wall of Shame 🤢 (bruh)</h3>
          <p className="muted" style={{ margin: 0 }}>
            Missing puzzles for {wall ? `${wall.start_date} → ${wall.end_date}` : "…"} — own up or catch up, fr fr.
          </p>
        </div>
        <span className="badge shame-badge">
          {wall?.scope === "month" ? "Monthly" : "Weekly"}
        </span>
      </div>
      {loading && <div style={{ marginTop: 12 }}>Loading…</div>}
      {!loading && wall && wall.entries.length === 0 && (
        <div className="empty" style={{ color: "#166534" }}>
          Everyone is caught up 🎉
        </div>
      )}
      {!loading && wall && wall.entries.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Missed</th>
            </tr>
          </thead>
          <tbody>
            {wall.entries.map((entry) => (
              <tr key={entry.player_id} className={entry.player_id === topOffenderId ? "top-offender" : ""}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{entry.player_id === topOffenderId ? "💀" : "😬"}</span>
                    <div>
                      <strong>{entry.name}</strong>{" "}
                      <span className="muted">{entry.handle ? `@${entry.handle}` : ""}</span>
                      {entry.player_id === topOffenderId && (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          Repeat offender — yikes. bruh c’mon 🙄
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ textAlign: "center", fontWeight: 800, position: "relative" }}>
                  <span className="miss-count">
                    {entry.missing_count} {entry.missing_count > 3 ? "😵‍💫" : "🤨"}
                  </span>
                  <span
                    className="miss-bar"
                    style={{ width: `${Math.min(entry.missing_count * 12, 100)}%` }}
                    aria-hidden
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
