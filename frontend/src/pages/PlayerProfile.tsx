import { useEffect, useMemo, useState } from "react";
import { fetchPlayerStats, fetchPlayers } from "../api";
import type { Player, PlayerStats } from "../types";

function formatSeconds(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function PlayerProfile() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlayers()
      .then(setPlayers)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (selected === null) return;
    setError(null);
    setStats(null);
    setLoading(true);
    fetchPlayerStats(selected)
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected]);

  const weekdayAverages = useMemo(() => {
    if (!stats?.weekday_averages) return [];
    return Object.entries(stats.weekday_averages).sort(([dayA], [dayB]) => weekdayOrder(dayA) - weekdayOrder(dayB));
  }, [stats]);

  return (
    <section className="card">
      <h2>Player Profile</h2>
      <p className="muted">Select a player to view their stats.</p>
      <select
        value={selected ?? ""}
        onChange={(e) => setSelected(Number(e.target.value))}
        style={{ padding: "8px", borderRadius: "8px", border: "1px solid #d1d5db" }}
      >
        <option value="">Choose a player</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {p.handle ? `(@${p.handle})` : ""}
          </option>
        ))}
      </select>
      {players.length === 0 && <p className="empty">No players yet.</p>}
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      {loading && <p>Loading…</p>}
      {stats && (
        <div
          style={{
            marginTop: "12px",
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <Stat label="Total points" value={String(stats.total_points)} />
          <Stat label="Puzzles played" value={String(stats.puzzles_played)} />
          <Stat label="Average time" value={formatSeconds(stats.average_seconds)} />
          <Stat label="Best time" value={formatSeconds(stats.best_seconds)} />
          <Stat label="Last puzzle" value={stats.last_puzzle_date || "—"} />
          <Stat label="Best weekday" value={stats.best_day_of_week || "—"} />
        </div>
      )}
      {weekdayAverages.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Average by weekday</h3>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Average</th>
              </tr>
            </thead>
            <tbody>
              {weekdayAverages.map(([day, avg]) => (
                <tr key={day}>
                  <td>{day}</td>
                  <td>{formatSeconds(Math.round(avg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function weekdayOrder(day: string) {
  const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const idx = order.indexOf(day);
  return idx === -1 ? 7 : idx;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <p className="muted">{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
