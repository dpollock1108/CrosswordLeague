import { useState, useCallback, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import BuilderGrid, { detectWords, type BuilderCell, type DetectedWord } from "../components/BuilderGrid";
import {
  createPuzzleAdmin,
  deletePuzzleAdmin,
  generatePuzzleAdmin,
  listPuzzlesAdmin,
  publishPuzzleAdmin,
} from "../api";
import type { PuzzleAdminPublic } from "../types";

type Tab = "manual" | "ai" | "manage";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function makeEmptyGrid(size: number): BuilderCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ letter: "", is_black: false })),
  );
}

// ─── Manual Builder ─────────────────────────────────────────────────────────

function ManualBuilder({ token }: { token: string }) {
  const [puzzleType, setPuzzleType] = useState<"mini_5x5" | "medium_10x10">("mini_5x5");
  const size = puzzleType === "mini_5x5" ? 5 : 10;
  const [cells, setCells] = useState<BuilderCell[][]>(() => makeEmptyGrid(5));
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [clueTexts, setClueTexts] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [puzzleDate, setPuzzleDate] = useState(todayStr());
  const [difficulty, setDifficulty] = useState("medium");
  const [symmetry, setSymmetry] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset grid when size changes
  const handleTypeChange = (type: "mini_5x5" | "medium_10x10") => {
    setPuzzleType(type);
    const newSize = type === "mini_5x5" ? 5 : 10;
    setCells(makeEmptyGrid(newSize));
    setSelected(null);
    setClueTexts({});
  };

  const handleCellClick = useCallback((row: number, col: number) => {
    setSelected({ row, col });
  }, []);

  const handleToggleBlack = useCallback(
    (row: number, col: number) => {
      setCells((prev) => {
        const next = prev.map((r) => r.map((c) => ({ ...c })));
        const cell = next[row][col];
        cell.is_black = !cell.is_black;
        if (cell.is_black) cell.letter = "";
        // Mirror for rotational symmetry (if enabled)
        if (symmetry) {
          const mr = size - 1 - row;
          const mc = size - 1 - col;
          if (mr !== row || mc !== col) {
            next[mr][mc].is_black = cell.is_black;
            if (next[mr][mc].is_black) next[mr][mc].letter = "";
          }
        }
        return next;
      });
    },
    [size, symmetry],
  );

  const handleLetterInput = useCallback((row: number, col: number, letter: string) => {
    setCells((prev) => {
      const next = prev.map((r) => r.map((c) => ({ ...c })));
      next[row][col].letter = letter;
      return next;
    });
  }, []);

  const handleNavigate = useCallback(
    (dRow: number, dCol: number) => {
      setSelected((prev) => {
        if (!prev) return prev;
        let r = prev.row + dRow;
        let c = prev.col + dCol;
        if (r < 0 || r >= size || c < 0 || c >= size) return prev;
        // Skip black cells
        while (r >= 0 && r < size && c >= 0 && c < size && cells[r]?.[c]?.is_black) {
          r += dRow;
          c += dCol;
        }
        if (r < 0 || r >= size || c < 0 || c >= size) return prev;
        return { row: r, col: c };
      });
    },
    [size, cells],
  );

  const detected = detectWords(cells, size);

  const handleClueChange = (direction: "across" | "down", number: number, text: string) => {
    setClueTexts((prev) => ({ ...prev, [`${direction}-${number}`]: text }));
  };

  // Validation
  const validate = (): string[] => {
    const errs: string[] = [];
    const allWords = [...detected.across, ...detected.down];
    if (allWords.length === 0) {
      errs.push("No words detected. Add some letters to the grid.");
      return errs;
    }

    for (const w of allWords) {
      if (w.letters.includes("?")) {
        errs.push(`Word ${w.number} (${w.letters}) has empty cells.`);
      }
      const dir = detected.across.includes(w) ? "across" : "down";
      const clue = clueTexts[`${dir}-${w.number}`];
      if (!clue?.trim()) {
        errs.push(`Missing clue for ${w.number}-${dir.charAt(0).toUpperCase()}.`);
      }
    }
    return errs;
  };

  const handleSave = async () => {
    setError(null);
    setStatus(null);

    const errs = validate();
    if (errs.length > 0) {
      setError(errs.join(" "));
      return;
    }

    setSaving(true);
    try {
      const gridData = JSON.stringify({
        cells: cells.map((row) =>
          row.map((c) => ({ letter: c.letter.toUpperCase(), is_black: c.is_black })),
        ),
      });

      const buildClues = (words: DetectedWord[], direction: "across" | "down") =>
        words.map((w) => ({
          number: w.number,
          clue: clueTexts[`${direction}-${w.number}`]?.trim() || "",
          answer: w.letters.toUpperCase(),
          row: w.row,
          col: w.col,
          length: w.length,
        }));

      const cluesData = JSON.stringify({
        across: buildClues(detected.across, "across"),
        down: buildClues(detected.down, "down"),
      });

      const puzzle = await createPuzzleAdmin(token, {
        puzzle_type: puzzleType,
        puzzle_date: puzzleDate,
        size,
        grid_data: gridData,
        clues_data: cluesData,
        title: title || undefined,
        difficulty,
      });
      setStatus(`Puzzle #${puzzle.id} created as draft. Go to Manage to publish it.`);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Type
          <select
            value={puzzleType}
            onChange={(e) => handleTypeChange(e.target.value as any)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="mini_5x5">Mini (5×5)</option>
            <option value="medium_10x10">Medium (10×10)</option>
          </select>
        </label>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Date
          <input
            type="date"
            value={puzzleDate}
            onChange={(e) => setPuzzleDate(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Title (optional)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Puzzle title"
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", width: 200 }}
          />
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={symmetry}
            onChange={(e) => setSymmetry(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Rotational symmetry
        </label>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          (black cells auto-mirror 180°)
        </span>
      </div>

      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
        Type letters into cells. <strong>Right-click</strong> or <strong>Shift+click</strong> to toggle black cells.
        Press <strong>.</strong> (period) to toggle the selected cell.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <BuilderGrid
          size={size}
          cells={cells}
          selected={selected}
          onCellClick={handleCellClick}
          onToggleBlack={handleToggleBlack}
          onLetterInput={handleLetterInput}
          onNavigate={handleNavigate}
        />

        <div style={{ flex: "1 1 300px", maxWidth: 480 }}>
          <ClueEditor label="Across" words={detected.across} direction="across" clueTexts={clueTexts} onChange={handleClueChange} />
          <ClueEditor label="Down" words={detected.down} direction="down" clueTexts={clueTexts} onChange={handleClueChange} />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: saving ? "default" : "pointer",
            background: saving ? "#9ca3af" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
            color: "white",
          }}
        >
          {saving ? "Saving..." : "Save as Draft"}
        </button>
      </div>

      {status && <p style={{ color: "#059669", fontWeight: 600, marginTop: 8 }}>{status}</p>}
      {error && <p style={{ color: "crimson", fontWeight: 600, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function ClueEditor({
  label,
  words,
  direction,
  clueTexts,
  onChange,
}: {
  label: string;
  words: DetectedWord[];
  direction: "across" | "down";
  clueTexts: Record<string, string>;
  onChange: (direction: "across" | "down", number: number, text: string) => void;
}) {
  if (words.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#374151" }}>{label}</h4>
      {words.map((w) => (
        <div key={w.number} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span
            style={{
              minWidth: 28,
              fontWeight: 700,
              fontSize: 13,
              color: "#6b7280",
              textAlign: "right",
            }}
          >
            {w.number}.
          </span>
          <span
            style={{
              minWidth: 60,
              fontFamily: "monospace",
              fontSize: 13,
              color: w.letters.includes("?") ? "#ef4444" : "#059669",
              fontWeight: 600,
            }}
          >
            {w.letters.toUpperCase()}
          </span>
          <input
            type="text"
            placeholder="Enter clue..."
            value={clueTexts[`${direction}-${w.number}`] || ""}
            onChange={(e) => onChange(direction, w.number, e.target.value)}
            style={{
              flex: 1,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── AI Generator ───────────────────────────────────────────────────────────

function AIGenerator({ token }: { token: string }) {
  const [puzzleType, setPuzzleType] = useState("mini_5x5");
  const [puzzleDate, setPuzzleDate] = useState(todayStr());
  const [difficulty, setDifficulty] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<PuzzleAdminPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const puzzle = await generatePuzzleAdmin(token, {
        puzzle_type: puzzleType,
        puzzle_date: puzzleDate,
        difficulty,
      });
      setResult(puzzle);
    } catch (e: any) {
      setError(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!result) return;
    try {
      await publishPuzzleAdmin(token, result.id);
      setResult((prev) => prev ? { ...prev, status: "published" } : prev);
    } catch (e: any) {
      setError(e.message || "Publish failed");
    }
  };

  // Preview the generated puzzle grid
  const previewGrid = result ? (() => {
    try {
      const grid = JSON.parse(result.grid_data);
      const clues = JSON.parse(result.clues_data);
      return { grid, clues };
    } catch {
      return null;
    }
  })() : null;

  return (
    <div>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Generate a crossword puzzle using AI. The puzzle is saved as a draft — review it before publishing.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Type
          <select
            value={puzzleType}
            onChange={(e) => setPuzzleType(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="mini_5x5">Mini (5×5)</option>
          </select>
          <span style={{ display: "block", marginTop: 4, fontSize: 12, fontWeight: 400, color: "#6b7280" }}>
            10×10 auto-generation isn't available yet — use the Manual Builder.
          </span>
        </label>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Date
          <input
            type="date"
            value={puzzleDate}
            onChange={(e) => setPuzzleDate(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: generating ? "default" : "pointer",
            background: generating ? "#9ca3af" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
            color: "white",
            height: "fit-content",
          }}
        >
          {generating ? "Generating..." : "Generate Puzzle"}
        </button>
      </div>

      {generating && (
        <p style={{ color: "#6b7280", fontStyle: "italic" }}>
          AI is building the crossword — this can take 10–30 seconds...
        </p>
      )}

      {error && <p style={{ color: "crimson", fontWeight: 600 }}>{error}</p>}

      {result && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              {result.title || "Untitled"}{" "}
              <span style={{ fontSize: 13, fontWeight: 400, color: "#6b7280" }}>
                #{result.id} · {result.puzzle_type} · {result.puzzle_date}
              </span>
            </h3>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                background: result.status === "published" ? "#d1fae5" : "#fef3c7",
                color: result.status === "published" ? "#065f46" : "#92400e",
              }}
            >
              {result.status}
            </span>
          </div>

          {previewGrid && (
            <div style={{ marginTop: 12 }}>
              <PuzzlePreview
                size={result.size}
                gridData={previewGrid.grid}
                cluesData={previewGrid.clues}
              />
            </div>
          )}

          {result.status === "draft" && (
            <button
              onClick={handlePublish}
              style={{
                marginTop: 12,
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                background: "#059669",
                color: "white",
              }}
            >
              Publish
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Puzzle Preview (read-only grid + clues) ────────────────────────────────

function PuzzlePreview({
  size,
  gridData,
  cluesData,
}: {
  size: number;
  gridData: { cells: { letter: string; is_black: boolean }[][] };
  cluesData: { across: any[]; down: any[] };
}) {
  const cellSize = size <= 5 ? 48 : 32;
  const fontSize = size <= 5 ? 18 : 13;
  const cells = gridData.cells;

  // Compute numbers
  const cellNumbers = new Map<string, number>();
  let num = 1;
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
        cellNumbers.set(`${r},${c}`, num++);
      }
    }
  }

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div
        style={{
          display: "inline-grid",
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
          gap: 1,
          background: "#1f2937",
          border: "2px solid #1f2937",
          borderRadius: 4,
        }}
      >
        {cells.map((row: any[], r: number) =>
          row.map((cell: any, c: number) => {
            const key = `${r},${c}`;
            const numberLabel = cellNumbers.get(key);
            return (
              <div
                key={key}
                style={{
                  width: cellSize,
                  height: cellSize,
                  background: cell.is_black ? "#1f2937" : "white",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {numberLabel && !cell.is_black && (
                  <span
                    style={{
                      position: "absolute",
                      top: 1,
                      left: 2,
                      fontSize: size <= 5 ? 9 : 7,
                      fontWeight: 600,
                      color: "#374151",
                    }}
                  >
                    {numberLabel}
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

      <div style={{ fontSize: 13, flex: "1 1 200px" }}>
        <div style={{ marginBottom: 8 }}>
          <strong>Across</strong>
          {cluesData.across.map((c: any) => (
            <div key={c.number} style={{ margin: "2px 0", color: "#374151" }}>
              <span style={{ fontWeight: 600 }}>{c.number}.</span> {c.clue}{" "}
              <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>({c.answer})</span>
            </div>
          ))}
        </div>
        <div>
          <strong>Down</strong>
          {cluesData.down.map((c: any) => (
            <div key={c.number} style={{ margin: "2px 0", color: "#374151" }}>
              <span style={{ fontWeight: 600 }}>{c.number}.</span> {c.clue}{" "}
              <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>({c.answer})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Manage Puzzles ─────────────────────────────────────────────────────────

function PuzzleAdminPreview({ puzzle }: { puzzle: PuzzleAdminPublic }) {
  try {
    const grid = JSON.parse(puzzle.grid_data);
    const clues = JSON.parse(puzzle.clues_data);
    return <PuzzlePreview size={puzzle.size} gridData={grid} cluesData={clues} />;
  } catch {
    return <p style={{ color: "crimson" }}>Could not parse this puzzle's data.</p>;
  }
}

function ManagePuzzles({ token }: { token: string }) {
  const [puzzles, setPuzzles] = useState<PuzzleAdminPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [viewId, setViewId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string } = {};
      if (filter !== "all") params.status = filter;
      const data = await listPuzzlesAdmin(token, params);
      setPuzzles(data);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const handlePublish = async (id: number) => {
    try {
      await publishPuzzleAdmin(token, id);
      load();
    } catch (e: any) {
      setError(e.message || "Publish failed");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this draft puzzle?")) return;
    try {
      await deletePuzzleAdmin(token, id);
      load();
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Filter:</span>
        {(["all", "draft", "published"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: filter === f ? "#2563eb" : "white",
              color: filter === f ? "white" : "#374151",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "white",
            color: "#0f172a",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && <p style={{ color: "crimson", fontWeight: 600 }}>{error}</p>}

      {puzzles.length === 0 && !loading && (
        <p style={{ color: "#6b7280" }}>No puzzles found.</p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {puzzles.map((p) => (
          <div key={p.id} style={{ display: "grid", gap: 8 }}>
            <div
              className="card"
              style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}
            >
              <div>
                <strong>{p.title || "Untitled"}</strong>{" "}
                <span style={{ color: "#6b7280", fontSize: 13 }}>
                  #{p.id} · {p.puzzle_type} · {p.puzzle_date} · by {p.created_by || "unknown"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    background: p.status === "published" ? "#d1fae5" : "#fef3c7",
                    color: p.status === "published" ? "#065f46" : "#92400e",
                  }}
                >
                  {p.status}
                </span>
                <button
                  onClick={() => setViewId((id) => (id === p.id ? null : p.id))}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "white",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {viewId === p.id ? "Hide" : "View"}
                </button>
                {p.status === "draft" && (
                  <>
                    <button
                      onClick={() => handlePublish(p.id)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: "#059669",
                        color: "white",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Publish
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 6,
                        border: "1px solid #fca5a5",
                        background: "white",
                        color: "#dc2626",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            {viewId === p.id && (
              <div className="card" style={{ margin: 0, background: "#f8fafc" }}>
                <PuzzleAdminPreview puzzle={p} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PuzzleBuilder() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<Tab>("manual");

  if (!user?.is_admin || !token) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>Admin access required</h2>
        <p className="muted">You must be signed in as an admin to use the Puzzle Builder.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Puzzle Builder</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {([
          { key: "manual", label: "Manual Builder" },
          { key: "ai", label: "AI Generate" },
          { key: "manage", label: "Manage Puzzles" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: tab === t.key ? "2px solid #2563eb" : "2px solid #e5e7eb",
              background: tab === t.key ? "rgba(37,99,235,0.08)" : "white",
              color: tab === t.key ? "#1d4ed8" : "#374151",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "manual" ? (
        <ManualBuilder token={token} />
      ) : tab === "ai" ? (
        <AIGenerator token={token} />
      ) : (
        <ManagePuzzles token={token} />
      )}
    </div>
  );
}
