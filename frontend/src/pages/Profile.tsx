import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { updateProfile, fetchPlayerStats } from "../api";
import type { PlayerStats } from "../types";

function formatSeconds(s: number | null | undefined): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function Profile() {
  const { user, token, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name);
      setHandle(user.handle || "");
    }
  }, [user]);

  // Load player stats if linked
  useEffect(() => {
    if (user?.player_id) {
      fetchPlayerStats(user.player_id).then(setStats).catch(() => {});
    }
  }, [user?.player_id]);

  if (!user || !token) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>Sign in to view your profile</h2>
        <p className="muted">Log in with Google to set up your profile and track your stats.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    try {
      const updated = await updateProfile(token, {
        display_name: displayName || undefined,
        handle: handle || undefined,
      });
      // Update auth context with fresh user data
      // Re-fetch by triggering a login refresh
      setSaveMsg("Profile updated!");
      setDisplayName(updated.display_name);
      setHandle(updated.handle || "");
      await refreshUser();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      // Try to parse the error detail
      try {
        const parsed = JSON.parse(msg);
        setSaveError(parsed.detail || msg);
      } catch {
        setSaveError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2>Your Profile</h2>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Profile form */}
        <div className="card" style={{ flex: "1 1 320px", maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt=""
                style={{ width: 64, height: 64, borderRadius: "50%" }}
              />
            )}
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{user.display_name}</p>
              {user.handle && (
                <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>@{user.handle}</p>
              )}
              <p style={{ margin: 0, color: "#9ca3af", fontSize: 13 }}>{user.email}</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Display Name
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </label>

            <label style={{ fontSize: 14, fontWeight: 600 }}>
              Handle
              {user.handle ? (
                <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 400, color: "#374151" }}>
                  @{user.handle}
                  <span style={{ display: "block", fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    Handles cannot be changed once set.
                  </span>
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                    <span style={{
                      padding: "8px 8px 8px 12px",
                      background: "#f3f4f6",
                      border: "1px solid #d1d5db",
                      borderRight: "none",
                      borderRadius: "8px 0 0 8px",
                      fontSize: 14,
                      color: "#6b7280",
                    }}>
                      @
                    </span>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                      maxLength={24}
                      placeholder="your_handle"
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: "0 8px 8px 0",
                        border: "1px solid #d1d5db",
                        fontSize: 14,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                    3-24 characters, letters, numbers, and underscores only.
                    <strong> This cannot be changed later.</strong>
                  </p>
                </>
              )}
            </label>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                marginTop: 8,
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: saving ? "default" : "pointer",
                background: saving ? "#9ca3af" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                color: "white",
              }}
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>

            {saveMsg && <p style={{ color: "#059669", fontWeight: 600, margin: "4px 0 0" }}>{saveMsg}</p>}
            {saveError && <p style={{ color: "crimson", fontWeight: 600, margin: "4px 0 0" }}>{saveError}</p>}
          </div>
        </div>

        {/* Stats card */}
        {stats && (
          <div className="card" style={{ flex: "1 1 280px", maxWidth: 360 }}>
            <h3 style={{ marginTop: 0 }}>Your Stats</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Stat label="Total Points" value={String(stats.total_points)} />
              <Stat label="Puzzles Played" value={String(stats.puzzles_played)} />
              <Stat label="Avg Time" value={formatSeconds(stats.average_seconds)} />
              <Stat label="Best Time" value={formatSeconds(stats.best_seconds)} />
              <Stat label="Best Day" value={stats.best_day_of_week || "—"} />
              <Stat label="Last Puzzle" value={stats.last_puzzle_date || "—"} />
            </div>

            {stats.weekday_averages && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                  Weekday Averages
                </h4>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <tbody>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                      .filter((d) => stats.weekday_averages?.[d] != null)
                      .map((day) => (
                        <tr key={day}>
                          <td style={{ padding: "3px 0", color: "#374151" }}>{day}</td>
                          <td style={{ padding: "3px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {formatSeconds(stats.weekday_averages![day])}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700 }}>{value}</p>
    </div>
  );
}
