import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  approveLeagueRequest,
  deleteLeague,
  denyLeagueRequest,
  fetchLeague,
  fetchLeagueLeaderboard,
  leaveLeague,
  removeLeagueMember,
  renameLeague,
  updateLeagueVisibility,
} from "../api";
import type { LeaderboardEntry, LeaderboardResponse, LeagueDetail as LeagueDetailType } from "../types";
import ScoringConfigEditor from "../components/ScoringConfigEditor";

type Mode = "week" | "month";
type PuzzleFilter = "all" | "mini" | "medium";

const PUZZLE_TYPE_GROUPS: Record<PuzzleFilter, string[] | undefined> = {
  all: undefined,
  mini: ["nyt_mini", "mini_5x5"],
  medium: ["medium_10x10"],
};

function formatSeconds(s?: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
}

function startOfWeekSunday(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function LeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const leagueId = Number(id);
  const { token } = useAuth();
  const navigate = useNavigate();

  const [league, setLeague] = useState<LeagueDetailType | null>(null);
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [mode, setMode] = useState<Mode>("week");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<PuzzleFilter>("all");
  const [renameValue, setRenameValue] = useState("");

  const { start, end, label } = useMemo(() => {
    const today = new Date();
    if (mode === "week") {
      const s = startOfWeekSunday(today);
      s.setDate(s.getDate() + offset * 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { start: s, end: e, label: `${fmt(s)} → ${fmt(e)}` };
    }
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const e = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start: base, end: e, label: `${fmt(base)} → ${fmt(e)}` };
  }, [mode, offset]);

  const loadLeague = useCallback(async () => {
    if (!token || !leagueId) return;
    try {
      const l = await fetchLeague(token, leagueId);
      setLeague(l);
      setRenameValue(l.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load league");
    } finally {
      setLoading(false);
    }
  }, [token, leagueId]);

  useEffect(() => {
    loadLeague();
  }, [loadLeague]);

  // Leaderboard reacts to the date window and puzzle filter.
  useEffect(() => {
    if (!token || !leagueId) return;
    setBoardLoading(true);
    fetchLeagueLeaderboard(token, leagueId, {
      startDate: fmt(start),
      endDate: fmt(end),
      puzzleTypes: PUZZLE_TYPE_GROUPS[filter],
    })
      .then(setBoard)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load leaderboard"))
      .finally(() => setBoardLoading(false));
  }, [token, leagueId, start, end, filter]);

  const handleCopy = () => {
    if (!league) return;
    navigator.clipboard?.writeText(league.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const guard = async (fn: () => Promise<unknown>, reload = true) => {
    if (!token || !league) return;
    try {
      await fn();
      if (reload) await loadLeague();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const handleLeave = () => {
    if (!league || !confirm(`Leave "${league.name}"?`)) return;
    guard(async () => {
      await leaveLeague(token!, league.id);
      navigate("/leagues");
    }, false);
  };

  const handleToggleVisibility = () =>
    guard(() => updateLeagueVisibility(token!, league!.id, league!.visibility === "public" ? "private" : "public"));

  const handleApprove = (userId: number) => guard(() => approveLeagueRequest(token!, league!.id, userId));
  const handleDeny = (userId: number) => guard(() => denyLeagueRequest(token!, league!.id, userId));
  const handleRemove = (userId: number, name: string) => {
    if (!confirm(`Remove ${name} from the league?`)) return;
    guard(() => removeLeagueMember(token!, league!.id, userId));
  };
  const handleRename = () => {
    if (!renameValue.trim() || renameValue.trim() === league!.name) return;
    guard(() => renameLeague(token!, league!.id, renameValue.trim()));
  };
  const handleDelete = () => {
    if (!league || !confirm(`Delete "${league.name}"? This cannot be undone.`)) return;
    guard(async () => {
      await deleteLeague(token!, league.id);
      navigate("/leagues");
    }, false);
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (error && !league) {
    return (
      <div>
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>{error}</div>
        <button onClick={() => navigate("/leagues")} style={{ marginTop: 12 }}>← Back to leagues</button>
      </div>
    );
  }
  if (!league) return null;

  const isAdmin = league.role === "admin";
  const podium = board?.entries.slice(0, 3) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <button onClick={() => navigate("/leagues")} style={{ marginBottom: 8, background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}>
          ← All leagues
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>{league.name}</h2>
          <button
            onClick={handleLeave}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#991b1b", cursor: "pointer", fontSize: 13 }}
          >
            Leave league
          </button>
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 14 }}>Invite code:</span>
          <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, background: "#f1f5f9", padding: "4px 10px", borderRadius: 8 }}>
            {league.invite_code}
          </code>
          <button onClick={handleCopy} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#0f172a", cursor: "pointer", fontSize: 13 }}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <span
            style={{
              fontSize: 13, fontWeight: 600, padding: "2px 10px", borderRadius: 999,
              background: league.visibility === "private" ? "#fef3c7" : "#dcfce7",
              color: league.visibility === "private" ? "#92400e" : "#166534",
            }}
          >
            {league.visibility === "private" ? "Private" : "Public"}
          </span>
        </div>
      </div>

      {error && league && (
        <div style={{ padding: 10, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{error}</div>
      )}

      {/* Leaderboard dashboard */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Leaderboard</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Segmented options={[["week", "Weekly"], ["month", "Monthly"]]} value={mode} onChange={(v) => { setMode(v as Mode); setOffset(0); }} />
            <Segmented options={[["all", "All"], ["mini", "Mini"], ["medium", "Medium"]]} value={filter} onChange={(v) => setFilter(v as PuzzleFilter)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
          <button onClick={() => setOffset((n) => n - 1)} style={navBtn}>Previous</button>
          <button onClick={() => setOffset(0)} style={navBtn}>Current</button>
          <button onClick={() => setOffset((n) => n + 1)} style={navBtn}>Next</button>
          <span className="muted" style={{ fontSize: 13 }}>{label}</span>
        </div>

        {boardLoading ? (
          <p className="muted">Loading…</p>
        ) : !board || board.entries.length === 0 ? (
          <p className="muted">No results in this window.</p>
        ) : (
          <>
            {podium.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                {podium.map((e, i) => (
                  <div key={e.player_id} style={{
                    flex: "1 1 160px", padding: 12, borderRadius: 12,
                    background: ["#fef9c3", "#f1f5f9", "#fde7d3"][i] ?? "#f8fafc",
                    border: "1px solid #e5e7eb",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>#{i + 1}</div>
                    <div style={{ fontWeight: 700 }}>{e.handle || e.name}</div>
                    <div style={{ fontSize: 13 }}>{e.total_points} pts · avg {formatSeconds(e.average_seconds)}</div>
                  </div>
                ))}
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={th}>#</th><th style={th}>Player</th>
                  <th style={thR}>Points</th><th style={thR}>Played</th>
                  <th style={thR}>Avg</th><th style={thR}>Best</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((e: LeaderboardEntry, i) => (
                  <tr key={e.player_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{i + 1}</td>
                    <td style={td}>{e.handle || e.name}</td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{e.total_points}</td>
                    <td style={tdR}>{e.puzzles_played}</td>
                    <td style={tdR}>{formatSeconds(e.average_seconds)}</td>
                    <td style={tdR}>{formatSeconds(e.best_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Members */}
      <div>
        <h3 style={{ marginBottom: 8 }}>Members ({league.members.length})</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {league.members.map((m) => (
            <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <span>
                {m.handle || m.display_name}
                {m.player_id == null && <span className="muted" style={{ fontSize: 12 }}> · no results linked</span>}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {m.role === "admin" && <span className="muted" style={{ fontSize: 13 }}>admin</span>}
                {isAdmin && m.role !== "admin" && (
                  <button
                    onClick={() => handleRemove(m.user_id, m.handle || m.display_name)}
                    style={{ padding: "2px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#991b1b", fontSize: 12, cursor: "pointer" }}
                  >
                    Remove
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin section */}
      {isAdmin && token && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
          <h3 style={{ margin: 0 }}>Admin</h3>

          {league.pending_requests.length > 0 && (
            <div>
              <h4 style={{ margin: "0 0 8px" }}>Pending requests ({league.pending_requests.length})</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {league.pending_requests.map((r) => (
                  <div key={r.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb" }}>
                    <span>{r.handle || r.display_name}</span>
                    <span style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleApprove(r.user_id)} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", cursor: "pointer", fontSize: 13 }}>Approve</button>
                      <button onClick={() => handleDeny(r.user_id)} style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#991b1b", cursor: "pointer", fontSize: 13 }}>Deny</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 style={{ margin: "0 0 8px" }}>League settings</h4>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={60}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
              />
              <button onClick={handleRename} disabled={!renameValue.trim() || renameValue.trim() === league.name}
                style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer" }}>
                Rename
              </button>
              <button onClick={handleToggleVisibility}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#0f172a", cursor: "pointer", fontSize: 13 }}>
                Make {league.visibility === "private" ? "public" : "private"}
              </button>
            </div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 8px" }}>Scoring</h4>
            <ScoringConfigEditor leagueId={league.id} token={token} />
          </div>

          <div>
            <h4 style={{ margin: "0 0 8px", color: "#991b1b" }}>Danger zone</h4>
            <button onClick={handleDelete}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "white", color: "#991b1b", fontWeight: 600, cursor: "pointer" }}>
              Delete league
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: "8px 6px" } as const;
const thR = { padding: "8px 6px", textAlign: "right" } as const;
const td = { padding: "8px 6px" } as const;
const tdR = { padding: "8px 6px", textAlign: "right" } as const;
const navBtn = { padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#0f172a", fontSize: 13, cursor: "pointer" } as const;

function Segmented({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      {options.map(([val, lbl]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          style={{
            borderRadius: 0, fontSize: 13, padding: "5px 12px",
            background: value === val ? "linear-gradient(135deg, #2563eb, #0ea5e9)" : "#ffffff",
            color: value === val ? "#ffffff" : "#0f172a",
          }}
        >
          {lbl}
        </button>
      ))}
    </div>
  );
}
