import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { createLeague, joinLeague, listLeagues } from "../api";
import type { LeaguePublic } from "../types";

export default function Leagues() {
  const { token, user } = useAuth();
  const [leagues, setLeagues] = useState<LeaguePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("private");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setLeagues(await listLeagues(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leagues");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      await createLeague(token, newName.trim(), newVisibility);
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create league");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteCode.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await joinLeague(token, inviteCode.trim());
      setInviteCode("");
      setNotice(
        result.status === "pending"
          ? `Request sent to "${result.league.name}" — awaiting admin approval.`
          : `Joined "${result.league.name}"!`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join league");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return <p className="muted">Sign in to create and join leagues.</p>;
  }

  const inputStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
  } as const;

  const btnStyle = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>Leagues</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Compete with a private group. League leaderboards score the first-place bonus among members only.
        </p>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 14 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 240px" }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Create a league</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="League name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
            />
            <select
              style={inputStyle}
              value={newVisibility}
              onChange={(e) => setNewVisibility(e.target.value as "public" | "private")}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <button style={btnStyle} disabled={busy || !newName.trim()}>Create</button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {newVisibility === "private"
              ? "Private: people request with the code; you approve them."
              : "Public: anyone with the code joins instantly."}
          </span>
        </form>

        <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 240px" }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Join with an invite code</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1, textTransform: "uppercase" }}
              placeholder="e.g. 7F3KQ9P2"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              maxLength={16}
            />
            <button style={btnStyle} disabled={busy || !inviteCode.trim()}>Join</button>
          </div>
        </form>
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Your leagues</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : leagues.length === 0 ? (
          <p className="muted">You're not in any leagues yet. Create one or join with a code.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {leagues.map((l) => {
              const pending = l.membership_status === "pending";
              const rowStyle = {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                textDecoration: "none",
                color: "#0f172a",
                opacity: pending ? 0.7 : 1,
              } as const;
              const meta = (
                <span className="muted" style={{ fontSize: 13 }}>
                  {l.visibility === "private" ? "Private" : "Public"}
                  {pending
                    ? " · pending approval"
                    : ` · ${l.member_count} member${l.member_count === 1 ? "" : "s"}${l.role === "admin" ? " · admin" : ""}`}
                </span>
              );
              return pending ? (
                <div key={l.id} style={rowStyle}>
                  <span style={{ fontWeight: 600 }}>{l.name}</span>
                  {meta}
                </div>
              ) : (
                <Link key={l.id} to={`/leagues/${l.id}`} style={rowStyle}>
                  <span style={{ fontWeight: 600 }}>{l.name}</span>
                  {meta}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
