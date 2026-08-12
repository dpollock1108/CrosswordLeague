import type { PointerEvent } from "react";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] as const;

interface MobileKeyboardProps {
  onLetter: (letter: string) => void;
  onDelete: () => void;
}

// An on-screen keyboard for touch devices. The grid is a div, not an input, so
// tapping it can never raise the native keyboard — and even if it could, the
// native one brings autocorrect, capitalization and a viewport that jumps
// around. A purpose-built key row is predictable and always sized to fit.
//
// Keys act on pointerdown (with the default prevented) so a tap never moves
// focus off the grid, never fires the synthetic-click delay, and never
// double-tap-zooms the page.
export default function MobileKeyboard({ onLetter, onDelete }: MobileKeyboardProps) {
  const press = (fn: () => void) => (e: PointerEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <div className="kbd">
      {ROWS.map((row, i) => (
        <div className="kbd-row" key={i}>
          {i === 2 && <span className="kbd-spacer" />}
          {row.split("").map((ch) => (
            <button key={ch} type="button" className="kbd-key" onPointerDown={press(() => onLetter(ch))}>
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button
              type="button"
              className="kbd-key kbd-key-wide"
              aria-label="Delete"
              onPointerDown={press(onDelete)}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
