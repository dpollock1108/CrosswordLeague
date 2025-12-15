import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import ResultsDashboard from "./pages/ResultsDashboard";
import PlayerProfile from "./pages/PlayerProfile";
import AdminPanel from "./components/AdminPanel";
import ScoringPage from "./pages/ScoringPage";

function Nav() {
  const location = useLocation();
  const links = [
    { to: "/", label: "Results Dashboard" },
    { to: "/players", label: "Player Profile" },
    { to: "/admin", label: "Admin Panel" },
    { to: "/scoring", label: "Scoring" },
  ];
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

export default function App() {
  return (
    <BrowserRouter>
      <header>
        <div>
          <p className="muted">NYT Mini</p>
          <h1>Crossword League</h1>
        </div>
        <Nav />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ResultsDashboard />} />
          <Route path="/players" element={<PlayerProfile />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/scoring" element={<ScoringPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
