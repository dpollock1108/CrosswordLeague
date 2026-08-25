import type { CluesData, GridCell } from "../types";

// The playable puzzle on the landing page. Deliberately small — the point is
// that a visitor finishes it in about a minute and lands on the sign-up prompt.
//
// '#' is a black square. Every white square is checked (it belongs to both an
// across and a down entry), so there are no unclued cells. The black squares
// are rotationally symmetric, as a real crossword's are.
//
// To swap the puzzle: edit ROWS and CLUES together. The grid, the answers and
// the size are all derived from ROWS, so those can't fall out of sync — but the
// row/col on each clue is hand-written and must still point at the first cell
// of its entry.
const ROWS = [
  "TOP##",
  "RIOT#",
  "INTEL",
  "#KING",
  "##TSA",
] as const;

const BLACK = "#";

export const DEMO_SIZE = ROWS.length;

export const DEMO_CELLS: GridCell[][] = ROWS.map((row) =>
  row.split("").map((ch) => ({ letter: "", is_black: ch === BLACK })),
);

/** Answers, kept client-side. This puzzle isn't scored, so nothing is at risk. */
export const DEMO_ANSWERS: string[][] = ROWS.map((row) =>
  row.split("").map((ch) => (ch === BLACK ? "" : ch)),
);

export const DEMO_CLUES: CluesData = {
  across: [
    { number: 1, clue: "The upside", row: 0, col: 0, length: 3 },
    { number: 4, clue: "An unrowdy crowd may become one", row: 1, col: 0, length: 4 },
    { number: 6, clue: "Chip-making giant", row: 2, col: 0, length: 5 },
    { number: 8, clue: "He's worth 10 in blackjack", row: 3, col: 1, length: 4 },
    { number: 9, clue: "US travel org", row: 4, col: 2, length: 3 },
  ],
  down: [
    { number: 1, clue: "Prefix with -archy or -angle", row: 0, col: 0, length: 3 },
    { number: 2, clue: "Sound heard in a barn", row: 0, col: 1, length: 4 },
    { number: 3, clue: "Something you might do to a plant", row: 0, col: 2, length: 5 },
    { number: 5, clue: "Hamiltons", row: 1, col: 3, length: 4 },
    { number: 7, clue: "New York Area airport", row: 2, col: 4, length: 3 },
  ],
};

/** True when every white square matches the answer grid. */
export function isDemoSolved(letters: string[][]): boolean {
  return DEMO_ANSWERS.every((row, r) =>
    row.every((ch, c) => ch === "" || (letters[r]?.[c] || "") === ch),
  );
}
