import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  approveLeagueRequest,
  denyLeagueRequest,
  fetchLeague,
  fetchLeagueLeaderboard,
  leaveLeague,
  updateLeagueVisibility,
} from "../api";
import type { LeaderboardResponse, LeagueDetail as LeagueDetailType } from "../types";
import ScoringConfigEditor from "../components/ScoringConfigEditor";

function formatSeconds(s?: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
}

export default function LeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const leagueId = Number(id);
  const { token } = useAuth();
  const navigate = useNavigate();

  const [league, setLeague] = useState<LeagueDetailType | null>(null);
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!token || !leagueId) return;
    setLoading(true);
    try {
      const [l, b] = await Promise.all([
        fetchLeague(token, leagueId),
        fetchLeagueLeaderboard(token, leagueId),
      ]);
      setLeague(l);
      setBoard(b);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load league");
    } finally {
      setLoading(false);
    }
  }, [token, leagueId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = () => {
    if (!league) return;
    navigator.clipboard?.writeText(league.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleLeave = async () => {
    if (!token || !league) return;
    if (!confirm(`Leave "${league.name}"?`)) return;
    try {
      await leaveLeague(token, league.id);
      navigate("/leagues");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave league");
    }
  };

  const handleToggleVisibility = async () => {
    if (!token || !league) return;
    const next = league.visibility === "public" ? "private" : "public";
    try {
      await updateLeagueVisibility(token, league.id, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update visibility");
    }
  };

  const handleApprove = async (userId: number) => {
    if (!token || !league) return;
    try {
      await approveLeagueRequest(token, league.id, userId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve request");
    }
  };

  const handleDeny = async (userId: number) => {
    if (!token || !league) return;
    try {
      await denyLeagueRequest(token, league.id, userId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deny request");
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (error) {
    return (
      <div>
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>{error}</div>
        <button onClick={() => navigate("/leagues")} style={{ marginTop: 12 }}>← Back to leagues</button>
      </div>
    );
  }
  if (!league || !board) return null;

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
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: 13, color: "#991b1b" }}
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
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 14 }}>Visibility:</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "2px 10px",
              borderRadius: 999,
              background: league.visibility === "private" ? "#fef3c7" : "#dcfce7",
              color: league.visibility === "private" ? "#92400e" : "#166534",
            }}
          >
            {league.visibility === "private" ? "Private — approval required" : "Public — open to anyone with the code"}
          </span>
          {league.role === "admin" && (
            <button
              onClick={handleToggleVisibility}
              style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#0f172a", cursor: "pointer", fontSize: 13 }}
            >
              Make {league.visibility === "private" ? "public" : "private"}
            </button>
          )}
        </div>
      </div>

      {league.role === "admin" && league.pending_requests.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Pending requests ({league.pending_requests.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {league.pending_requests.map((r) => (
              <div
                key={r.user_id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb" }}
              >
                <span>{r.handle || r.display_name}</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleApprove(r.user_id)}
                    style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", cursor: "pointer", fontSize: 13 }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(r.user_id)}
                    style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#991b1b", cursor: "pointer", fontSize: 13 }}
                  >
                    Deny
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ marginBottom: 8 }}>Leaderboard</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {board.start_date} → {board.end_date}
        </p>
        {board.entries.length === 0 ? (
          <p className="muted">No results yet in this window.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ padding: "8px 6px" }}>#</th>
                <th style={{ padding: "8px 6px" }}>Player</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Points</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Played</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Avg</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Best</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((e, i) => (
                <tr key={e.player_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "8px 6px" }}>{e.handle || e.name}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{e.total_points}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{e.puzzles_played}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{formatSeconds(e.average_seconds)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{formatSeconds(e.best_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Members ({league.members.length})</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {league.members.map((m) => (
            <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <span>
                {m.handle || m.display_name}
                {m.player_id == null && (
                  <span className="muted" style={{ fontSize: 12 }}> · no results linked</span>
                )}
              </span>
              {m.role === "admin" && <span className="muted" style={{ fontSize: 13 }}>admin</span>}
            </div>
          ))}
        </div>
      </div>

      {league.role === "admin" && token && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Scoring (admin)</h3>
          <ScoringConfigEditor leagueId={league.id} token={token} />
        </div>
      )}
    </div>
  );
}
