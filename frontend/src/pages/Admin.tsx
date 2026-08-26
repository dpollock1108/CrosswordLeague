import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Sections live here rather than in the top nav so that adding admin tools
// doesn't keep widening the header for everyone. Add a route in App.tsx and an
// entry here; nothing else needs to know.
const SECTIONS: { to: string; label: string }[] = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/builder", label: "Puzzle Builder" },
  { to: "/admin/nyt-tracker", label: "NYT Tracker" },
];

export default function Admin() {
  const { user } = useAuth();
  const location = useLocation();

  // The nav link is already admin-only, but a URL is guessable. The API rejects
  // non-admins regardless — this just avoids a confusing half-rendered page.
  if (!user?.is_admin) {
    return (
      <div className="card">
        <h2>Not available</h2>
        <p className="muted">This area is for site admins.</p>
      </div>
    );
  }

  return (
    <div>
      <nav
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 20,
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: 10,
        }}
      >
        {SECTIONS.map((s) => {
          const active = location.pathname.startsWith(s.to);
          return (
            <Link
              key={s.to}
              to={s.to}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                color: active ? "var(--text)" : "var(--text-secondary)",
                background: active ? "rgb(var(--primary-rgb) / 12%)" : "transparent",
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}

/** Landing on /admin itself goes to the first section. */
export function AdminIndex() {
  return <Navigate to={SECTIONS[0].to} replace />;
}
