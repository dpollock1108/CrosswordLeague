import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "./contexts/AuthContext";
import HandleSetup from "./components/HandleSetup";
import Landing from "./pages/Landing";
import NytTracker from "./pages/NytTracker";
import DailyPuzzle from "./pages/DailyPuzzle";
import PuzzleBuilder from "./pages/PuzzleBuilder";
import Profile from "./pages/Profile";
import Leagues from "./pages/Leagues";
import LeagueDetail from "./pages/LeagueDetail";
import Privacy from "./pages/Privacy";
import AdminUsers from "./pages/AdminUsers";

function Nav() {
  const location = useLocation();
  const { user } = useAuth();

  // Scoring is configured per league now, so there is no global scoring page —
  // each league's rules live on its own detail page.
  const links = [
    { to: "/leagues", label: "Leagues" },
    { to: "/play", label: "Play" },
  ];

  if (user) {
    links.push({ to: "/profile", label: "My Profile" });
  }

  // Only show admin links to admins
  if (user?.is_admin) {
    links.push({ to: "/admin/users", label: "Users" });
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
              color: active ? "var(--text)" : "var(--text-secondary)",
              background: active ? "rgb(var(--primary-rgb) / 12%)" : "transparent",
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
          className="btn-secondary"
          style={{ padding: "6px 12px", fontSize: 13 }}
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

function Footer() {
  return (
    <footer style={{ padding: "8px 24px 32px", textAlign: "center" }}>
      <Link className="muted" to="/privacy" style={{ fontSize: 13 }}>
        Privacy
      </Link>
    </footer>
  );
}

// Signed-in chrome: header, nav, and whichever page matched.
function Shell() {
  return (
    <>
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
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // Avoid flashing the landing page while the stored session is being validated.
  if (loading) return null;

  // The router wraps everything, signed in or not, so that public pages resolve
  // for visitors who aren't. /privacy in particular has to: Google's OAuth
  // consent screen links to it, and that link is followed by people who have not
  // signed in — by definition, since it's shown before they agree to.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />

        {!user ? (
          // Signed-out visitors get the splash page whatever path they asked for.
          <Route path="*" element={<Landing />} />
        ) : !user.handle ? (
          // Signed in but no handle yet → onboarding, no escaping it.
          <Route path="*" element={<HandleSetup />} />
        ) : (
          <Route element={<Shell />}>
            <Route path="/" element={<Navigate to="/leagues" replace />} />
            <Route path="/play" element={<DailyPuzzle />} />
            <Route path="/builder" element={<PuzzleBuilder />} />
            <Route path="/nyt-tracker" element={<NytTracker />} />
            <Route path="/scoring" element={<Navigate to="/leagues" replace />} />
            <Route path="/leagues" element={<Leagues />} />
            <Route path="/leagues/:id" element={<LeagueDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="*" element={<Navigate to="/leagues" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
