import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchAdminUsers } from "../api";
import type { AdminUserRow } from "../types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

// Server timestamps are naive UTC, so an ISO string without a zone is parsed as
// local time by Date. Only the date part is shown, so that's close enough here —
// but it's why this doesn't try to render a time.
function daysAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const th = { padding: "8px 10px", whiteSpace: "nowrap" } as const;
const td = { padding: "8px 10px", verticalAlign: "middle" } as const;

export default function AdminUsers() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setError(null);
    fetchAdminUsers(token)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.email, r.handle, r.display_name, r.player_name].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  // No admin guard here — the /admin layout owns that for every section.

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Registered users</h2>
          <p className="muted" style={{ margin: 0 }}>
            {rows ? `${rows.length} total` : "Loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by email, handle, name"
            style={{ padding: "8px 10px", fontSize: 14, minWidth: 220 }}
          />
          <button className="btn-secondary" onClick={load} style={{ fontSize: 14 }}>Refresh</button>
        </div>
      </div>

      {error && <p style={{ color: "var(--danger-text)", fontWeight: 600 }}>{error}</p>}

      {filtered && filtered.length === 0 && (
        <p className="empty">{query ? "Nobody matches that filter." : "Nobody has signed up yet."}</p>
      )}

      {filtered && filtered.length > 0 && (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>User</th>
                <th style={th}>Handle</th>
                <th style={th}>Player</th>
                <th style={{ ...th, textAlign: "right" }}>Solves</th>
                <th style={{ ...th, textAlign: "right" }}>Leagues</th>
                <th style={th}>Joined</th>
                <th style={th}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {r.avatar_url && (
                        <img src={r.avatar_url} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          {r.display_name}
                          {r.is_admin && <span className="badge" style={{ fontSize: 11 }}>admin</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
                      </div>
                    </div>
                  </td>

                  <td style={td}>
                    {r.handle
                      ? <span style={{ fontWeight: 600 }}>@{r.handle}</span>
                      : <span style={{ color: "var(--danger-text)", fontSize: 13 }}>no handle</span>}
                  </td>

                  {/* The linked Player is where solve history lives. A user with
                    * no player, or one whose handle doesn't match their player's,
                    * is the visible symptom of the legacy-linking bugs. */}
                  <td style={td}>
                    {r.player_id == null ? (
                      <span style={{ color: "var(--danger-text)", fontSize: 13 }}>none</span>
                    ) : (
                      <div style={{ fontSize: 13 }}>
                        <span>#{r.player_id} {r.player_name}</span>
                        {r.player_handle && r.player_handle !== r.handle && (
                          <div style={{ color: "var(--warning-text)", fontSize: 12 }}>
                            player handle @{r.player_handle}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.result_count}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.league_count}</td>
                  <td style={{ ...td, fontSize: 13, whiteSpace: "nowrap" }}>{formatDate(r.created_at)}</td>
                  <td style={{ ...td, fontSize: 13, whiteSpace: "nowrap" }}>
                    {formatDate(r.last_login_at)}
                    <div className="muted" style={{ fontSize: 11 }}>{daysAgo(r.last_login_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
