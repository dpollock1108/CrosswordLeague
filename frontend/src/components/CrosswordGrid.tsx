import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { Clue, CluesData, GridCell } from "../types";

export interface CellPosition {
  row: number;
  col: number;
}

interface CrosswordGridProps {
  size: number;
  cells: GridCell[][];
  userLetters: string[][]; // user's entered letters
  direction: "across" | "down";
  selected: CellPosition | null;
  errorCells?: Set<string>; // "row,col" strings
  active?: boolean; // when false, input is disabled (puzzle not started)
  clues: CluesData;
  onCellClick: (row: number, col: number) => void;
  onLetterInput: (row: number, col: number, letter: string) => void;
  onDirectionToggle: () => void;
  onNavigate: (dRow: number, dCol: number) => void;
  onAdvance: () => void;
  onRetreat: () => void;
  onTabClue: (forward: boolean) => void;
}

// Biggest cell we'll ever draw. Below this the grid is fluid: it fills the
// width it is given and the cells shrink with it, so a 9x9 still fits on a
// 360px phone.
function maxCellSize(size: number): number {
  return size <= 5 ? 64 : 44;
}

// Widest the grid box is ever drawn, so sibling UI (e.g. the current-clue
// banner) can line up with it. Mirrors the styles below: 1px gaps between
// cells and a 2px border on each side.
export function gridMaxWidth(size: number): number {
  return size * maxCellSize(size) + (size - 1) + 4;
}

// Compute clue numbers for cells (standard crossword numbering)
function computeCellNumbers(cells: GridCell[][], size: number): Map<string, number> {
  const numbers = new Map<string, number>();
  let num = 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c].is_black) continue;
      const startsAcross = (c === 0 || cells[r][c - 1].is_black) && c + 1 < size && !cells[r][c + 1]?.is_black;
      const startsDown = (r === 0 || cells[r - 1][c].is_black) && r + 1 < size && !cells[r + 1]?.[c]?.is_black;
      if (startsAcross || startsDown) {
        numbers.set(`${r},${c}`, num++);
      }
    }
  }
  return numbers;
}

// Get cells belonging to the current word
export function getWordCells(
  cells: GridCell[][],
  size: number,
  row: number,
  col: number,
  direction: "across" | "down",
): CellPosition[] {
  const positions: CellPosition[] = [];
  if (cells[row][col].is_black) return positions;

  if (direction === "across") {
    let startCol = col;
    while (startCol > 0 && !cells[row][startCol - 1].is_black) startCol--;
    let c = startCol;
    while (c < size && !cells[row][c].is_black) {
      positions.push({ row, col: c });
      c++;
    }
  } else {
    let startRow = row;
    while (startRow > 0 && !cells[startRow - 1][col].is_black) startRow--;
    let r = startRow;
    while (r < size && !cells[r][col].is_black) {
      positions.push({ row: r, col });
      r++;
    }
  }
  return positions;
}

export default function CrosswordGrid({
  size,
  cells,
  userLetters,
  direction,
  selected,
  errorCells,
  active = true,
  clues,
  onCellClick,
  onLetterInput,
  onDirectionToggle,
  onNavigate,
  onAdvance,
  onRetreat,
  onTabClue,
}: CrosswordGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const cellNumbers = computeCellNumbers(cells, size);

  // Compute highlighted word cells
  const wordCells = new Set<string>();
  if (selected && !cells[selected.row][selected.col].is_black) {
    for (const pos of getWordCells(cells, size, selected.row, selected.col, direction)) {
      wordCells.add(`${pos.row},${pos.col}`);
    }
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!selected || !active) return;

      if (e.key === "Tab") {
        e.preventDefault();
        onTabClue(!e.shiftKey);
        return;
      }

      if (e.key === "ArrowUp") { e.preventDefault(); onNavigate(-1, 0); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); onNavigate(1, 0); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); onNavigate(0, -1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); onNavigate(0, 1); return; }

      if (e.key === " ") { e.preventDefault(); onDirectionToggle(); return; }

      if (e.key === "Backspace") {
        e.preventDefault();
        onLetterInput(selected.row, selected.col, "");
        onRetreat();
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        onLetterInput(selected.row, selected.col, "");
        return;
      }

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        onLetterInput(selected.row, selected.col, e.key.toUpperCase());
        onAdvance();
      }
    },
    [selected, active, onNavigate, onDirectionToggle, onLetterInput, onAdvance, onRetreat, onTabClue],
  );

  useEffect(() => {
    const el = gridRef.current;
    if (el) {
      el.addEventListener("keydown", handleKeyDown);
      return () => el.removeEventListener("keydown", handleKeyDown);
    }
  }, [handleKeyDown]);

  // Focus the grid when selected changes (only while playable).
  // preventScroll matters on phones: the grid is tall relative to the viewport
  // and a plain focus() yanks the page around after every letter.
  useEffect(() => {
    if (active && selected && gridRef.current) {
      gridRef.current.focus({ preventScroll: true });
    }
  }, [selected, active]);

  // Text scales with the grid instead of the viewport: the wrapper below is a
  // size container, so 1cqw is 1% of the grid's own width and each cell is
  // ~(100/size)cqw wide. The px caps keep the desktop rendering identical to
  // the old fixed-size grid.
  //
  // The same px values also feed --xw-letter / --xw-num, which the .xw-letter
  // and .xw-num rules in styles.css read. Browsers without container query
  // units (Safari < 16) can't parse the inline min() and drop it, so the class
  // rule shows through — cells keep their full-size text instead of falling
  // back to the inherited 16px. The layout itself needs no fallback: it is
  // 1fr columns plus aspect-ratio, both far older than container queries.
  const letterPx = size <= 5 ? 24 : 18;
  const numberPx = size <= 5 ? 11 : 9;
  const fontSize = `min(${(40 / size).toFixed(2)}cqw, ${letterPx}px)`;
  const numberSize = `min(${(20 / size).toFixed(2)}cqw, ${numberPx}px)`;

  return (
    <div
      style={{
        containerType: "inline-size",
        width: "100%",
        maxWidth: gridMaxWidth(size),
        "--xw-letter": `${letterPx}px`,
        "--xw-num": `${numberPx}px`,
      } as CSSProperties}
    >
      <div
        ref={gridRef}
        tabIndex={0}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: 1,
          background: "#1f2937",
          border: "2px solid #1f2937",
          borderRadius: 4,
          outline: "none",
          // Kill the double-tap-to-zoom delay so taps register immediately.
          touchAction: "manipulation",
        }}
      >
        {cells.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const isSelected = selected?.row === r && selected?.col === c;
            const isWordHighlight = wordCells.has(key);
            const isError = errorCells?.has(key);
            const number = cellNumbers.get(key);

            let bg = "white";
            if (cell.is_black) bg = "#1f2937";
            else if (isError) bg = "#fecaca";
            else if (isSelected) bg = "#93c5fd";
            else if (isWordHighlight) bg = "#dbeafe";

            return (
              <div
                key={key}
                onClick={() => active && !cell.is_black && onCellClick(r, c)}
                style={{
                  aspectRatio: "1 / 1",
                  background: bg,
                  position: "relative",
                  cursor: cell.is_black ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {number && (
                  <span
                    className="xw-num"
                    style={{
                      position: "absolute",
                      top: "4%",
                      left: "6%",
                      fontSize: numberSize,
                      fontWeight: 600,
                      color: "#374151",
                      lineHeight: 1,
                    }}
                  >
                    {number}
                  </span>
                )}
                {!cell.is_black && (
                  <span className="xw-letter" style={{ fontSize, fontWeight: 600, color: "#111827" }}>
                    {userLetters[r]?.[c] || ""}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// Utility: find which clue a cell belongs to
export function findClueForCell(
  clues: CluesData,
  cells: GridCell[][],
  size: number,
  row: number,
  col: number,
  direction: "across" | "down",
): Clue | null {
  const wordPositions = getWordCells(cells, size, row, col, direction);
  if (wordPositions.length === 0) return null;
  const startPos = wordPositions[0];

  const clueList = direction === "across" ? clues.across : clues.down;
  return clueList.find((c) => c.row === startPos.row && c.col === startPos.col) ?? null;
}
