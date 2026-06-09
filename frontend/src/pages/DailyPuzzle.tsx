import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchTodayPuzzle, saveProgress, startSolve, submitSolve } from "../api";
import type { Clue, CluesData, GridCell, GridData, PuzzlePublic, SolveAttempt, SubmitResult } from "../types";
import CrosswordGrid, { findClueForCell, type CellPosition } from "../components/CrosswordGrid";
import ClueList from "../components/ClueList";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PuzzleType = "mini_5x5" | "medium_10x10";

export default function DailyPuzzle() {
  const { user, token } = useAuth();
  const [puzzleType, setPuzzleType] = useState<PuzzleType>("mini_5x5");
  const [puzzle, setPuzzle] = useState<PuzzlePublic | null>(null);
  const [attempt, setAttempt] = useState<SolveAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Grid state
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [cluesData, setCluesData] = useState<CluesData | null>(null);
  const [userLetters, setUserLetters] = useState<string[][]>([]);
  const [selected, setSelected] = useState<CellPosition | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set());

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latest grid snapshot for the heartbeat, so it doesn't reset on each keystroke.
  const latestStateRef = useRef<{ gridData: GridData | null; userLetters: string[][] }>({
    gridData: null,
    userLetters: [],
  });

  // Load puzzle
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPuzzle(null);
    setAttempt(null);
    setIsComplete(false);
    setSubmitResult(null);
    setErrorCells(new Set());

    fetchTodayPuzzle(token || "", puzzleType)
      .then((resp) => {
        setPuzzle(resp.puzzle);
        setAttempt(resp.attempt ?? null);

        const gd: GridData = JSON.parse(resp.puzzle.grid_data);
        const cd: CluesData = JSON.parse(resp.puzzle.clues_data);
        setGridData(gd);
        setCluesData(cd);

        // Initialize user letters from attempt or empty
        if (resp.attempt?.grid_state) {
          const saved: GridData = JSON.parse(resp.attempt.grid_state);
          setUserLetters(saved.cells.map((row) => row.map((cell) => cell.letter || "")));
        } else {
          setUserLetters(gd.cells.map((row) => row.map(() => "")));
        }

        if (resp.attempt?.is_complete) {
          setIsComplete(true);
        }
        // Resume the display clock from the server's accumulated active time.
        setElapsed(resp.attempt?.seconds ?? 0);

        // Auto-select first non-black cell
        for (let r = 0; r < gd.cells.length; r++) {
          for (let c = 0; c < gd.cells[r].length; c++) {
            if (!gd.cells[r][c].is_black) {
              setSelected({ row: r, col: c });
              return;
            }
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, puzzleType]);

  // Start solve attempt when user begins
  const ensureAttempt = useCallback(async () => {
    if (!token || !puzzle || attempt || isComplete) return;
    try {
      const a = await startSolve(token, puzzle.id);
      setAttempt(a);
    } catch {
      // ignore — already started
    }
  }, [token, puzzle, attempt, isComplete]);

  // Display timer: count only while the page is visible (matches the
  // server's active-time accrual, which pauses when the tab is closed).
  useEffect(() => {
    if (isComplete || !attempt) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        setElapsed((e) => e + 1);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [attempt, isComplete]);

  // Keep the latest grid snapshot in a ref so the heartbeat can read it
  // without re-creating its interval on every keystroke.
  useEffect(() => {
    latestStateRef.current = { gridData, userLetters };
  }, [gridData, userLetters]);

  // Heartbeat: save progress AND accrue active time on the server every ~2s
  // while the page is open. Skipped when hidden so closed time doesn't count.
  // A fixed interval (independent of typing) guarantees regular accrual.
  useEffect(() => {
    if (!token || !puzzle || isComplete) return;
    autoSaveRef.current = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const { gridData: gd, userLetters: ul } = latestStateRef.current;
      if (!gd) return;
      const state: GridData = {
        cells: gd.cells.map((row, r) =>
          row.map((cell, c) => ({ ...cell, letter: ul[r]?.[c] || "" })),
        ),
      };
      saveProgress(token, puzzle.id, JSON.stringify(state)).catch(() => {});
    }, 2000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [token, puzzle, isComplete]);

  // Cell click handler
  const onCellClick = useCallback(
    (row: number, col: number) => {
      if (selected?.row === row && selected?.col === col) {
        setDirection((d) => (d === "across" ? "down" : "across"));
      } else {
        setSelected({ row, col });
      }
      ensureAttempt();
    },
    [selected, ensureAttempt],
  );

  // Letter input
  const onLetterInput = useCallback(
    (row: number, col: number, letter: string) => {
      setUserLetters((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = letter;
        return next;
      });
      setErrorCells(new Set()); // clear errors on input
      ensureAttempt();
    },
    [ensureAttempt],
  );

  const size = puzzle?.size ?? 5;

  // Advance to next cell in current word
  const onAdvance = useCallback(() => {
    if (!selected || !gridData) return;
    const { row, col } = selected;
    if (direction === "across") {
      for (let c = col + 1; c < size; c++) {
        if (!gridData.cells[row][c].is_black) { setSelected({ row, col: c }); return; }
      }
    } else {
      for (let r = row + 1; r < size; r++) {
        if (!gridData.cells[r][col].is_black) { setSelected({ row: r, col }); return; }
      }
    }
  }, [selected, direction, size, gridData]);

  // Retreat to previous cell
  const onRetreat = useCallback(() => {
    if (!selected || !gridData) return;
    const { row, col } = selected;
    if (direction === "across") {
      for (let c = col - 1; c >= 0; c--) {
        if (!gridData.cells[row][c].is_black) { setSelected({ row, col: c }); return; }
      }
    } else {
      for (let r = row - 1; r >= 0; r--) {
        if (!gridData.cells[r][col].is_black) { setSelected({ row: r, col }); return; }
      }
    }
  }, [selected, direction, size, gridData]);

  const onNavigate = useCallback(
    (dRow: number, dCol: number) => {
      if (!selected || !gridData) return;
      let r = selected.row + dRow;
      let c = selected.col + dCol;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        if (!gridData.cells[r][c].is_black) { setSelected({ row: r, col: c }); return; }
        r += dRow;
        c += dCol;
      }
    },
    [selected, size, gridData],
  );

  const onDirectionToggle = useCallback(() => {
    setDirection((d) => (d === "across" ? "down" : "across"));
  }, []);

  // Tab between clues
  const allClues = useMemo(() => {
    if (!cluesData) return [];
    return [
      ...cluesData.across.map((c) => ({ ...c, dir: "across" as const })),
      ...cluesData.down.map((c) => ({ ...c, dir: "down" as const })),
    ];
  }, [cluesData]);

  const onTabClue = useCallback(
    (forward: boolean) => {
      if (!allClues.length || !selected || !gridData || !cluesData) return;
      const currentClue = findClueForCell(cluesData, gridData.cells, size, selected.row, selected.col, direction);
      const currentIdx = allClues.findIndex(
        (c) => c.dir === direction && c.number === currentClue?.number,
      );
      const nextIdx = forward
        ? (currentIdx + 1) % allClues.length
        : (currentIdx - 1 + allClues.length) % allClues.length;
      const next = allClues[nextIdx];
      setDirection(next.dir);
      setSelected({ row: next.row, col: next.col });
    },
    [allClues, selected, direction, gridData, cluesData, size],
  );

  // Clue click handler
  const onClueClick = useCallback((dir: "across" | "down", clue: Clue) => {
    setDirection(dir);
    setSelected({ row: clue.row, col: clue.col });
  }, []);

  // Active clue for highlighting in ClueList
  const activeClue = useMemo(() => {
    if (!selected || !gridData || !cluesData) return null;
    const clue = findClueForCell(cluesData, gridData.cells, size, selected.row, selected.col, direction);
    return clue ? { direction, number: clue.number } : null;
  }, [selected, direction, gridData, cluesData, size]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!token || !puzzle || !gridData) return;
    const state: GridData = {
      cells: gridData.cells.map((row, r) =>
        row.map((cell, c) => ({ ...cell, letter: userLetters[r]?.[c] || "" })),
      ),
    };
    try {
      const result = await submitSolve(token, puzzle.id, JSON.stringify(state));
      setSubmitResult(result);
      if (result.correct) {
        setIsComplete(true);
        if (result.seconds != null) setElapsed(result.seconds);
      } else if (result.errors) {
        setErrorCells(new Set(result.errors.map((e) => `${e.row},${e.col}`)));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [token, puzzle, gridData, userLetters]);

  // Render
  if (!user) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>Sign in to play</h2>
        <p className="muted">Log in with Google to start solving today's crossword.</p>
      </div>
    );
  }

  if (loading) return <p className="muted">Loading puzzle...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!puzzle || !gridData || !cluesData) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>No puzzle today</h2>
        <p className="muted">Check back later — today's {puzzleType === "mini_5x5" ? "Mini" : "Medium"} puzzle hasn't been published yet.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Puzzle type tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["mini_5x5", "medium_10x10"] as PuzzleType[]).map((t) => (
          <button
            key={t}
            onClick={() => setPuzzleType(t)}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              background: puzzleType === t ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#f3f4f6",
              color: puzzleType === t ? "white" : "#374151",
            }}
          >
            {t === "mini_5x5" ? "Mini (5x5)" : "Medium (10x10)"}
          </button>
        ))}
      </div>

      {/* Header with title and timer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{puzzle.title || "Daily Crossword"}</h2>
          <p className="muted" style={{ margin: 0 }}>{puzzle.puzzle_date}</p>
        </div>
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: isComplete ? "#059669" : "#1f2937",
        }}>
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Completion banner */}
      {isComplete && submitResult?.correct && (
        <div className="card" style={{
          background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
          border: "1px solid #a7f3d0",
          marginBottom: 16,
          textAlign: "center",
        }}>
          <h3 style={{ color: "#059669", margin: "0 0 4px" }}>Puzzle Complete!</h3>
          <p style={{ margin: 0 }}>
            Solved in <strong>{formatTime(submitResult.seconds ?? elapsed)}</strong>
            {submitResult.points != null && <> — earned <strong>{submitResult.points} points</strong></>}
          </p>
        </div>
      )}

      {/* Grid + Clues layout */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <CrosswordGrid
            size={size}
            cells={gridData.cells}
            userLetters={userLetters}
            direction={direction}
            selected={selected}
            errorCells={errorCells.size > 0 ? errorCells : undefined}
            clues={cluesData}
            onCellClick={onCellClick}
            onLetterInput={onLetterInput}
            onDirectionToggle={onDirectionToggle}
            onNavigate={onNavigate}
            onAdvance={onAdvance}
            onRetreat={onRetreat}
            onTabClue={onTabClue}
          />

          {!isComplete && (
            <button
              onClick={handleSubmit}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "12px 24px",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "white",
              }}
            >
              Submit
            </button>
          )}

          {submitResult && !submitResult.correct && (
            <p style={{ color: "crimson", marginTop: 8, fontWeight: 600 }}>
              {submitResult.errors?.length} incorrect cell{submitResult.errors?.length !== 1 ? "s" : ""} — keep trying!
            </p>
          )}
        </div>

        <div style={{ flex: "1 1 250px", minWidth: 200 }}>
          <ClueList
            across={cluesData.across}
            down={cluesData.down}
            activeClue={activeClue}
            onClueClick={onClueClick}
          />
        </div>
      </div>
    </div>
  );
}
