import { getWordCells, type CellPosition } from "../components/CrosswordGrid";
import type { Clue, CluesData, GridCell } from "../types";

// Grid logic shared by the real solver (DailyPuzzle) and the landing-page demo.
// These are pure functions on purpose: the cursor rules are the fiddly part of a
// crossword, and two copies of them would drift.

/** True when every non-black cell has a letter. */
export function isGridFull(cells: GridCell[][], letters: string[][]): boolean {
  return cells.every((row, r) => row.every((cell, c) => cell.is_black || (letters[r]?.[c] || "") !== ""));
}

/** First cell of `clue` that has no letter yet, or null when it's complete. */
export function firstEmptyInClue(
  letters: string[][], cells: GridCell[][], size: number, clue: Clue, dir: "across" | "down",
): CellPosition | null {
  for (const p of getWordCells(cells, size, clue.row, clue.col, dir)) {
    if (!(letters[p.row]?.[p.col])) return p;
  }
  return null;
}

/** Across clues then down clues, in numbering order — the order Tab walks. */
export function orderedClues(clues: CluesData): { c: Clue; dir: "across" | "down" }[] {
  return [
    ...clues.across.map((c) => ({ c, dir: "across" as const })),
    ...clues.down.map((c) => ({ c, dir: "down" as const })),
  ];
}

// Decide where to move after typing a letter: next empty cell in the current
// word, else the first empty cell of the next unfilled clue (across then down,
// wrapping). Returns null when the whole puzzle is filled.
export function nextSelection(
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
  const ordered = orderedClues(clues);
  const start = word[0];
  const curIdx = ordered.findIndex((o) => o.dir === dir && o.c.row === start.row && o.c.col === start.col);
  for (let k = 1; k <= ordered.length; k++) {
    const o = ordered[((curIdx >= 0 ? curIdx : 0) + k) % ordered.length];
    const empty = firstEmptyInClue(letters, cells, size, o.c, o.dir);
    if (empty) return { pos: empty, dir: o.dir };
  }
  return null;
}

/** The first non-black cell, scanning top-left to bottom-right. */
export function firstOpenCell(cells: GridCell[][]): CellPosition | null {
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c].is_black) return { row: r, col: c };
    }
  }
  return null;
}
