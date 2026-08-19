import type { CluesData, GridCell } from "../types";

// The playable puzzle on the landing page. Deliberately tiny — the point is that
// a visitor finishes it in under a minute and lands on the sign-up prompt.
//
// Every entry is checked (each letter belongs to both an across and a down
// word), so there are no unclued squares. Swap ROWS + CLUES to change it; the
// grid is derived from ROWS, so they can't fall out of sync.
const ROWS = ["CARD", "AREA", "REAR", "DART"] as const;

export const DEMO_SIZE = ROWS.length;

export const DEMO_CELLS: GridCell[][] = ROWS.map((row) =>
  row.split("").map(() => ({ letter: "", is_black: false })),
);

/** Answers, kept client-side. This puzzle isn't scored, so nothing is at risk. */
export const DEMO_ANSWERS: string[][] = ROWS.map((row) => row.split(""));

// This grid is a symmetric word square, so each down answer repeats an across
// answer. The clues are deliberately written to different senses of the word —
// noun across, verb or second meaning down — so the repeat reads as a wink
// rather than a bug.
export const DEMO_CLUES: CluesData = {
  across: [
    { number: 1, clue: "You swipe it to pay", row: 0, col: 0, length: 4 },
    { number: 5, clue: "Length times width", row: 1, col: 0, length: 4 },
    { number: 6, clue: "The back end", row: 2, col: 0, length: 4 },
    { number: 7, clue: "Pub game projectile", row: 3, col: 0, length: 4 },
  ],
  down: [
    { number: 1, clue: "Birthday mail with a message inside", row: 0, col: 0, length: 4 },
    { number: 2, clue: "Neighborhood or district", row: 0, col: 1, length: 4 },
    { number: 3, clue: "Bring up, as children", row: 0, col: 2, length: 4 },
    { number: 4, clue: "Move suddenly and quickly", row: 0, col: 3, length: 4 },
  ],
};

/** True when every square matches the answer grid. */
export function isDemoSolved(letters: string[][]): boolean {
  return DEMO_ANSWERS.every((row, r) => row.every((ch, c) => (letters[r]?.[c] || "") === ch));
}
