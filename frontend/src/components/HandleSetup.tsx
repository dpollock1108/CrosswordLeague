import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { updateProfile } from "../api";

/**
 * Full-screen onboarding gate shown after first Google sign-in
 * when the user has no handle yet.
 */
export default function HandleSetup() {
  const { user, token, refreshUser } = useAuth();
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !token) return null;

  const valid = /^[a-zA-Z0-9_]{3,24}$/.test(handle);

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(token, { handle });
      await refreshUser();
    } catch (e: any) {
      let msg = "Something went wrong";
      try {
        const parsed = JSON.parse(e.message);
        msg = parsed.detail || e.message;
      } catch {
        msg = e.message || msg;
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          padding: "40px 32px",
        }}
      >
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt=""
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              marginBottom: 16,
            }}
          />
        )}

        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>
          Welcome, {user.display_name}!
        </h1>
        <p style={{ color: "#6b7280", margin: "0 0 24px", fontSize: 15 }}>
          Pick a handle to get started. This is how other players will see you
          on leaderboards.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "0 auto 8px",
            maxWidth: 280,
          }}
        >
          <span
            style={{
              padding: "10px 10px 10px 14px",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRight: "none",
              borderRadius: "10px 0 0 10px",
              fontSize: 16,
              color: "#6b7280",
              lineHeight: 1,
            }}
          >
            @
          </span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={24}
            placeholder="your_handle"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !saving) handleSubmit();
            }}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "0 10px 10px 0",
              border: "1px solid #d1d5db",
              fontSize: 16,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 20px" }}>
          3–24 characters: letters, numbers, and underscores
        </p>

        <button
          onClick={handleSubmit}
          disabled={!valid || saving}
          style={{
            width: "100%",
            maxWidth: 280,
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 15,
            cursor: !valid || saving ? "default" : "pointer",
            background:
              !valid || saving
                ? "#d1d5db"
                : "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: !valid || saving ? "#9ca3af" : "white",
            transition: "all 0.15s",
          }}
        >
          {saving ? "Saving..." : "Claim Handle"}
        </button>

        {error && (
          <p style={{ color: "crimson", fontWeight: 600, marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
