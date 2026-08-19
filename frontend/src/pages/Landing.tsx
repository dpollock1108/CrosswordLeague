import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import CrosswordGrid from "../components/CrosswordGrid";
import ClueList from "../components/ClueList";
import MobileKeyboard from "../components/MobileKeyboard";
import useIsTouch from "../hooks/useIsTouch";
import useCrosswordSolver from "../hooks/useCrosswordSolver";
import { DEMO_CELLS, DEMO_CLUES, DEMO_SIZE, isDemoSolved } from "../lib/demoPuzzle";
import { isGridFull } from "../lib/crossword";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Crosswords, competitively",
    body:
      "A fresh mini every day, solved right in the browser. The clock starts when you press play and stops the moment the grid is filled correctly. Literally - every second counts.",
  },
  {
    title: "Play against your friends",
    body:
      "Everyone solves the same puzzle on the same day. Get assigned points based on your solve time. The faster you go, the more points you earn.",
  },
  {
    title: "Customizable leagues",
    body:
      "Start a league, share the invite, and set your own scoring system. We provide the crosswords, you make the rules.",
  },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SignIn({ size = "medium" }: { size?: "medium" | "large" }) {
  const { login } = useAuth();
  return (
    <GoogleLogin
      onSuccess={(resp) => {
        if (resp.credential) login(resp.credential).catch(console.error);
      }}
      onError={() => console.error("Google login failed")}
      size={size}
      shape="pill"
      text="signup_with"
    />
  );
}

export default function Landing() {
  const isTouch = useIsTouch();
  const solver = useCrosswordSolver({ cells: DEMO_CELLS, clues: DEMO_CLUES, size: DEMO_SIZE });
  const { letters, onCellClick } = solver;

  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);
  const [solved, setSolved] = useState(false);
  // On touch the keyboard docks to the bottom of the screen, which is far too
  // pushy on a page someone is still reading. It appears once they tap the grid.
  const [engaged, setEngaged] = useState(false);
  const signupRef = useRef<HTMLDivElement>(null);

  const full = isGridFull(DEMO_CELLS, letters);
  const wrong = full && !solved;

  // The clock runs from the first letter typed until the grid is right.
  useEffect(() => {
    if (!started || solved) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [started, solved]);

  useEffect(() => {
    if (solved || !isDemoSolved(letters)) return;
    setSolved(true);
    setEngaged(false); // dismiss the keyboard so the prompt below isn't covered
  }, [letters, solved]);

  // Kept separate from the detection above on purpose. Done in one effect, the
  // setSolved call re-runs it, and the cleanup cancels the fallback timer before
  // it can fire — so the scroll silently never happened.
  useEffect(() => {
    if (!solved) return;
    const el = signupRef.current;
    if (!el) return;
    // Scrolled straight from the effect rather than inside requestAnimationFrame,
    // which is paused while a tab is hidden.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // Catches two things: smooth scrolling is a no-op in some engines, and the
    // solved copy is taller than the unsolved copy, so the first scroll aims at
    // a target that then moves. Landing on the prompt is the whole point of
    // finishing, so confirm we got there and jump if not.
    const timer = window.setTimeout(() => {
      if (Math.abs(el.getBoundingClientRect().top) > 4) el.scrollIntoView({ block: "start" });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [solved]);

  const handleLetter = useCallback(
    (row: number, col: number, letter: string) => {
      if (solved) return;
      if (letter) setStarted(true);
      solver.onLetterInput(row, col, letter);
    },
    [solved, solver],
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      setEngaged(true);
      onCellClick(row, col);
    },
    [onCellClick],
  );

  const onKeyLetter = useCallback(
    (letter: string) => {
      if (!solver.selected || solved) return;
      handleLetter(solver.selected.row, solver.selected.col, letter);
      solver.onAdvance();
    },
    [solver, solved, handleLetter],
  );

  const onKeyDelete = useCallback(() => {
    if (!solver.selected || solved) return;
    handleLetter(solver.selected.row, solver.selected.col, "");
    solver.onRetreat();
  }, [solver, solved, handleLetter]);

  const puzzle = (
    <CrosswordGrid
      size={DEMO_SIZE}
      cells={DEMO_CELLS}
      userLetters={letters}
      direction={solver.direction}
      selected={solver.selected}
      active={!solved}
      clues={DEMO_CLUES}
      onCellClick={handleCellClick}
      onLetterInput={handleLetter}
      onDirectionToggle={solver.onDirectionToggle}
      onNavigate={solver.onNavigate}
      onAdvance={solver.onAdvance}
      onRetreat={solver.onRetreat}
      onTabClue={solver.onTabClue}
    />
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(170deg, rgb(var(--primary-rgb) / 7%) 0%, var(--surface-subtle) 55%)" }}>
      {/* Header ------------------------------------------------------------ */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px 24px",
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--primary)" }}>
            Boys and Girls
          </p>
          <strong style={{ fontSize: 20 }}>Crossword League</strong>
        </div>
        <SignIn />
      </header>

      {/* Hero: pitch on the left, playable puzzle on the right -------------- */}
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px 64px" }}>
        <div className="landing-hero">
          <div>
            <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, margin: "0 0 14px" }}>
              A daily crossword,
              <br />
              and someone to beat.
            </h1>
            <p style={{ fontSize: 18, color: "var(--text-secondary)", margin: "0 0 32px", maxWidth: 520 }}>
              Try the one on the right — no account needed. It takes about a minute.
            </p>

            {SECTIONS.map((s) => (
              <div key={s.title} style={{ marginBottom: 24, maxWidth: 520 }}>
                <h2 style={{ fontSize: 19, margin: "0 0 6px" }}>{s.title}</h2>
                <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.55 }}>{s.body}</p>
              </div>
            ))}
          </div>

          <div className="landing-puzzle card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>{solved ? "Solved" : "Try it"}</strong>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 700,
                  fontSize: 20,
                  color: solved ? "var(--success)" : "var(--text-muted)",
                }}
              >
                {formatTime(elapsed)}
              </span>
            </div>

            {/* Reserves its height so the grid doesn't jump as clues change. */}
            <div
              style={{
                minHeight: 48,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                marginBottom: 10,
                borderRadius: 6,
                background: "#dbeafe",
                color: "#111827",
                fontSize: 14,
                lineHeight: 1.35,
              }}
            >
              {solver.activeClue && !solved && (
                <>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: "#1e3a8a" }}>
                    {solver.activeClue.number}
                    {solver.activeClue.direction === "across" ? "A" : "D"}
                  </span>
                  <span>{solver.activeClue.text}</span>
                </>
              )}
              {solved && <span style={{ fontWeight: 600, color: "#1e3a8a" }}>Nice — that's the whole grid.</span>}
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>{puzzle}</div>

            {wrong && (
              <p style={{ color: "#b91c1c", fontWeight: 600, fontSize: 14, margin: "12px 0 0", textAlign: "center" }}>
                Every square is filled, but something's off. Keep at it.
              </p>
            )}

            <div style={{ marginTop: 16 }}>
              <ClueList
                across={DEMO_CLUES.across}
                down={DEMO_CLUES.down}
                activeClue={solver.activeClue}
                onClueClick={(dir, clue) => {
                  setEngaged(true);
                  if (dir !== solver.direction) solver.onDirectionToggle();
                  onCellClick(clue.row, clue.col);
                }}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Sign-up prompt — where a finished puzzle scrolls you --------------- */}
      <section
        ref={signupRef}
        style={{
          // Full height so a finished puzzle can scroll it flush to the top of
          // the viewport — otherwise the browser runs out of page and leaves the
          // prompt half off-screen.
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface)",
          borderTop: "1px solid var(--border-subtle)",
          padding: "56px 24px 72px",
        }}
      >
        <div style={{ maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
          {solved ? (
            <>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--success)" }}>
                Solved in {formatTime(elapsed)}
              </p>
              <h2 style={{ fontSize: 32, lineHeight: 1.15, margin: "10px 0 12px" }}>
                That one didn't count. The next one can.
              </h2>
              <p style={{ margin: "0 0 26px", fontSize: 17, color: "var(--text-secondary)" }}>
                Sign up to save your times and keep the streak going.
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 32, lineHeight: 1.15, margin: "0 0 12px" }}>Save your score</h2>
              <p style={{ margin: "0 0 26px", fontSize: 17, color: "var(--text-secondary)" }}>
                Finish the puzzle above or sign up now!
              </p>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "center" }}>
            <SignIn size="large" />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Google sign-in. You'll pick a handle on your first visit. Free, no subscription.
          </p>
          <p style={{ marginTop: 20 }}>
            <Link className="muted" to="/privacy" style={{ fontSize: 13 }}>
              Privacy
            </Link>
          </p>
        </div>
      </section>

      {/* Touch keyboard, docked once the visitor taps into the grid --------- */}
      {isTouch && engaged && !solved && (
        <div className="play-dock">
          <div className="clue-bar">
            <button type="button" className="clue-nav" aria-label="Previous clue"
              onPointerDown={(e) => { e.preventDefault(); solver.onTabClue(false); }}>
              ‹
            </button>
            <div className="clue-bar-text">
              {solver.activeClue && (
                <>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: "#1e3a8a" }}>
                    {solver.activeClue.number}
                    {solver.activeClue.direction === "across" ? "A" : "D"}
                  </span>
                  <span>{solver.activeClue.text}</span>
                </>
              )}
            </div>
            <button type="button" className="clue-nav" aria-label="Next clue"
              onPointerDown={(e) => { e.preventDefault(); solver.onTabClue(true); }}>
              ›
            </button>
          </div>
          <MobileKeyboard onLetter={onKeyLetter} onDelete={onKeyDelete} />
        </div>
      )}
    </div>
  );
}
