import type { Clue } from "../types";

interface ClueListProps {
  across: Clue[];
  down: Clue[];
  activeClue: { direction: "across" | "down"; number: number } | null;
  onClueClick: (direction: "across" | "down", clue: Clue) => void;
}

export default function ClueList({ across, down, activeClue, onClueClick }: ClueListProps) {
  const renderClues = (direction: "across" | "down", clues: Clue[]) => (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", marginBottom: 8, color: "#374151" }}>
        {direction}
      </h3>
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {clues.map((clue) => {
          const isActive = activeClue?.direction === direction && activeClue?.number === clue.number;
          return (
            <li
              key={`${direction}-${clue.number}`}
              onClick={() => onClueClick(direction, clue)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
                background: isActive ? "rgba(37,99,235,0.12)" : "transparent",
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                lineHeight: 1.4,
                transition: "background 0.15s",
              }}
            >
              <span style={{ fontWeight: 700, marginRight: 6, color: "#6b7280" }}>{clue.number}.</span>
              {clue.clue}
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <div style={{ overflowY: "auto", maxHeight: "70vh" }}>
      {renderClues("across", across)}
      {renderClues("down", down)}
    </div>
  );
}
