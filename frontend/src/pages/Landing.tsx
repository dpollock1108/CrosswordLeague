import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Daily crosswords",
    body: "Solve a fresh mini (and medium) crossword right in the browser. Your time is tracked while you play and pauses when you step away.",
  },
  {
    title: "Private leagues",
    body: "Spin up a league for your friends, share an invite code, and compete on a leaderboard that's just your group.",
  },
  {
    title: "Custom scoring",
    body: "League runners set their own time-to-points thresholds, so your crew plays by your rules.",
  },
];

export default function Landing() {
  const { login } = useAuth();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
        background: "linear-gradient(160deg, #eff6ff 0%, #f8fafc 60%)",
      }}
    >
      <div style={{ maxWidth: 760, width: "100%", textAlign: "center" }}>
        <p style={{ textTransform: "uppercase", letterSpacing: 2, fontSize: 13, color: "#2563eb", fontWeight: 700, margin: 0 }}>
          Boys and Girls
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: "8px 0 12px" }}>Crossword League</h1>
        <p style={{ fontSize: 18, color: "#475569", margin: "0 auto 28px", maxWidth: 560 }}>
          A home for daily crosswords and friendly competition. Solve the puzzle, climb the leaderboard,
          and run your own league with your friends.
        </p>

        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: 20,
            borderRadius: 16,
            background: "white",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
          }}
        >
          <span style={{ fontWeight: 600, color: "#0f172a" }}>Sign in to start playing</span>
          <GoogleLogin
            onSuccess={(resp) => {
              if (resp.credential) {
                login(resp.credential).catch(console.error);
              }
            }}
            onError={() => console.error("Google login failed")}
            size="large"
            shape="pill"
          />
          <span className="muted" style={{ fontSize: 12 }}>
            We use Google sign-in. You'll pick a handle on your first visit.
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            marginTop: 40,
            textAlign: "left",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                padding: 18,
                borderRadius: 12,
                background: "white",
                border: "1px solid #e5e7eb",
              }}
            >
              <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>{f.title}</h3>
              <p style={{ margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.45 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
