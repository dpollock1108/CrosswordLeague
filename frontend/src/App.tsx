import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "./contexts/AuthContext";
import HandleSetup from "./components/HandleSetup";
import ResultsDashboard from "./pages/ResultsDashboard";
import NytTracker from "./pages/NytTracker";
import ScoringPage from "./pages/ScoringPage";
import DailyPuzzle from "./pages/DailyPuzzle";
import PuzzleBuilder from "./pages/PuzzleBuilder";
import Profile from "./pages/Profile";
import Leagues from "./pages/Leagues";
import LeagueDetail from "./pages/LeagueDetail";

function Nav() {
  const location = useLocation();
  const { user } = useAuth();

  const links = [
    { to: "/play", label: "Play" },
    { to: "/", label: "Leaderboard" },
    { to: "/scoring", label: "Scoring" },
  ];

  if (user) {
    links.push({ to: "/leagues", label: "Leagues" });
    links.push({ to: "/profile", label: "My Profile" });
  }

  // Only show admin links to admins
  if (user?.is_admin) {
    links.push({ to: "/builder", label: "Puzzle Builder" });
    links.push({ to: "/nyt-tracker", label: "NYT Tracker" });
  }

  return (
    <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {links.map((link) => {
        const active = location.pathname === link.to || (link.to !== "/" && location.pathname.startsWith(link.to));
        return (
          <Link
            key={link.to}
            to={link.to}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              textDecoration: "none",
              color: active ? "#0f172a" : "#374151",
              background: active ? "rgba(37,99,235,0.12)" : "transparent",
              fontWeight: 600,
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user, loading, login, logout } = useAuth();

  if (loading) return null;

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt=""
            style={{ width: 32, height: 32, borderRadius: "50%" }}
          />
        )}
        <span style={{ fontWeight: 600, fontSize: 14 }}>{user.display_name}</span>
        <button
          onClick={logout}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <GoogleLogin
      onSuccess={(resp) => {
        if (resp.credential) {
          login(resp.credential).catch(console.error);
        }
      }}
      onError={() => console.error("Google login failed")}
      size="medium"
      shape="pill"
    />
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // Logged-in user without a handle → force onboarding
  if (!loading && user && !user.handle) {
    return <HandleSetup />;
  }

  return (
    <BrowserRouter>
      <header>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p className="muted">Boys and Girls</p>
            <h1>Crossword League</h1>
          </div>
          <UserMenu />
        </div>
        <Nav />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ResultsDashboard />} />
          <Route path="/play" element={<DailyPuzzle />} />
          <Route path="/builder" element={<PuzzleBuilder />} />
          <Route path="/nyt-tracker" element={<NytTracker />} />
          <Route path="/scoring" element={<ScoringPage />} />
          <Route path="/leagues" element={<Leagues />} />
          <Route path="/leagues/:id" element={<LeagueDetail />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
