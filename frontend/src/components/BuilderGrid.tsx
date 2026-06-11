import { useCallback, useEffect, useRef, useState } from "react";

export interface BuilderCell {
  letter: string;
  is_black: boolean;
}

interface BuilderGridProps {
  size: number;
  cells: BuilderCell[][];
  selected: { row: number; col: number } | null;
  onCellClick: (row: number, col: number) => void;
  onToggleBlack: (row: number, col: number) => void;
  onLetterInput: (row: number, col: number, letter: string) => void;
  onNavigate: (dRow: number, dCol: number) => void;
}

export default function BuilderGrid({
  size,
  cells,
  selected,
  onCellClick,
  onToggleBlack,
  onLetterInput,
  onNavigate,
}: BuilderGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const toggleDirection = () => setDirection((d) => (d === "across" ? "down" : "across"));

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!selected) return;
      const { row, col } = selected;

      // Arrow keys navigate and set the typing direction to match.
      if (e.key === "ArrowUp") { e.preventDefault(); setDirection("down"); onNavigate(-1, 0); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setDirection("down"); onNavigate(1, 0); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); setDirection("across"); onNavigate(0, -1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); setDirection("across"); onNavigate(0, 1); return; }

      // Space or Tab toggles typing direction (across <-> down).
      if (e.key === " " || e.key === "Tab") {
        e.preventDefault();
        toggleDirection();
        return;
      }

      // Period toggles black cell
      if (e.key === ".") {
        e.preventDefault();
        onToggleBlack(row, col);
        return;
      }

      const stepRow = direction === "down" ? 1 : 0;
      const stepCol = direction === "across" ? 1 : 0;

      if (e.key === "Backspace") {
        e.preventDefault();
        if (cells[row][col].is_black) return;
        onLetterInput(row, col, "");
        onNavigate(-stepRow, -stepCol);
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        if (cells[row][col].is_black) return;
        onLetterInput(row, col, "");
        return;
      }

      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        if (cells[row][col].is_black) return;
        onLetterInput(row, col, e.key.toUpperCase());
        onNavigate(stepRow, stepCol);
      }
    },
    [selected, cells, onNavigate, onToggleBlack, onLetterInput, direction],
  );

  useEffect(() => {
    const el = gridRef.current;
    if (el) {
      el.addEventListener("keydown", handleKeyDown);
      return () => el.removeEventListener("keydown", handleKeyDown);
    }
  }, [handleKeyDown]);

  useEffect(() => {
    if (selected && gridRef.current) gridRef.current.focus();
  }, [selected]);

  const cellSize = size <= 5 ? 64 : 44;
  const fontSize = size <= 5 ? 24 : 18;

  // Compute clue numbers
  const cellNumbers = new Map<string, number>();
  let num = 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r]?.[c]?.is_black) continue;
      const startsAcross =
        (c === 0 || cells[r][c - 1]?.is_black) &&
        c + 1 < size &&
        !cells[r][c + 1]?.is_black;
      const startsDown =
        (r === 0 || cells[r - 1]?.[c]?.is_black) &&
        r + 1 < size &&
        !cells[r + 1]?.[c]?.is_black;
      if (startsAcross || startsDown) {
        cellNumbers.set(`${r},${c}`, num++);
      }
    }
  }

  // Cells of the current word (in the active typing direction) for highlighting.
  const wordCells = new Set<string>();
  if (selected && !cells[selected.row]?.[selected.col]?.is_black) {
    const { row, col } = selected;
    if (direction === "across") {
      let c0 = col;
      while (c0 > 0 && !cells[row][c0 - 1].is_black) c0--;
      let c1 = col;
      while (c1 < size - 1 && !cells[row][c1 + 1].is_black) c1++;
      for (let c = c0; c <= c1; c++) wordCells.add(`${row},${c}`);
    } else {
      let r0 = row;
      while (r0 > 0 && !cells[r0 - 1][col].is_black) r0--;
      let r1 = row;
      while (r1 < size - 1 && !cells[r1 + 1][col].is_black) r1++;
      for (let r = r0; r <= r1; r++) wordCells.add(`${r},${col}`);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        Typing:{" "}
        <strong>{direction === "across" ? "Across →" : "Down ↓"}</strong>
        {" — "}press Space/Tab or click the selected cell again to switch
      </div>
      <div
        ref={gridRef}
        tabIndex={0}
        style={{
          display: "inline-grid",
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
          gap: 1,
          background: "#1f2937",
          border: "2px solid #1f2937",
          borderRadius: 4,
          outline: "none",
        }}
      >
        {cells.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const isSelected = selected?.row === r && selected?.col === c;
            const number = cellNumbers.get(key);

            let bg = "white";
            if (cell.is_black) bg = "#1f2937";
            else if (isSelected) bg = "#93c5fd";
            else if (wordCells.has(key)) bg = "#dbeafe";

            return (
              <div
                key={key}
                onClick={(e) => {
                  if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    onToggleBlack(r, c);
                  } else if (isSelected && !cell.is_black) {
                    toggleDirection();
                  } else {
                    onCellClick(r, c);
                  }
                }}
              onContextMenu={(e) => {
                e.preventDefault();
                onToggleBlack(r, c);
              }}
              style={{
                width: cellSize,
                height: cellSize,
                background: bg,
                position: "relative",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
              }}
            >
              {number && !cell.is_black && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: 3,
                    fontSize: size <= 5 ? 11 : 9,
                    fontWeight: 600,
                    color: "#374151",
                    lineHeight: 1,
                  }}
                >
                  {number}
                </span>
              )}
              {!cell.is_black && (
                <span style={{ fontSize, fontWeight: 600, color: "#111827" }}>
                  {cell.letter}
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

/**
 * Scan grid to detect all across and down words.
 * Returns words with their number, position, length, and current letters.
 */
export function detectWords(
  cells: BuilderCell[][],
  size: number,
): { across: DetectedWord[]; down: DetectedWord[] } {
  const across: DetectedWord[] = [];
  const down: DetectedWord[] = [];

  let num = 1;
  const numberMap = new Map<string, number>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c].is_black) continue;
      const startsAcross =
        (c === 0 || cells[r][c - 1]?.is_black) &&
        c + 1 < size &&
        !cells[r][c + 1]?.is_black;
      const startsDown =
        (r === 0 || cells[r - 1]?.[c]?.is_black) &&
        r + 1 < size &&
        !cells[r + 1]?.[c]?.is_black;

      if (startsAcross || startsDown) {
        numberMap.set(`${r},${c}`, num);

        if (startsAcross) {
          let length = 0;
          let letters = "";
          let cc = c;
          while (cc < size && !cells[r][cc].is_black) {
            letters += cells[r][cc].letter || "?";
            length++;
            cc++;
          }
          across.push({ number: num, row: r, col: c, length, letters });
        }

        if (startsDown) {
          let length = 0;
          let letters = "";
          let rr = r;
          while (rr < size && !cells[rr][c].is_black) {
            letters += cells[rr][c].letter || "?";
            length++;
            rr++;
          }
          down.push({ number: num, row: r, col: c, length, letters });
        }

        num++;
      }
    }
  }

  return { across, down };
}

export interface DetectedWord {
  number: number;
  row: number;
  col: number;
  length: number;
  letters: string; // current letters from grid ("HE?LO" if missing some)
}
