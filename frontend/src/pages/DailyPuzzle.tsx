import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchPuzzle, fetchPuzzleArchive, fetchTodayPuzzle, saveProgress, startSolve, submitSolve } from "../api";
import type {
  Clue, CluesData, GridCell, GridData, PuzzleArchiveResponse, PuzzlePublic, SolveAttempt, SubmitResult,
} from "../types";
import CrosswordGrid, {
  findClueForCell, getWordCells, gridPixelWidth, type CellPosition,
} from "../components/CrosswordGrid";
import ClueList from "../components/ClueList";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PuzzleType = "mini_5x5" | "medium_9x9";

// True when every non-black cell has a letter.
function isGridFull(cells: GridCell[][], letters: string[][]): boolean {
  return cells.every((row, r) => row.every((cell, c) => cell.is_black || (letters[r]?.[c] || "") !== ""));
}

function firstEmptyInClue(
  letters: string[][], cells: GridCell[][], size: number, clue: Clue, dir: "across" | "down",
): CellPosition | null {
  for (const p of getWordCells(cells, size, clue.row, clue.col, dir)) {
    if (!(letters[p.row]?.[p.col])) return p;
  }
  return null;
}

// Decide where to move after typing a letter: next empty cell in the current
// word, else the first empty cell of the next unfilled clue (across then down,
// wrapping). Returns null when the whole puzzle is filled.
function nextSelection(
  letters: string[][], cells: GridCell[][], clues: CluesData, size: number,
  sel: CellPosition, dir: "across" | "down",
): { pos: CellPosition; dir: "across" | "down" } | null {
  const word = getWordCells(cells, size, sel.row, sel.col, dir);
  const idx = word.findIndex((p) => p.row === sel.row && p.col === sel.col);
  for (let i = idx + 1; i < word.length; i++) {
    if (!(letters[word[i].row]?.[word[i].col])) return { pos: word[i], dir };
  }
  // No empty cell after the cursor in this word; if the word still has an empty
  // cell earlier, go there; otherwise the word is complete -> next clue.
  for (const p of word) {
    if (!(letters[p.row]?.[p.col])) return { pos: p, dir };
  }
  const ordered = [
    ...clues.across.map((c) => ({ c, dir: "across" as const })),
    ...clues.down.map((c) => ({ c, dir: "down" as const })),
  ];
  const start = word[0];
  const curIdx = ordered.findIndex((o) => o.dir === dir && o.c.row === start.row && o.c.col === start.col);
  for (let k = 1; k <= ordered.length; k++) {
    const o = ordered[((curIdx >= 0 ? curIdx : 0) + k) % ordered.length];
    const empty = firstEmptyInClue(letters, cells, size, o.c, o.dir);
    if (empty) return { pos: empty, dir: o.dir };
  }
  return null;
}

export default function DailyPuzzle() {
  const { user, token } = useAuth();
  const [puzzleType, setPuzzleType] = useState<PuzzleType>("mini_5x5");
  // null = today's puzzle; otherwise a specific puzzle id (catch-up / view).
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [archive, setArchive] = useState<PuzzleArchiveResponse | null>(null);
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

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [incorrect, setIncorrect] = useState(false); // last auto-submit was wrong (no detail revealed)
  const [starting, setStarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Canonical, always-fresh copy of the letters for synchronous reads (advance).
  const lettersRef = useRef<string[][]>([]);
  const submittingRef = useRef(false);

  const started = attempt != null;
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
    setIncorrect(false);

    const fetchP = selectedId != null
      ? fetchPuzzle(token || "", selectedId)
      : fetchTodayPuzzle(token || "", puzzleType);
    fetchP
      .then((resp) => {
        setPuzzle(resp.puzzle);
        setAttempt(resp.attempt ?? null);

        const gd: GridData = JSON.parse(resp.puzzle.grid_data);
        const cd: CluesData = JSON.parse(resp.puzzle.clues_data);
        setGridData(gd);
        setCluesData(cd);

        // Initialize user letters from attempt or empty
        let initial: string[][];
        if (resp.attempt?.grid_state) {
          const saved: GridData = JSON.parse(resp.attempt.grid_state);
          initial = saved.cells.map((row) => row.map((cell) => cell.letter || ""));
        } else {
          initial = gd.cells.map((row) => row.map(() => ""));
        }
        setUserLetters(initial);
        lettersRef.current = initial;

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
  }, [token, puzzleType, selectedId]);

  // Load the weekly catch-up list + the user's all-time completed history.
  const loadArchive = useCallback(() => {
    if (!token) return;
    fetchPuzzleArchive(token, puzzleType).then(setArchive).catch(() => {});
  }, [token, puzzleType]);

  useEffect(() => { loadArchive(); }, [loadArchive]);
  // Refresh statuses after a puzzle is completed.
  useEffect(() => { if (isComplete) loadArchive(); }, [isComplete, loadArchive]);

  // Explicit Play: start the attempt (and the server clock) on demand.
  const handlePlay = useCallback(async () => {
    if (!token || !puzzle || attempt || isComplete || starting) return;
    setStarting(true);
    try {
      const a = await startSolve(token, puzzle.id);
      setAttempt(a);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }, [token, puzzle, attempt, isComplete, starting]);

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
    if (!token || !puzzle || isComplete || !attempt) return;
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
  }, [token, puzzle, isComplete, attempt]);

  // Cell click handler
  const onCellClick = useCallback(
    (row: number, col: number) => {
      if (selected?.row === row && selected?.col === col) {
        setDirection((d) => (d === "across" ? "down" : "across"));
      } else {
        setSelected({ row, col });
      }
    },
    [selected],
  );

  // Letter input — keep lettersRef in sync synchronously so onAdvance (called
  // right after) and the auto-submit effect see the latest grid.
  const onLetterInput = useCallback(
    (row: number, col: number, letter: string) => {
      const base = lettersRef.current.length ? lettersRef.current : userLetters;
      const next = base.map((r) => [...r]);
      next[row][col] = letter;
      lettersRef.current = next;
      setUserLetters(next);
      if (incorrect) setIncorrect(false); // clear stale "wrong" notice on edit
    },
    [userLetters, incorrect],
  );

  const size = puzzle?.size ?? 5;

  // Advance: next empty cell in the word, else first empty of the next clue.
  const onAdvance = useCallback(() => {
    if (!selected || !gridData || !cluesData) return;
    const target = nextSelection(lettersRef.current, gridData.cells, cluesData, size, selected, direction);
    if (target) {
      if (target.dir !== direction) setDirection(target.dir);
      setSelected(target.pos);
    }
  }, [selected, direction, size, gridData, cluesData]);

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

  // Tab moves to the next clue that still has an empty square, landing on that
  // clue's first empty square rather than its first square. Scanning starts one
  // past the current clue and wraps all the way around, so the current clue is
  // considered last — if it is the only unfinished one you stay in it, on its
  // first gap. When nothing is unfinished (grid full) it degrades to plain
  // next-clue movement so a solved grid is still navigable.
  const onTabClue = useCallback(
    (forward: boolean) => {
      if (!allClues.length || !selected || !gridData || !cluesData) return;
      const currentClue = findClueForCell(cluesData, gridData.cells, size, selected.row, selected.col, direction);
      const currentIdx = allClues.findIndex(
        (c) => c.dir === direction && c.number === currentClue?.number,
      );
      const from = currentIdx >= 0 ? currentIdx : 0;
      const step = forward ? 1 : -1;
      const n = allClues.length;
      // JS % keeps the sign of the dividend, so normalize for backward steps.
      const at = (k: number) => allClues[(((from + step * k) % n) + n) % n];
      const letters = lettersRef.current;

      for (let k = 1; k <= n; k++) {
        const c = at(k);
        const empty = firstEmptyInClue(letters, gridData.cells, size, c, c.dir);
        if (empty) {
          setDirection(c.dir);
          setSelected(empty);
          return;
        }
      }

      const next = at(1);
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

  // The clue the cursor is currently in — drives both the ClueList highlight
  // and the banner above the grid, so the two can never disagree.
  const activeClue = useMemo(() => {
    if (!selected || !gridData || !cluesData) return null;
    const clue = findClueForCell(cluesData, gridData.cells, size, selected.row, selected.col, direction);
    return clue ? { direction, number: clue.number, text: clue.clue } : null;
  }, [selected, direction, gridData, cluesData, size]);

  // Auto-submit: whenever the grid is completely filled (and on every change
  // while it stays full), submit for server validation — no Submit button.
  useEffect(() => {
    if (!token || !puzzle || !gridData || !attempt || isComplete) return;
    if (!isGridFull(gridData.cells, userLetters)) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    const state: GridData = {
      cells: gridData.cells.map((row, r) =>
        row.map((cell, c) => ({ ...cell, letter: userLetters[r]?.[c] || "" })),
      ),
    };
    submitSolve(token, puzzle.id, JSON.stringify(state))
      .then((result) => {
        setSubmitResult(result);
        if (result.correct) {
          setIsComplete(true);
          setIncorrect(false);
          if (result.seconds != null) setElapsed(result.seconds);
        } else {
          setIncorrect(true); // notify, but never reveal which cells
        }
      })
      .catch(() => {})
      .finally(() => { submittingRef.current = false; });
  }, [userLetters, attempt, isComplete, gridData, token, puzzle]);

  // Render
  if (!user) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>Sign in to play</h2>
        <p className="muted">Log in with Google to start solving today's crossword.</p>
      </div>
    );
  }

  const activeId = selectedId ?? puzzle?.id;

  const typeTabs = (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {(["mini_5x5", "medium_9x9"] as PuzzleType[]).map((t) => (
        <button
          key={t}
          onClick={() => { setPuzzleType(t); setSelectedId(null); }}
          style={{
            padding: "8px 16px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 14,
            cursor: "pointer",
            background: puzzleType === t ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#f3f4f6",
            color: puzzleType === t ? "white" : "#374151",
          }}
        >
          {t === "mini_5x5" ? "Mini (5x5)" : "Medium (9x9)"}
        </button>
      ))}
    </div>
  );

  const chipStyle = (isActive: boolean, done: boolean) => ({
    padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    color: "#0f172a",
    border: isActive ? "2px solid #2563eb" : "1px solid #d1d5db",
    background: done ? "#d1fae5" : "white",
  } as const);

  const archiveNav = archive ? (
    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>This week</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <button onClick={() => setSelectedId(null)} style={chipStyle(selectedId == null, false)}>Today</button>
          {archive.week.length === 0 && (
            <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>No puzzles yet this week.</span>
          )}
          {archive.week.map((e) => {
            const icon = e.status === "complete" ? "✓ " : e.status === "in_progress" ? "… " : "";
            return (
              <button key={e.id} onClick={() => setSelectedId(e.id)} style={chipStyle(activeId === e.id, e.status === "complete")}>
                {icon}{e.puzzle_date}
              </button>
            );
          })}
        </div>
      </div>
      {archive.completed.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Your completed puzzles ({archive.completed.length})
          </summary>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {archive.completed.map((e) => (
              <button key={e.id} onClick={() => setSelectedId(e.id)} style={chipStyle(activeId === e.id, false)}>
                {e.puzzle_date}{e.seconds != null ? ` · ${formatTime(e.seconds)}` : ""}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  ) : null;

  if (loading) return <div>{typeTabs}{archiveNav}<p className="muted">Loading puzzle...</p></div>;
  if (error) return <div>{typeTabs}{archiveNav}<p style={{ color: "crimson" }}>{error}</p></div>;
  if (!puzzle || !gridData || !cluesData) {
    return (
      <div>
        {typeTabs}
        {archiveNav}
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h2>No puzzle here</h2>
          <p className="muted">
            {selectedId != null
              ? "That puzzle isn't available."
              : `Today's ${puzzleType === "mini_5x5" ? "Mini" : "Medium"} puzzle hasn't been published yet.`}
            {" "}Pick one from this week above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {typeTabs}
      {archiveNav}

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

      {/* Start screen — the puzzle stays hidden until you press Play */}
      {!started && !isComplete ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Ready?</h3>
            <p className="muted" style={{ margin: 0 }}>
              The timer starts when you press Play. The puzzle submits itself the moment every square is filled.
            </p>
          </div>
          <button
            onClick={handlePlay}
            disabled={starting}
            style={{
              padding: "14px 48px",
              borderRadius: 12,
              border: "none",
              fontWeight: 700,
              fontSize: 18,
              cursor: "pointer",
              background: "linear-gradient(135deg, #059669, #10b981)",
              color: "white",
            }}
          >
            {starting ? "Starting…" : "▶ Play"}
          </button>
        </div>
      ) : (
        /* Grid + Clues layout */
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            {/* Current clue, always on screen — the clue list can be scrolled
              * anywhere without losing track of what you're actually solving.
              * Reserves its height so the grid doesn't shift as clues change. */}
            <div
              style={{
                width: gridPixelWidth(size),
                maxWidth: "100%",
                minHeight: 56,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                marginBottom: 10,
                borderRadius: 6,
                background: "#dbeafe",
                color: "#111827",
                fontSize: 15,
                lineHeight: 1.35,
              }}
            >
              {activeClue && (
                <>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: "#1e3a8a" }}>
                    {activeClue.number}
                    {activeClue.direction === "across" ? "A" : "D"}
                  </span>
                  <span>{activeClue.text}</span>
                </>
              )}
            </div>

            <CrosswordGrid
              size={size}
              cells={gridData.cells}
              userLetters={userLetters}
              direction={direction}
              selected={selected}
              active={started && !isComplete}
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
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                The puzzle submits automatically when every square is filled.
              </p>
            )}

            {incorrect && !isComplete && (
              <p style={{ color: "#b91c1c", marginTop: 8, fontWeight: 600 }}>
                Not quite — something's still incorrect. Keep at it!
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
      )}
    </div>
  );
}
