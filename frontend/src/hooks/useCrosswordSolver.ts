import { useCallback, useMemo, useRef, useState } from "react";
import { findClueForCell, type CellPosition } from "../components/CrosswordGrid";
import { firstEmptyInClue, firstOpenCell, isGridFull, nextSelection, orderedClues } from "../lib/crossword";
import type { CluesData, GridCell } from "../types";

interface Options {
  cells: GridCell[][];
  clues: CluesData;
  size: number;
}

/**
 * Cursor + letter state for a self-contained crossword: no server, no timer, no
 * saved progress. DailyPuzzle keeps its own copy of this wiring because its
 * letters are entangled with autosave and server submission; both call into the
 * same pure helpers in lib/crossword so the cursor rules can't diverge.
 *
 * Letters are mirrored into a ref so onAdvance — which runs immediately after
 * onLetterInput, before React has re-rendered — sees the letter just typed.
 * Note what this deliberately avoids: calling setState inside another setState
 * updater. React may invoke an updater more than once (StrictMode does exactly
 * that in development), which silently advanced the cursor twice per keystroke.
 */
export function useCrosswordSolver({ cells, clues, size }: Options) {
  const initial = useMemo(() => cells.map((row) => row.map(() => "")), [cells]);
  const [letters, setLetters] = useState<string[][]>(initial);
  const lettersRef = useRef<string[][]>(initial);
  const [selected, setSelected] = useState<CellPosition | null>(() => firstOpenCell(cells));
  const [direction, setDirection] = useState<"across" | "down">("across");

  const complete = useMemo(() => isGridFull(cells, letters), [cells, letters]);

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

  const onDirectionToggle = useCallback(() => {
    setDirection((d) => (d === "across" ? "down" : "across"));
  }, []);

  const onLetterInput = useCallback((row: number, col: number, letter: string) => {
    const next = lettersRef.current.map((r) => [...r]);
    next[row][col] = letter;
    lettersRef.current = next;
    setLetters(next);
  }, []);

  const onAdvance = useCallback(() => {
    if (!selected) return;
    const target = nextSelection(lettersRef.current, cells, clues, size, selected, direction);
    if (!target) return;
    if (target.dir !== direction) setDirection(target.dir);
    setSelected(target.pos);
  }, [selected, direction, cells, clues, size]);

  const onRetreat = useCallback(() => {
    if (!selected) return;
    const { row, col } = selected;
    if (direction === "across") {
      for (let c = col - 1; c >= 0; c--) {
        if (!cells[row][c].is_black) { setSelected({ row, col: c }); return; }
      }
    } else {
      for (let r = row - 1; r >= 0; r--) {
        if (!cells[r][col].is_black) { setSelected({ row: r, col }); return; }
      }
    }
  }, [selected, direction, cells]);

  const onNavigate = useCallback(
    (dRow: number, dCol: number) => {
      if (!selected) return;
      let r = selected.row + dRow;
      let c = selected.col + dCol;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        if (!cells[r][c].is_black) { setSelected({ row: r, col: c }); return; }
        r += dRow;
        c += dCol;
      }
    },
    [selected, cells, size],
  );

  // Move to the next clue that still has a gap, landing on that gap. Falls back
  // to plain next-clue movement once the grid is full, so a solved grid stays
  // navigable.
  const onTabClue = useCallback(
    (forward: boolean) => {
      const all = orderedClues(clues);
      if (!all.length || !selected) return;
      const currentClue = findClueForCell(clues, cells, size, selected.row, selected.col, direction);
      const found = all.findIndex((o) => o.dir === direction && o.c.number === currentClue?.number);
      const from = found >= 0 ? found : 0;
      const n = all.length;
      const step = forward ? 1 : -1;
      const at = (k: number) => all[(((from + step * k) % n) + n) % n];

      for (let k = 1; k <= n; k++) {
        const o = at(k);
        const empty = firstEmptyInClue(lettersRef.current, cells, size, o.c, o.dir);
        if (empty) {
          setDirection(o.dir);
          setSelected(empty);
          return;
        }
      }
      const nextClue = at(1);
      setDirection(nextClue.dir);
      setSelected({ row: nextClue.c.row, col: nextClue.c.col });
    },
    [clues, cells, size, selected, direction],
  );

  const activeClue = useMemo(() => {
    if (!selected) return null;
    const clue = findClueForCell(clues, cells, size, selected.row, selected.col, direction);
    return clue ? { direction, number: clue.number, text: clue.clue } : null;
  }, [selected, direction, cells, clues, size]);

  const reset = useCallback(() => {
    const blank = cells.map((row) => row.map(() => ""));
    lettersRef.current = blank;
    setLetters(blank);
    setSelected(firstOpenCell(cells));
    setDirection("across");
  }, [cells]);

  return {
    letters, selected, direction, activeClue, complete, reset,
    onCellClick, onLetterInput, onDirectionToggle, onNavigate, onAdvance, onRetreat, onTabClue,
  };
}

export default useCrosswordSolver;
