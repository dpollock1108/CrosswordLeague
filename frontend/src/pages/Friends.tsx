import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchFriends,
  removeFriend,
  sendFriendRequest,
} from "../api";
import type { FriendListResponse } from "../types";

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />;
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "#eef2ff",
        color: "#3730a3",
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const secondaryButton = {
  background: "#e5e7eb",
  color: "#374151",
  padding: "6px 12px",
  fontSize: 13,
} as const;

export default function Friends() {
  const { token, user } = useAuth();
  const [data, setData] = useState<FriendListResponse | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await fetchFriends(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load friends");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<void>, message?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (message) setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !handle.trim()) return;
    const target = handle.trim();
    await run(async () => {
      const res = await sendFriendRequest(token, target);
      setHandle("");
      setNotice(
        res.status === "accepted"
          ? `You and @${res.friend.handle ?? res.friend.display_name} are now friends — they'd already asked!`
          : `Request sent to @${res.friend.handle ?? res.friend.display_name}.`,
      );
    });
  };

  if (!user) return <p className="muted">Sign in to add friends.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>Friends</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Your friends' daily scores and times show up on your question-of-the-day board. Your
          handle is <strong>@{user.handle}</strong> — share it so people can add you.
        </p>
      </div>

      {notice && (
        <div style={{ padding: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 14 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ flex: "1 1 220px" }}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="Add by handle, e.g. @alice"
          maxLength={40}
        />
        <button disabled={busy || !handle.trim()}>Send request</button>
      </form>

      {data && data.incoming.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Requests for you</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.incoming.map((r) => (
              <div
                key={r.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                }}
              >
                <Avatar url={r.avatar_url} name={r.display_name} />
                <span style={{ fontWeight: 600 }}>{r.handle ? `@${r.handle}` : r.display_name}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    disabled={busy}
                    style={{ padding: "6px 12px", fontSize: 13 }}
                    onClick={() => run(() => acceptFriendRequest(token!, r.user_id))}
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    style={secondaryButton}
                    onClick={() => run(() => declineFriendRequest(token!, r.user_id))}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ marginBottom: 8 }}>
          Your friends {data ? `(${data.friends.length})` : ""}
        </h3>
        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.friends.length === 0 ? (
          <p className="muted">No friends yet. Add someone by their handle above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.friends.map((f) => (
              <div
                key={f.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                }}
              >
                <Avatar url={f.avatar_url} name={f.display_name} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{f.handle ? `@${f.handle}` : f.display_name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{f.display_name}</span>
                </div>
                <button
                  disabled={busy}
                  style={{ ...secondaryButton, marginLeft: "auto" }}
                  onClick={() => run(() => removeFriend(token!, f.user_id), "Friend removed.")}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {data && data.outgoing.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Sent requests</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.outgoing.map((r) => (
              <div
                key={r.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  opacity: 0.8,
                }}
              >
                <Avatar url={r.avatar_url} name={r.display_name} />
                <span style={{ fontWeight: 600 }}>{r.handle ? `@${r.handle}` : r.display_name}</span>
                <span className="muted" style={{ fontSize: 13 }}>awaiting reply</span>
                <button
                  disabled={busy}
                  style={{ ...secondaryButton, marginLeft: "auto" }}
                  onClick={() => run(() => cancelFriendRequest(token!, r.user_id), "Request withdrawn.")}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
